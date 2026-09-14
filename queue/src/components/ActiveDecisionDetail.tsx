import type { ReactNode } from 'react'
import cardUi from '../data/card_ui.json'
import { agentDisplayName, formatTimestamp } from '../lib/format'
import type { ActiveDecisionCard, CardUiSchema } from '../types'
import { DiffViewer } from './DiffViewer'
import { RiskBadge } from './RiskBadge'

const schema = cardUi as CardUiSchema

interface ActiveDecisionDetailProps {
  card: ActiveDecisionCard
  exiting: boolean
  onSign: () => void
  onReject: () => void
  onDelegate: () => void
}

export function ActiveDecisionDetail({
  card,
  exiting,
  onSign,
  onReject,
  onDelegate,
}: ActiveDecisionDetailProps) {
  const { payload } = card

  return (
    <article
      className={`flex h-full min-h-0 flex-col transition-all duration-300 ease-out ${
        exiting ? 'translate-x-8 opacity-0' : 'translate-x-0 opacity-100'
      }`}
    >
      <header className="border-b border-[var(--line)] pb-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-teal-400/80">
          {schema.title}
        </p>
        <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[var(--ink)] md:text-3xl">
          {agentDisplayName(payload.agentId)}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
          {schema.subtitle}
        </p>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto py-5 pr-1">
        <div className="flex flex-wrap items-center gap-2">
          <RiskBadge level={payload.riskLevel} size="md" />
          <span className="rounded-md bg-black/30 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-teal-200/90 ring-1 ring-[var(--line)]">
            {payload.actionType}
          </span>
          <span className="rounded-md bg-black/20 px-2.5 py-1 text-[12px] text-[var(--muted)] ring-1 ring-[var(--line)]">
            Pack · {payload.packName}
          </span>
        </div>

        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
            Summary
          </h3>
          <p className="text-[15px] leading-relaxed text-[var(--ink)]">{payload.summary}</p>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <MetaBlock label="Target endpoint" mono>
            {payload.targetEndpoint}
          </MetaBlock>
          <MetaBlock label="Queued">{formatTimestamp(payload.timestamp)}</MetaBlock>
          {payload.resourceCost ? (
            <MetaBlock label="Resource cost" mono>
              {payload.resourceCost.amount} {payload.resourceCost.token}
            </MetaBlock>
          ) : null}
          <MetaBlock label="Card id" mono>
            {card.cardId}
          </MetaBlock>
        </section>

        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
            Payload diff
          </h3>
          <DiffViewer before={payload.diffData?.before} after={payload.diffData?.after} />
        </section>

        {card.signature ? (
          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              Signature
            </h3>
            <p className="break-all rounded-xl border border-teal-500/30 bg-teal-500/10 px-3 py-2 font-mono text-[12px] text-teal-200">
              {card.signature}
            </p>
          </section>
        ) : null}
      </div>

      <footer className="sticky bottom-0 border-t border-[var(--line)] bg-[var(--panel)]/95 pt-4 backdrop-blur-md">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-[11px] text-[var(--muted)]">
            Shortcut{' '}
            <kbd className="rounded border border-[var(--line)] bg-black/40 px-1.5 py-0.5 text-[var(--ink)]">
              {schema.actions.primary.shortcut}
            </kbd>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onDelegate}
              className="rounded-xl border border-[var(--line)] bg-transparent px-4 py-2.5 text-sm font-semibold text-[var(--muted)] transition hover:border-sky-400/40 hover:text-sky-200"
            >
              {schema.actions.secondary.find((a) => a.id === 'delegate')?.label ?? 'Delegate'}
            </button>
            <button
              type="button"
              onClick={onReject}
              className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20"
            >
              {schema.actions.secondary.find((a) => a.id === 'reject')?.label ?? 'Reject'}
            </button>
            <button
              type="button"
              onClick={onSign}
              className="yes-btn rounded-xl bg-gradient-to-br from-teal-400 to-teal-600 px-5 py-2.5 text-sm font-bold text-[#042f2e] shadow-[0_10px_28px_rgba(13,107,107,0.35)] transition hover:brightness-110 active:scale-[0.98]"
            >
              {schema.actions.primary.label}
            </button>
          </div>
        </div>
      </footer>
    </article>
  )
}

function MetaBlock({
  label,
  children,
  mono,
}: {
  label: string
  children: ReactNode
  mono?: boolean
}) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-deep)] px-3.5 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
        {label}
      </p>
      <p
        className={`mt-1.5 break-all text-[13px] text-[var(--ink)] ${mono ? 'font-mono text-[12px]' : ''}`}
      >
        {children}
      </p>
    </div>
  )
}
