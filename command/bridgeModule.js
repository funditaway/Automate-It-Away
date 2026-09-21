/**
 * Web3 / domain bridge + pack-adapter helpers.
 *
 * Builds proposal cards only, normalized to the universal Active Decision
 * Card schema before the HITL queue. There is no wallet client, no RPC
 * broadcast, and no transaction signing here. A human must authorize the
 * card before the ledger records anything, and even then the daemon does
 * not broadcast.
 */
import { normalizeDecisionPayload, toUniversalDecisionCard } from './lib/decisionCard.js'

export const BRIDGE_CHAINS = [
  { id: 1, name: 'ethereum', symbol: 'ETH' },
  { id: 8453, name: 'base', symbol: 'ETH' },
]

export const DOMAIN = {
  name: 'aia',
  tld: 'aia',
  registerUrl: 'https://dns.decentraweb.org/name/aia',
  note: 'Proposal only. No broadcast. A person must authorize.',
}

const BRIDGE_META =
  'Bridge desk agent. Draft only. Never register a name, sign a wallet ' +
  'transaction, or broadcast. A human must Yes the card first.'

/**
 * Map a raw bridge / pack-adapter body into the universal decision payload.
 * Custom pack adapters should call this (or `adaptPackEvent`) before queue.add.
 */
export function buildBridgePayload(body) {
  const input = body && typeof body === 'object' ? body : {}
  const kind = input.kind === 'transfer' ? 'transfer' : 'domain'

  if (kind === 'domain') {
    const action = String(input.action || 'review')
    return normalizeDecisionPayload({
      agentId: 'agent_bridge',
      packName: 'Decentraweb',
      packId: 'bridge',
      actionType: 'BRIDGE_DOMAIN',
      riskLevel: 'high',
      targetEndpoint: DOMAIN.registerUrl,
      method: 'GET',
      summary: `Propose .aia domain action (${action}). No name is registered until you authorize — and this daemon never broadcasts.`,
      metaPrompt: BRIDGE_META,
      diffData: {
        before: { domain: DOMAIN.name, status: 'proposed' },
        after: { domain: DOMAIN.name, status: 'awaiting_human_signature', action },
      },
      source: 'bridge',
      resourceCost: { amount: '0', token: 'none' },
      nextRecommendation:
        'Confirm the domain intent on the card face, then Yes to record a signed ledger proposal. This daemon still will not broadcast.',
    })
  }

  const chainId = Number(input.chainId || 1)
  const asset = String(input.asset || 'ETH')
  const amount = String(input.amount || '0')
  const to = String(input.to || 'unspecified')
  return normalizeDecisionPayload({
    agentId: 'agent_bridge',
    packName: 'Cross-chain bridge',
    packId: 'bridge',
    actionType: 'BRIDGE_TRANSFER',
    riskLevel: 'critical',
    targetEndpoint: `bridge://chain/${chainId}`,
    method: 'POST',
    summary:
      `Cross-chain intent ${amount} ${asset} on chain ${chainId} to ${to}. ` +
      'Proposal only — nothing is signed on-chain and nothing is broadcast.',
    metaPrompt: BRIDGE_META,
    diffData: {
      before: { chainId, asset, amount, to, status: 'proposed' },
      after: { chainId, asset, amount, to, status: 'awaiting_human_signature', broadcast: false },
    },
    source: 'bridge',
    resourceCost: { amount, token: asset },
    nextRecommendation:
      'Verify chain, asset, amount, and destination. Yes only records a signed proposal — no broadcast from this daemon.',
  })
}

/**
 * Custom pack adapter entry: map an arbitrary pack event into a pending
 * universal Active Decision Card (status pending; never auto-executed).
 */
export function adaptPackEvent(pack, eventBody = {}) {
  const packName = String(pack?.name || eventBody.packName || 'Custom Pack')
  const packId = pack?.id || eventBody.packId || undefined
  const event = String(eventBody.event || eventBody.type || 'pack.event')
  const actionType =
    eventBody.actionType ||
    `PACK_${String(event)
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .toUpperCase()}`
  const targetEndpoint = String(
    eventBody.targetEndpoint ||
      eventBody.mqttTopic ||
      eventBody.endpoint ||
      `pack://${encodeURIComponent(packId || packName)}/${encodeURIComponent(event)}`,
  )
  const payload = normalizeDecisionPayload({
    agentId: String(pack?.agentId || eventBody.agentId || 'agent_pack'),
    packName,
    packId,
    actionType,
    riskLevel: eventBody.riskLevel || 'medium',
    targetEndpoint,
    method: String(eventBody.method || 'POST').toUpperCase(),
    summary:
      eventBody.summary ||
      `${packName}: ${event}. Draft only — Yes / Stop stay human.`,
    metaPrompt:
      eventBody.metaPrompt ||
      `${packName} pack adapter. Draft only. Never send, pay, arm, or broadcast without an explicit human YES.`,
    diffData: eventBody.diffData || {
      before: { event, status: 'received' },
      after: { event, status: 'pending_human_yes' },
    },
    resourceCost: eventBody.resourceCost,
    source: eventBody.source || 'pack_adapter',
    webhookEvent: event,
    nextRecommendation:
      eventBody.nextRecommendation ||
      `Review the ${packName} diff, then Yes to authorize or Stop to abort.`,
    timestamp: eventBody.timestamp,
  })
  return toUniversalDecisionCard(payload)
}

export function mountBridge(ctx) {
  ctx.app.get('/api/bridge', (_req, res) => {
    res.json({
      ok: true,
      mode: 'proposal-only',
      broadcast: false,
      domain: DOMAIN,
      chains: BRIDGE_CHAINS,
      schema: 'active-decision-card',
    })
  })

  ctx.app.post('/api/bridge/propose', (req, res) => {
    const payload = buildBridgePayload(req.body)
    const card = ctx.queue.add({ ...payload, timestamp: ctx.now() })
    res.status(202).json({
      ok: true,
      cardId: card.cardId,
      status: 'pending',
      executed: false,
      broadcast: false,
      schema: 'active-decision-card',
    })
  })

  /** Custom pack adapter: POST /api/pack/:packId/event → pending universal card */
  ctx.app.post('/api/pack/:packId/event', (req, res) => {
    const packId = String(req.params.packId || '')
    const pack = ctx.swarm?.get?.(packId) || { id: packId, name: packId, agentId: 'agent_pack' }
    const universal = adaptPackEvent(pack, { ...req.body, packId })
    const card = ctx.queue.add({ ...universal.payload, timestamp: ctx.now() })
    res.status(202).json({
      ok: true,
      cardId: card.cardId,
      status: card.status,
      executed: false,
      schema: 'active-decision-card',
    })
  })
}
