import type { ReactNode } from 'react'
import { CheckCircle2, GitFork, X } from 'lucide-react'
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
    <div
      className={`flex h-full min-h-0 flex-col overflow-hidden transition-all duration-300 ${
        exiting ? 'translate-x-6 opacity-0' : 'translate-x-0 opacity-100'
      }`}
    >
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
          <div className="font-mono text-sm font-semibold text-indigo-400">
            {payload.resourceCost
              ? `${payload.resourceCost.amount} ${payload.resourceCost.token}`
              : '—'}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
            <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-emerald-400">
              Signature
            </div>
            <p className="break-all font-mono text-xs text-emerald-200">{card.signature}</p>
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col gap-3 border-t border-desk-700 bg-desk-800/80 p-5 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-queue-action="reject"
            onClick={onReject}
            className="flex items-center gap-2 rounded-lg border border-desk-600 bg-desk-700 px-4 py-2 font-mono text-xs font-medium text-slate-300 transition hover:border-rose-900/50 hover:bg-rose-950/40 hover:text-rose-400"
          >
            <X className="h-4 w-4" />
            <span>
              {schema.actions.secondary.find((a) => a.id === 'reject')?.label ?? 'Reject & Abort'}
            </span>
          </button>
          <button
            type="button"
            data-queue-action="delegate"
            onClick={onDelegate}
            className="flex items-center gap-2 rounded-lg border border-desk-600 bg-desk-700 px-4 py-2 font-mono text-xs font-medium text-slate-300 transition hover:bg-desk-600"
          >
            <GitFork className="h-4 w-4" />
            <span>
              {schema.actions.secondary.find((a) => a.id === 'delegate')?.label ??
                'Delegate to Sub-Agent'}
            </span>
          </button>
        </div>

        <button
          type="button"
          data-queue-action="yes"
          onClick={onSign}
          className="group flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-2.5 font-mono text-xs font-bold tracking-wider text-white shadow-lg shadow-emerald-900/40 transition hover:bg-emerald-500"
        >
          <CheckCircle2 className="h-4 w-4 transition-transform group-hover:scale-110" />
          <span>
            {schema.actions.primary.label} [{schema.actions.primary.shortcut}]
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
