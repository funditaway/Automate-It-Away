/**
 * Inbound telemetry gateway.
 *
 * Webhooks become pending decision cards. They do not dispatch, arm a pack,
 * or append a signed ledger line. A human still has to press YES.
 */
import { synthesizeDecision } from './grokBotPrompt.js'

function asObject(body) {
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {}
}

function suggestedEndpoint(body, fallback) {
  const suggested = body.suggestedAction
  if (suggested && typeof suggested === 'object' && suggested.endpoint) {
    const endpoint = String(suggested.endpoint)
    if (/^https?:\/\//i.test(endpoint)) return endpoint
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
    return `https://services.leadconnectorhq.com${path}`
  }
  return fallback
}

/**
 * Normalize a channel-specific body into one inbound draft.
 * Unknown channels still produce a review card rather than throwing.
 */
export function normalizeInbound(channel, body) {
  const b = asObject(body)
  if (channel === 'ghl') {
    const event = String(b.type || b.event || 'contact.create')
    const contact = asObject(b.contact || b.data)
    const contactId = String(contact.id || b.contactId || 'unknown')
    return {
      channel,
      event,
      packId: b.packId ? String(b.packId) : null,
      packName: b.packName ? String(b.packName) : 'GoHighLevel',
      actionType: b.actionType ? String(b.actionType) : null,
      summary: b.summary
        ? String(b.summary)
        : `GHL ${event} for contact ${contactId}. Authorize before any CRM write-back.`,
      targetEndpoint: suggestedEndpoint(b, `https://services.leadconnectorhq.com/contacts/${encodeURIComponent(contactId)}`),
      method: String(asObject(b.suggestedAction).method || 'PUT').toUpperCase(),
      source: 'ghl_webhook',
      diffData: {
        before: {
          contactId,
          status: contact.status || 'inbound',
          tags: Array.isArray(contact.tags) ? contact.tags : [],
        },
        after: { contactId, status: 'authorized_writeback' },
      },
      resourceCost: b.resourceCost || null,
    }
  }

  if (channel === 'smarthq') {
    const event = String(b.event || b.type || 'telemetry')
    const deviceId = String(b.deviceId || b.applianceId || 'device')
    return {
      channel,
      event,
      packId: b.packId ? String(b.packId) : 'home',
      packName: b.packName ? String(b.packName) : 'Home & family',
      actionType: b.actionType ? String(b.actionType) : `SMARTHQ_${event.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()}`,
      summary: b.summary
        ? String(b.summary)
        : `SmartHQ ${event} on ${deviceId}. Queue a review; do not change the appliance.`,
      targetEndpoint: `smarthq://devices/${encodeURIComponent(deviceId)}`,
      method: 'POST',
      source: 'smarthq',
      diffData: {
        before: { deviceId, event, state: b.state || 'reported' },
        after: { deviceId, state: 'pending_human_yes' },
      },
      resourceCost: null,
    }
  }

  const event = String(b.event || b.type || 'telemetry')
  return {
    channel: channel || 'telemetry',
    event,
    packId: b.packId ? String(b.packId) : null,
    packName: b.packName ? String(b.packName) : 'Telemetry',
    actionType: b.actionType ? String(b.actionType) : null,
    summary: b.summary ? String(b.summary) : `Telemetry ${event}. Hold for human review.`,
    targetEndpoint: b.targetEndpoint ? String(b.targetEndpoint) : `telemetry://${encodeURIComponent(event)}`,
    method: 'POST',
    source: 'telemetry',
    diffData: {
      before: { event, status: 'received' },
      after: { event, status: 'pending_human_yes' },
    },
    resourceCost: null,
  }
}

export function mountWebhooks(ctx) {
  for (const channel of ['ghl', 'smarthq', 'telemetry']) {
    ctx.app.post(`/webhook/${channel}`, (req, res) => {
      ctx.lock(async () => {
        try {
          const inbound = normalizeInbound(channel, req.body)
          const pack = ctx.swarm.match(inbound)
          const synth = await synthesizeDecision({
            inbound,
            pack,
            fetchImpl: ctx.fetchImpl,
            ...(ctx.grok || {}),
          })
          const card = ctx.queue.add({
            agentId: pack?.agentId || 'agent_unassigned',
            packName: pack?.name || inbound.packName,
            packId: pack?.id || inbound.packId,
            actionType: synth.decision.actionType,
            riskLevel: synth.decision.riskLevel,
            targetEndpoint: synth.decision.targetEndpoint || inbound.targetEndpoint,
            method: synth.decision.method || inbound.method,
            summary: synth.decision.summary,
            diffData: synth.decision.diffData,
            resourceCost: inbound.resourceCost,
            source: inbound.source,
            webhookEvent: inbound.event,
            metaPrompt: synth.metaPrompt,
            cardUi: synth.cardUi,
            body: null,
            timestamp: ctx.now(),
          })
          res.status(202).json({
            ok: true,
            cardId: card.cardId,
            status: card.status,
            executed: false,
            synthesis: synth.metaPrompt.source,
          })
        } catch (err) {
          if (!res.headersSent) {
            res.status(400).json({ ok: false, error: err.message || 'ingest failed' })
          }
        }
      }).catch((err) => {
        if (!res.headersSent) res.status(500).json({ ok: false, error: err.message || 'ingest failed' })
      })
    })
  }
}
