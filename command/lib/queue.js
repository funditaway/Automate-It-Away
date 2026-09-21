/**
 * In-memory decision-card queue.
 * Pending cards are not ledger entries. Only an explicit human
 * authorize / reject / delegate commits a signed line.
 *
 * Every enqueue goes through the universal Active Decision Card schema.
 */
import { newCardId, normalizeDecisionPayload, toUniversalDecisionCard } from './decisionCard.js'

const RISK_ORDER = { critical: 0, high: 1, medium: 2, low: 3 }

export function compareRiskThenFifo(a, b) {
  const ra = RISK_ORDER[a?.payload?.riskLevel] ?? 9
  const rb = RISK_ORDER[b?.payload?.riskLevel] ?? 9
  if (ra !== rb) return ra - rb
  return (a?.payload?.timestamp || 0) - (b?.payload?.timestamp || 0)
}

export class CardQueue {
  constructor() {
    this.cards = new Map()
  }

  add(partial) {
    const universal = toUniversalDecisionCard(partial, partial?.cardId || newCardId())
    const now = universal.payload.timestamp
    const card = {
      cardId: universal.cardId,
      status: 'pending',
      payload: normalizeDecisionPayload({ ...universal.payload, timestamp: now }),
      signature: null,
      payloadHash: null,
      createdAt: now,
      updatedAt: now,
    }
    this.cards.set(card.cardId, card)
    return card
  }

  get(cardId) {
    return this.cards.get(cardId) || null
  }

  list(status) {
    const all = [...this.cards.values()]
    const filtered = status ? all.filter((card) => card.status === status) : all
    return filtered.sort(compareRiskThenFifo)
  }

  mark(cardId, status, extra = {}) {
    const card = this.cards.get(cardId)
    if (!card) return null
    card.status = status
    card.updatedAt = Date.now()
    if (extra.signature) card.signature = extra.signature
    if (extra.payloadHash) card.payloadHash = extra.payloadHash
    return card
  }
}
