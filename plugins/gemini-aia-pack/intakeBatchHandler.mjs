import crypto from 'node:crypto'

export function normalizeInboundItem(raw, defaultCardId = 'gemini-triage-card') {
  const now = new Date().toISOString()
  const id = (raw && (raw.item_id || raw.id)) || 'Q-' + crypto.randomUUID().slice(0, 8)
  const text =
    typeof raw === 'string'
      ? raw
      : (raw && (raw.text || raw.body || raw.message)) || JSON.stringify(raw ?? {})

  return {
    item_id: String(id),
    status: 'queued',
    card_id: (raw && raw.card_id) || defaultCardId,
    priority: (raw && raw.priority) || 'medium',
    payload: {
      source: (raw && raw.source) || 'webhook',
      channel: (raw && raw.channel) || 'unknown',
      text,
      metadata: (raw && raw.metadata) || {},
    },
    routing: {
      queue_name: null,
      next_card_id: null,
      confidence: null,
    },
    extracted_entities: {},
    draft_output: null,
    error: null,
    updated_at: now,
  }
}

export function normalizeBatch(records = [], defaultCardId = 'gemini-triage-card') {
  if (!Array.isArray(records)) {
    throw new TypeError('Expected an array of inbound records')
  }
  return records.map((rec) => normalizeInboundItem(rec, defaultCardId))
}
