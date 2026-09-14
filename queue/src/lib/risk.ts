import type { RiskLevel } from '../types'

export const RISK_ORDER: Record<RiskLevel, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

export const RISK_STYLES: Record<
  RiskLevel,
  { label: string; className: string; pip: string }
> = {
  critical: {
    label: 'Critical',
    className: 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/40',
    pip: 'bg-rose-400',
  },
  high: {
    label: 'High',
    className: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/40',
    pip: 'bg-amber-400',
  },
  medium: {
    label: 'Medium',
    className: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/35',
    pip: 'bg-sky-400',
  },
  low: {
    label: 'Low',
    className: 'bg-teal-500/15 text-teal-300 ring-1 ring-teal-500/35',
    pip: 'bg-teal-400',
  },
}

export function compareRiskThenFifo(
  aRisk: RiskLevel,
  aTs: number,
  bRisk: RiskLevel,
  bTs: number,
): number {
  const byRisk = RISK_ORDER[aRisk] - RISK_ORDER[bRisk]
  if (byRisk !== 0) return byRisk
  return aTs - bTs
}
