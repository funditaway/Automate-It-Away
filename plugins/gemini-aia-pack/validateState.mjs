const VALID_STATUSES = new Set([
  'queued',
  'processing',
  'needs_review',
  'ready',
  'completed',
  'failed',
])

const VALID_PRIORITIES = new Set(['low', 'medium', 'high', 'urgent'])

const VALID_AUDIT_EVENTS = new Set([
  'card_executed',
  'routed_to_review',
  'auto_advanced',
  'draft_approved',
  'card_failed',
])

export function validateQueueItemState(item) {
  const errors = []

  if (!item || typeof item !== 'object') {
    return { valid: false, errors: ['Queue item must be an object'] }
  }
  if (typeof item.item_id !== 'string' || item.item_id.trim() === '') {
    errors.push('Missing or invalid item_id')
  }
  if (!VALID_STATUSES.has(item.status)) {
    errors.push('Invalid status: ' + String(item.status))
  }
  if (typeof item.card_id !== 'string' || item.card_id.trim() === '') {
    errors.push('Missing or invalid card_id')
  }
  if (item.priority !== undefined && !VALID_PRIORITIES.has(item.priority)) {
    errors.push('Invalid priority: ' + String(item.priority))
  }
  if (typeof item.updated_at !== 'string' || Number.isNaN(Date.parse(item.updated_at))) {
    errors.push('Missing or invalid updated_at ISO timestamp')
  }

  const conf = item.routing && item.routing.confidence
  if (conf !== undefined && conf !== null) {
    if (typeof conf !== 'number' || Number.isNaN(conf) || conf < 0 || conf > 1) {
      errors.push('routing.confidence must be a number between 0 and 1')
    }
  }

  return { valid: errors.length === 0, errors }
}

export function validateAuditLogEntry(entry) {
  const errors = []

  if (!entry || typeof entry !== 'object') {
    return { valid: false, errors: ['Audit entry must be an object'] }
  }
  if (typeof entry.event_id !== 'string' || entry.event_id.trim() === '') {
    errors.push('Missing or invalid event_id')
  }
  if (typeof entry.item_id !== 'string' || entry.item_id.trim() === '') {
    errors.push('Missing or invalid item_id')
  }
  if (typeof entry.card_id !== 'string' || entry.card_id.trim() === '') {
    errors.push('Missing or invalid card_id')
  }
  if (!VALID_AUDIT_EVENTS.has(entry.event_type)) {
    errors.push('Invalid event_type: ' + String(entry.event_type))
  }
  if (typeof entry.timestamp !== 'string' || Number.isNaN(Date.parse(entry.timestamp))) {
    errors.push('Missing or invalid timestamp ISO string')
  }

  return { valid: errors.length === 0, errors }
}
