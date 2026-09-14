import { create } from 'zustand'
import { SEED_CARDS, SIMULATE_TEMPLATES } from '../data/seedCards'
import { shortLedgerHash } from '../lib/format'
import { compareRiskThenFifo } from '../lib/risk'
import { generateMockSignature, payloadDigest } from '../lib/signature'
import type { ActiveDecisionCard, AuditEvent, DecisionCardPayload } from '../types'

function sortQueue(cards: ActiveDecisionCard[]): ActiveDecisionCard[] {
  return [...cards].sort((a, b) =>
    compareRiskThenFifo(
      a.payload.riskLevel,
      a.payload.timestamp,
      b.payload.riskLevel,
      b.payload.timestamp,
    ),
  )
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function pushAudit(
  log: AuditEvent[],
  event: Omit<AuditEvent, 'id' | 'at'> & { at?: number },
): AuditEvent[] {
  return [
    {
      id: nextId('audit'),
      at: event.at ?? Date.now(),
      ...event,
    },
    ...log,
  ].slice(0, 40)
}

export interface QueueStore {
  cards: ActiveDecisionCard[]
  selectedCardId: string | null
  exitingCardIds: string[]
  auditLog: AuditEvent[]
  ledgerHash: string
  enqueueCard: (payload: DecisionCardPayload, cardId?: string) => string
  selectCard: (cardId: string | null) => void
  signCard: (cardId: string) => string | null
  rejectCard: (cardId: string) => void
  delegateCard: (cardId: string) => void
  clearExiting: (cardId: string) => void
  simulateEvent: () => string
  pendingCards: () => ActiveDecisionCard[]
  selectedCard: () => ActiveDecisionCard | null
}

export const useQueueStore = create<QueueStore>((set, get) => ({
  cards: sortQueue(SEED_CARDS),
  selectedCardId: SEED_CARDS[0]?.cardId ?? null,
  exitingCardIds: [],
  auditLog: [],
  ledgerHash: shortLedgerHash(),

  pendingCards: () =>
    sortQueue(
      get().cards.filter((c) => c.status === 'pending' || get().exitingCardIds.includes(c.cardId)),
    ),

  selectedCard: () => {
    const { selectedCardId, cards } = get()
    if (!selectedCardId) return null
    return cards.find((c) => c.cardId === selectedCardId) ?? null
  },

  enqueueCard: (payload, cardId) => {
    const id = cardId ?? nextId('card')
    const card: ActiveDecisionCard = { cardId: id, status: 'pending', payload }
    set((state) => ({
      cards: sortQueue([...state.cards, card]),
      selectedCardId: state.selectedCardId ?? id,
      ledgerHash: shortLedgerHash(),
      auditLog: pushAudit(state.auditLog, {
        cardId: id,
        action: 'enqueued',
        detail: `Enqueued ${payload.actionType} (${payload.riskLevel})`,
      }),
    }))
    return id
  },

  selectCard: (cardId) => set({ selectedCardId: cardId }),

  signCard: (cardId) => {
    const card = get().cards.find((c) => c.cardId === cardId)
    if (!card || card.status !== 'pending') return null
    if (get().exitingCardIds.includes(cardId)) return null

    const signature = generateMockSignature(cardId, payloadDigest(card.payload))
    const pending = sortQueue(
      get().cards.filter(
        (c) =>
          c.cardId !== cardId && c.status === 'pending' && !get().exitingCardIds.includes(c.cardId),
      ),
    )
    const nextSelected = pending[0]?.cardId ?? null

    set((state) => ({
      cards: state.cards.map((c) =>
        c.cardId === cardId ? { ...c, status: 'signed' as const, signature } : c,
      ),
      exitingCardIds: [...state.exitingCardIds, cardId],
      selectedCardId: state.selectedCardId === cardId ? nextSelected : state.selectedCardId,
      ledgerHash: shortLedgerHash(Date.now() ^ cardId.length),
      auditLog: pushAudit(state.auditLog, {
        cardId,
        action: 'signed',
        signature,
        detail: `Signed ${card.payload.actionType} → ${signature.slice(0, 18)}…`,
      }),
    }))
    console.info('[AIA audit] signed', { cardId, signature, action: card.payload.actionType })
    return signature
  },

  rejectCard: (cardId) => {
    const card = get().cards.find((c) => c.cardId === cardId)
    if (!card || card.status !== 'pending') return
    if (get().exitingCardIds.includes(cardId)) return

    const pending = sortQueue(
      get().cards.filter(
        (c) =>
          c.cardId !== cardId && c.status === 'pending' && !get().exitingCardIds.includes(c.cardId),
      ),
    )
    const nextSelected = pending[0]?.cardId ?? null

    set((state) => ({
      cards: state.cards.map((c) =>
        c.cardId === cardId ? { ...c, status: 'rejected' as const } : c,
      ),
      exitingCardIds: [...state.exitingCardIds, cardId],
      selectedCardId: state.selectedCardId === cardId ? nextSelected : state.selectedCardId,
      ledgerHash: shortLedgerHash(),
      auditLog: pushAudit(state.auditLog, {
        cardId,
        action: 'rejected',
        detail: `Rejected ${card.payload.actionType}`,
      }),
    }))
    console.info('[AIA audit] rejected', { cardId, action: card.payload.actionType })
  },

  delegateCard: (cardId) => {
    const card = get().cards.find((c) => c.cardId === cardId)
    if (!card || card.status !== 'pending') return
    if (get().exitingCardIds.includes(cardId)) return

    const pending = sortQueue(
      get().cards.filter(
        (c) =>
          c.cardId !== cardId && c.status === 'pending' && !get().exitingCardIds.includes(c.cardId),
      ),
    )
    const nextSelected = pending[0]?.cardId ?? null

    set((state) => ({
      cards: state.cards.map((c) =>
        c.cardId === cardId ? { ...c, status: 'delegated' as const } : c,
      ),
      exitingCardIds: [...state.exitingCardIds, cardId],
      selectedCardId: state.selectedCardId === cardId ? nextSelected : state.selectedCardId,
      ledgerHash: shortLedgerHash(),
      auditLog: pushAudit(state.auditLog, {
        cardId,
        action: 'delegated',
        detail: `Delegated ${card.payload.actionType}`,
      }),
    }))
    console.info('[AIA audit] delegated', { cardId, action: card.payload.actionType })
  },

  clearExiting: (cardId) =>
    set((state) => ({
      exitingCardIds: state.exitingCardIds.filter((id) => id !== cardId),
      cards: state.cards.filter((c) => c.cardId !== cardId || c.status === 'pending'),
    })),

  simulateEvent: () => {
    const sample = SIMULATE_TEMPLATES[Math.floor(Math.random() * SIMULATE_TEMPLATES.length)]
    const payload: DecisionCardPayload = {
      agentId: `agent_${Math.random().toString(36).slice(2, 8)}`,
      packName: sample.packName,
      actionType: sample.actionType,
      riskLevel: sample.riskLevel,
      targetEndpoint: sample.targetEndpoint,
      summary: sample.summary,
      diffData: {
        before: { state: 'idle', approvalRequired: true },
        after: { state: 'executing', signatureValidated: false },
      },
      resourceCost: { amount: (Math.random() * 0.05).toFixed(3), token: 'ETH' },
      timestamp: Date.now(),
    }
    return get().enqueueCard(payload)
  },
}))
