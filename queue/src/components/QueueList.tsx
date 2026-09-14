import { useEffect, useMemo, useState } from 'react'
import { formatClock, relativeAge } from '../lib/format'
import { compareRiskThenFifo, RISK_STYLES } from '../lib/risk'
import { useQueueStore } from '../store/useQueueStore'
import type { ActiveDecisionCard } from '../types'
import { RiskBadge } from './RiskBadge'

interface QueueListItemProps {
  card: ActiveDecisionCard
  selected: boolean
  exiting: boolean
  onSelect: () => void
  onExitDone: () => void
}

function QueueListItem({ card, selected, exiting, onSelect, onExitDone }: QueueListItemProps) {
  const [gone, setGone] = useState(false)

  useEffect(() => {
    if (!exiting) return
    const t = window.setTimeout(() => {
      setGone(true)
      onExitDone()
    }, 280)
    return () => window.clearTimeout(t)
  }, [exiting, onExitDone])

  if (gone) return null

  const risk = RISK_STYLES[card.payload.riskLevel]

  return (
    <button
      type="button"
      data-queue-item={card.cardId}
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full rounded-xl border p-3.5 text-left font-mono text-xs transition ${
        exiting
          ? 'queue-exit pointer-events-none'
          : selected
            ? 'border-indigo-500/50 bg-desk-700/80 shadow-md shadow-indigo-950/50'
            : 'border-desk-700/60 bg-desk-800/40 hover:border-desk-600 hover:bg-desk-700/40'
      } ${!exiting && !selected && risk.glow ? 'critical-glow' : ''}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <RiskBadge level={card.payload.riskLevel} />
        <span className="text-[10px] text-slate-500">{formatClock(card.payload.timestamp)}</span>
      </div>
      <div className="mb-1 truncate font-semibold text-slate-200">{card.payload.packName}</div>
      <div className="truncate text-[11px] text-slate-400">{card.payload.actionType}</div>
      <div className="mt-1.5 text-[10px] text-slate-600">{relativeAge(card.payload.timestamp)}</div>
    </button>
  )
}

export function QueueList() {
  const cards = useQueueStore((s) => s.cards)
  const exitingCardIds = useQueueStore((s) => s.exitingCardIds)
  const selectedCardId = useQueueStore((s) => s.selectedCardId)
  const selectCard = useQueueStore((s) => s.selectCard)
  const clearExiting = useQueueStore((s) => s.clearExiting)

  const ordered = useMemo(
    () =>
      cards
        .filter((c) => c.status === 'pending' || exitingCardIds.includes(c.cardId))
        .slice()
        .sort((a, b) =>
          compareRiskThenFifo(
            a.payload.riskLevel,
            a.payload.timestamp,
            b.payload.riskLevel,
            b.payload.timestamp,
          ),
        ),
    [cards, exitingCardIds],
  )

  if (ordered.length === 0) {
    return (
      <div className="py-12 text-center font-mono text-xs text-slate-500">
        <div className="mb-2 text-2xl text-emerald-500/50">✓</div>
        QUEUE CLEAR
        <div className="mt-1 text-[10px] text-slate-600">All agent swarms synced</div>
      </div>
    )
  }

  return (
    <div className="space-y-2.5" role="listbox" aria-label="Active decision queue">
      {ordered.map((card) => (
        <QueueListItem
          key={card.cardId}
          card={card}
          selected={selectedCardId === card.cardId}
          exiting={exitingCardIds.includes(card.cardId)}
          onSelect={() => selectCard(card.cardId)}
          onExitDone={() => clearExiting(card.cardId)}
        />
      ))}
    </div>
  )
}
