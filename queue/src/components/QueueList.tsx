import { useEffect, useMemo, useRef, useState } from 'react'
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
  onSwipeSign?: () => void
  onSwipeReject?: () => void
}

function QueueListItem({
  card,
  selected,
  exiting,
  onSelect,
  onExitDone,
  onSwipeSign,
  onSwipeReject,
}: QueueListItemProps) {
  const [gone, setGone] = useState(false)
  const [dragX, setDragX] = useState(0)
  const startX = useRef<number | null>(null)

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

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0]?.clientX ?? null
  }

  function onTouchMove(e: React.TouchEvent) {
    if (startX.current == null) return
    const x = e.touches[0]?.clientX ?? startX.current
    const delta = Math.max(-120, Math.min(120, x - startX.current))
    setDragX(delta)
  }

  function onTouchEnd() {
    if (dragX > 80) onSwipeSign?.()
    else if (dragX < -80) onSwipeReject?.()
    startX.current = null
    setDragX(0)
  }

  return (
    <div className="relative overflow-hidden rounded-xl">
      <div
        className="pointer-events-none absolute inset-y-0 left-0 flex w-24 items-center justify-center bg-aia-teal/80 font-mono text-[10px] font-bold uppercase text-white"
        aria-hidden
      >
        Sign
      </div>
      <div
        className="pointer-events-none absolute inset-y-0 right-0 flex w-24 items-center justify-center bg-aia-alert/80 font-mono text-[10px] font-bold uppercase text-white"
        aria-hidden
      >
        Reject
      </div>
      <button
        type="button"
        data-queue-item={card.cardId}
        onClick={onSelect}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        aria-pressed={selected}
        style={{ transform: `translateX(${dragX}px)` }}
        className={`relative z-10 flex min-h-[72px] w-full flex-col justify-center rounded-xl border p-4 text-left font-mono text-xs transition ${
          exiting
            ? 'queue-exit pointer-events-none'
            : selected
              ? 'border-aia-teal/55 bg-aia-teal/15 shadow-md shadow-aia-teal-deep/30'
              : 'border-desk-700/60 bg-desk-800/50 hover:border-aia-teal/35 hover:bg-desk-700/50'
        } ${!exiting && !selected && risk.glow ? 'critical-glow' : ''}`}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <RiskBadge level={card.payload.riskLevel} />
          <span className="text-[10px] text-slate-500">{formatClock(card.payload.timestamp)}</span>
        </div>
        <div className="mb-1 truncate text-[14px] font-semibold text-slate-100">
          {card.payload.packName}
        </div>
        <div className="truncate text-[11px] uppercase tracking-wide text-aia-teal-bright">
          {card.payload.actionType}
        </div>
        <div className="mt-1.5 text-[10px] text-slate-500">{relativeAge(card.payload.timestamp)}</div>
      </button>
    </div>
  )
}

interface QueueListProps {
  onOpenCard?: (cardId: string) => void
}

export function QueueList({ onOpenCard }: QueueListProps) {
  const cards = useQueueStore((s) => s.cards)
  const exitingCardIds = useQueueStore((s) => s.exitingCardIds)
  const selectedCardId = useQueueStore((s) => s.selectedCardId)
  const selectCard = useQueueStore((s) => s.selectCard)
  const clearExiting = useQueueStore((s) => s.clearExiting)
  const signCard = useQueueStore((s) => s.signCard)
  const rejectCard = useQueueStore((s) => s.rejectCard)

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
        <div className="mb-2 text-2xl text-aia-teal-bright/60">✓</div>
        QUEUE CLEAR
        <div className="mt-1 text-[10px] text-slate-600">All agent swarms synced</div>
      </div>
    )
  }

  return (
    <div className="space-y-3" role="listbox" aria-label="Active decision queue">
      {ordered.map((card) => (
        <QueueListItem
          key={card.cardId}
          card={card}
          selected={selectedCardId === card.cardId}
          exiting={exitingCardIds.includes(card.cardId)}
          onSelect={() => {
            selectCard(card.cardId)
            onOpenCard?.(card.cardId)
          }}
          onExitDone={() => clearExiting(card.cardId)}
          onSwipeSign={() => {
            selectCard(card.cardId)
            signCard(card.cardId)
            navigator.vibrate?.(40)
          }}
          onSwipeReject={() => {
            selectCard(card.cardId)
            rejectCard(card.cardId)
            navigator.vibrate?.(20)
          }}
        />
      ))}
    </div>
  )
}
