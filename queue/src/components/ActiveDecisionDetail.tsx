import type { ReactNode } from 'react'
import { CheckCircle2, ChevronLeft, GitFork, X } from 'lucide-react'
import cardUi from '../data/card_ui.json'
import { formatTimestamp } from '../lib/format'
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
  /** Mobile slide-over: show back control and thumb-zone sticky footer. */
  mobileMode?: boolean
  onClose?: () => void
}

export function ActiveDecisionDetail({
  card,
  exiting,
  onSign,
  onReject,
  onDelegate,
  mobileMode = false,
  onClose,
}: ActiveDecisionDetailProps) {
  const { payload } = card

  function handleSign() {
    navigator.vibrate?.(40)
    onSign()
  }

  return (
    <div
      className={`flex h-full min-h-0 flex-col overflow-hidden bg-desk-900 transition-all duration-300 ${
        exiting ? 'translate-x-4 opacity-0 md:translate-x-6' : 'translate-x-0 opacity-100'
      }`}
    >
      {mobileMode ? (
        <div className="flex shrink-0 items-center gap-3 border-b border-desk-700 bg-desk-800/90 px-3 py-2 pt-safe backdrop-blur">
          <button
            type="button"
            onClick={onClose}
            className="touch-target inline-flex items-center justify-center gap-1 rounded-lg border border-desk-600 bg-desk-700 px-3 font-mono text-xs font-semibold text-slate-200"
            aria-label="Back to queue"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Queue</span>
          </button>
          <RiskBadge level={payload.riskLevel} size="md" />
          <div className="min-w-0 flex-1 truncate font-mono text-xs text-slate-400">
            {payload.actionType}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="touch-target inline-flex items-center justify-center rounded-lg border border-desk-600 bg-desk-700 text-slate-300"
            aria-label="Close inspector"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-start justify-between border-b border-desk-700 bg-desk-800/40 p-6">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <RiskBadge level={payload.riskLevel} size="md" />
              <span className="font-mono text-xs text-slate-400">{payload.packName}</span>
              <span className="text-desk-500">•</span>
              <span className="font-mono text-xs text-slate-500">
                {formatTimestamp(payload.timestamp)}
              </span>
            </div>
            <h1 className="font-mono text-xl font-semibold tracking-tight text-white">
              {payload.actionType}
            </h1>
          </div>
          <div className="text-right">
            <div className="font-mono text-[10px] text-slate-500">RESOURCE COST</div>
            <div className="font-mono text-sm font-semibold text-aia-orange">
              {payload.resourceCost
                ? `${payload.resourceCost.amount} ${payload.resourceCost.token}`
                : '—'}
            </div>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 md:space-y-6 md:p-6">
        {mobileMode ? (
          <div>
            <h1 className="font-mono text-lg font-semibold tracking-tight text-white">
              {payload.actionType}
            </h1>
            <p className="mt-1 font-mono text-xs text-slate-400">{payload.packName}</p>
            <p className="mt-1 font-mono text-[10px] text-slate-500">
              {formatTimestamp(payload.timestamp)}
              {payload.resourceCost
                ? ` · ${payload.resourceCost.amount} ${payload.resourceCost.token}`
                : ''}
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          <MetaBlock label="Target Endpoint / Integration" mono>
            {payload.targetEndpoint}
          </MetaBlock>
          <MetaBlock label="Agent ID" mono>
            {payload.agentId}
          </MetaBlock>
        </div>

        <div className="rounded-lg border border-desk-700 bg-desk-800/60 p-4">
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-400">
            Execution Summary
          </div>
          <p className="text-sm leading-relaxed text-slate-300">{payload.summary}</p>
        </div>

        <DiffViewer before={payload.diffData?.before} after={payload.diffData?.after} />

        {card.signature ? (
          <div className="rounded-lg border border-aia-teal/35 bg-aia-teal/10 p-4">
            <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-teal-300">
              Signature
            </div>
            <p className="break-all font-mono text-xs text-teal-100">{card.signature}</p>
          </div>
        ) : null}
      </div>

      <div
        className={`shrink-0 border-t border-desk-700 bg-desk-800/95 backdrop-blur ${
          mobileMode
            ? 'sticky bottom-0 space-y-2 px-4 py-3 pb-safe'
            : 'flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between'
        }`}
      >
        <div className={`flex items-center gap-2 ${mobileMode ? 'w-full' : 'flex-wrap gap-3'}`}>
          <button
            type="button"
            data-queue-action="reject"
            onClick={onReject}
            className="touch-target flex flex-1 items-center justify-center gap-2 rounded-xl border border-desk-600 bg-desk-700 px-4 font-mono text-xs font-semibold text-slate-200 transition hover:border-aia-alert/50 hover:bg-aia-alert/15 hover:text-red-300 sm:flex-none"
          >
            <X className="h-4 w-4" />
            <span>
              {schema.actions.secondary.find((a) => a.id === 'reject')?.label ?? 'Reject'}
            </span>
          </button>
          <button
            type="button"
            data-queue-action="delegate"
            onClick={onDelegate}
            className="touch-target flex flex-1 items-center justify-center gap-2 rounded-xl border border-desk-600 bg-desk-700 px-4 font-mono text-xs font-semibold text-slate-200 transition hover:bg-desk-600 sm:flex-none"
          >
            <GitFork className="h-4 w-4" />
            <span>
              {schema.actions.secondary.find((a) => a.id === 'delegate')?.label ?? 'Delegate'}
            </span>
          </button>
        </div>

        <button
          type="button"
          data-queue-action="yes"
          onClick={handleSign}
          className={`group touch-target flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-aia-teal-bright to-aia-teal-deep font-mono text-xs font-bold tracking-wider text-white shadow-lg shadow-aia-teal-deep/40 transition hover:brightness-110 ${
            mobileMode ? 'w-full px-4 py-3.5 text-[13px]' : 'px-6 py-2.5'
          }`}
        >
          <CheckCircle2 className="h-4 w-4 transition-transform group-hover:scale-110" />
          <span>
            {schema.actions.primary.label}
            {mobileMode ? '' : ` [${schema.actions.primary.shortcut}]`}
          </span>
        </button>
      </div>
    </div>
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
    <div className="rounded-lg border border-desk-700 bg-desk-800/60 p-4">
      <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-slate-400">
        {label}
      </div>
      <div className={`truncate text-xs text-slate-200 ${mono ? 'font-mono' : ''}`}>{children}</div>
    </div>
  )
}
