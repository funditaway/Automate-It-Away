import type { DecisionCardPayload } from './types.js'
import type { VaultDb } from './db.js'

export const GHL_API_BASE = 'https://services.leadconnectorhq.com'

export interface GhlDispatchOptions {
  /** When true (default in tests), do not call the live GHL network. */
  dryRun?: boolean
  fetchImpl?: typeof fetch
}

export interface GhlDispatchResult {
  ok: boolean
  dryRun: boolean
  status: number
  url: string
  body?: unknown
  error?: string
}

function normalizeEndpoint(target: string): string {
  if (/^https?:\/\//i.test(target)) return target
  const path = target.startsWith('/') ? target : `/${target}`
  return `${GHL_API_BASE}${path}`
}

export function riskForGhlEvent(event: string): DecisionCardPayload['riskLevel'] {
  const e = event.toLowerCase()
  if (/delete|purge|destroy/.test(e)) return 'critical'
  if (/contact|opportunity|pipeline|stage|appointment/.test(e)) return 'high'
  if (/tag|note|task/.test(e)) return 'medium'
  return 'low'
}

export function cardFromGhlWebhook(
  body: Record<string, unknown>,
  agentId = 'agent_ghl_inbound',
): DecisionCardPayload {
  const event = String(body.type || body.event || body.webhookId || 'ghl.contact.created')
  const contact = (body.contact || body.data || body) as Record<string, unknown>
  const contactId = String(contact.id || contact.contactId || body.contactId || 'unknown')
  const locationId = String(body.locationId || contact.locationId || '')
  const outboundPath =
    typeof body.suggestedAction === 'object' && body.suggestedAction
      ? String((body.suggestedAction as { endpoint?: string }).endpoint || `/contacts/${contactId}`)
      : `/contacts/${contactId}`

  const suggested = (body.suggestedAction || {
    method: 'PUT',
    endpoint: outboundPath,
    body: {
      tags: Array.isArray(contact.tags) ? contact.tags : ['aia-reviewed'],
      source: 'aia-local-bridge',
    },
  }) as { method?: string; endpoint?: string; body?: unknown }

  return {
    agentId,
    packName: String(body.packName || 'GoHighLevel Lead Nurture Pack'),
    actionType: String(body.actionType || `GHL_${event}`.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase()),
    riskLevel: riskForGhlEvent(event),
    targetEndpoint: normalizeEndpoint(suggested.endpoint || outboundPath),
    method: (suggested.method || 'PUT').toUpperCase(),
    body: suggested.body,
    summary: String(
      body.summary ||
        `GHL ${event}: review and authorize write-back for contact ${contactId}` +
          (locationId ? ` @ ${locationId}` : ''),
    ),
    diffData: {
      before: {
        contactId,
        status: contact.status || 'inbound',
        tags: contact.tags || [],
      },
      after: {
        contactId,
        status: 'authorized_writeback',
        action: suggested,
      },
    },
    source: 'ghl_webhook',
    webhookEvent: event,
    timestamp: Date.now(),
  }
}

export async function dispatchToGhl(
  vault: VaultDb,
  payload: DecisionCardPayload,
  opts: GhlDispatchOptions = {},
): Promise<GhlDispatchResult> {
  const dryRun = opts.dryRun ?? process.env.AIA_GHL_DRY_RUN !== '0'
  const url = normalizeEndpoint(payload.targetEndpoint)
  const method = (payload.method || 'POST').toUpperCase()
  const token = vault.getCredential('gohighlevel') || vault.getCredential('ghl') || vault.getCredential('GHL_API_KEY')

  if (!token && !dryRun) {
    return { ok: false, dryRun: false, status: 401, url, error: 'No GHL credential in local vault' }
  }

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      status: 202,
      url,
      body: {
        dryRun: true,
        method,
        headers: { Authorization: token ? 'Bearer ***' : 'missing' },
        payload: payload.body ?? null,
      },
    }
  }

  const fetchImpl = opts.fetchImpl || fetch
  try {
    const res = await fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Version: '2021-07-28',
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(payload.headers || {}),
      },
      body: method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify(payload.body ?? {}),
    })
    const text = await res.text()
    let parsed: unknown = text
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      /* keep text */
    }
    return { ok: res.ok, dryRun: false, status: res.status, url, body: parsed }
  } catch (err) {
    return {
      ok: false,
      dryRun: false,
      status: 0,
      url,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
