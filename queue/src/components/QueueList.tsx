import { useEffect, useMemo, useState } from 'react'
import { agentDisplayName, formatTimestamp, relativeAge } from '../lib/format'
import { compareRiskThenFifo } from '../lib/risk'
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
    }, 320)
    return () => window.clearTimeout(t)
  }, [exiting, onExitDone])

  if (gone) return null

  return (
    <button
      type="button"
      data-queue-item={card.cardId}
      onClick={onSelect}
      aria-pressed={selected}
      className={`group relative w-full rounded-xl border px-3.5 py-3 text-left transition-all duration-300 ease-out ${
        exiting
          ? 'pointer-events-none translate-x-6 opacity-0'
          : selected
            ? 'border-teal-400/50 bg-teal-500/10 shadow-[0_0_0_1px_rgba(45,212,191,0.18)]'
            : 'border-[var(--line)] bg-[var(--panel)] hover:border-teal-500/30 hover:bg-[var(--panel-hover)]'
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="font-[family-name:var(--font-display)] text-[15px] font-semibold tracking-tight text-[var(--ink)]">
          {agentDisplayName(card.payload.agentId)}
        </span>
        <RiskBadge level={card.payload.riskLevel} />
      </div>
      <p className="truncate font-mono text-[11px] uppercase tracking-[0.06em] text-teal-300/80">
        {card.payload.actionType}
      </p>
      <p
        className="mt-1.5 text-[12px] text-[var(--muted)]"
        title={formatTimestamp(card.payload.timestamp)}
      >
        {relativeAge(card.payload.timestamp)} · {card.payload.packName}
      </p>
    </button>
  )
}

export function QueueList() {
  const cards = useQueueStore((s) => s.cards)
  const exitingCardIds = useQueueStore((s) => s.exitingCardIds)
  const selectedCardId = useQueueStore((s) => s.selectedCardId)
  const selectCard = useQueueStore((s) => s.selectCard)
  const clearExiting = useQueueStore((s) => s.clearExiting)

  const ordered = useMemo(() => {
    return cards
      .filter((c) => c.status === 'pending' || exitingCardIds.includes(c.cardId))
      .slice()
      .sort((a, b) =>
        compareRiskThenFifo(
          a.payload.riskLevel,
          a.payload.timestamp,
          b.payload.riskLevel,
          b.payload.timestamp,
        ),
      )
  }, [cards, exitingCardIds])

  if (ordered.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--panel)]/60 px-4 py-10 text-center">
        <p className="font-[family-name:var(--font-display)] text-lg text-[var(--ink)]">
          Queue clear
        </p>
        <p className="mt-1 text-sm text-[var(--muted)]">No pending decisions. Agents idle.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2.5" role="listbox" aria-label="Decision queue">
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
