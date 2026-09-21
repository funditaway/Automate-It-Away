/**
 * Universal Active Decision Card schema.
 *
 * Every webhook, telemetry event, bridge proposal, and pack adapter must
 * normalize through `toUniversalDecisionCard` before the HITL queue.
 * Pending cards never auto-execute.
 */
import { randomBytes } from 'node:crypto'

export const RISK_LEVELS = Object.freeze(['low', 'medium', 'high', 'critical'])

const RISK_SET = new Set(RISK_LEVELS)

/** Hex card id (32 chars). Used for every new HITL card. */
export function newCardId() {
  return randomBytes(16).toString('hex')
}

export function clampRisk(level, fallback = 'medium') {
  const value = String(level || '').toLowerCase()
  if (RISK_SET.has(value)) return value
  return RISK_SET.has(fallback) ? fallback : 'medium'
}

/**
 * Universal schema stores metaPrompt as a string.
 * Structured synthesizer objects are flattened for the queue face.
 */
export function metaPromptToString(meta) {
  if (meta == null) return ''
  if (typeof meta === 'string') return meta.trim()
  if (typeof meta !== 'object') return String(meta)
  const lines = []
  if (meta.source) lines.push(`source: ${meta.source}`)
  if (meta.templateId) lines.push(`template: ${meta.templateId}`)
  if (meta.systemPrompt) lines.push(String(meta.systemPrompt).trim())
  if (meta.agentInstructions) {
    if (lines.length) lines.push('')
    lines.push(String(meta.agentInstructions).trim())
  }
  if (Array.isArray(meta.constraints) && meta.constraints.length) {
    lines.push('', 'constraints:')
    for (const line of meta.constraints) lines.push(`- ${line}`)
  }
  return lines.join('\n').trim()
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function normalizeDiff(diffData) {
  const diff = asRecord(diffData)
  return {
    before: asRecord(diff.before),
    after: asRecord(diff.after),
  }
}

function normalizeResourceCost(cost) {
  if (!cost || typeof cost !== 'object') return { amount: '0', token: 'none' }
  return {
    amount: String(cost.amount ?? '0'),
    token: String(cost.token ?? 'none'),
  }
}

/**
 * Normalize any partial / channel-specific payload into the universal
 * Decision Card payload fields required before HITL enqueue.
 */
export function normalizeDecisionPayload(partial = {}) {
  const input = asRecord(partial)
  const riskLevel = clampRisk(input.riskLevel, 'medium')
  const targetEndpoint = String(input.targetEndpoint || '').trim()
  if (!targetEndpoint) {
    throw new Error('targetEndpoint is required (URL or MQTT / pack topic)')
  }
  const agentId = String(input.agentId || '').trim()
  if (!agentId) throw new Error('agentId is required')
  const packName = String(input.packName || '').trim()
  if (!packName) throw new Error('packName is required')
  const actionType = String(input.actionType || '').trim()
  if (!actionType) throw new Error('actionType is required')
  const summary = String(input.summary || '').trim()
  if (!summary) throw new Error('summary is required')

  const payload = {
    agentId,
    packName,
    actionType,
    riskLevel,
    targetEndpoint,
    summary,
    metaPrompt: metaPromptToString(input.metaPrompt),
    diffData: normalizeDiff(input.diffData),
    resourceCost: normalizeResourceCost(input.resourceCost),
    timestamp: Number(input.timestamp) || Date.now(),
    nextRecommendation: String(
      input.nextRecommendation ||
        'Review the diff, then Yes to authorize or Stop to abort. Nothing runs until a human confirms.',
    ).trim(),
  }

  // Optional runtime enrichment — never replace universal keys.
  for (const key of [
    'method',
    'body',
    'headers',
    'packId',
    'source',
    'webhookEvent',
    'cardUi',
    'parentCardId',
    'recommendationKind',
  ]) {
    if (input[key] !== undefined && payload[key] === undefined) {
      payload[key] = input[key]
    }
  }

  return payload
}

/**
 * Build a pending Active Decision Card in the universal schema.
 * @returns {{ cardId: string, status: 'pending', payload: object }}
 */
export function toUniversalDecisionCard(partial = {}, cardId) {
  const id = cardId || (partial.cardId ? String(partial.cardId) : newCardId())
  if (!/^[0-9a-f]+$/i.test(id)) {
    throw new Error('cardId must be hex')
  }
  return {
    cardId: id.toLowerCase(),
    status: 'pending',
    payload: normalizeDecisionPayload(partial.payload || partial),
  }
}

/** Soft check used by tests and pack adapters. */
export function isUniversalDecisionCard(card) {
  if (!card || typeof card !== 'object') return false
  if (!/^[0-9a-f]+$/i.test(String(card.cardId || ''))) return false
  if (card.status !== 'pending' && card.status !== 'signed' && card.status !== 'rejected' && card.status !== 'delegated') {
    return false
  }
  const p = card.payload
  if (!p || typeof p !== 'object') return false
  if (typeof p.metaPrompt !== 'string') return false
  if (typeof p.nextRecommendation !== 'string') return false
  if (!RISK_SET.has(p.riskLevel)) return false
  if (!p.agentId || !p.packName || !p.actionType || !p.targetEndpoint || !p.summary) return false
  if (typeof p.timestamp !== 'number') return false
  if (!p.diffData || typeof p.diffData.before !== 'object' || typeof p.diffData.after !== 'object') return false
  if (!p.resourceCost || typeof p.resourceCost.amount !== 'string' || typeof p.resourceCost.token !== 'string') {
    return false
  }
  return true
}
