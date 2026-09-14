import type { RiskLevel } from '../types'

export const RISK_ORDER: Record<RiskLevel, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

export const RISK_STYLES: Record<
  RiskLevel,
  { label: string; badge: string; glow?: boolean }
> = {
  critical: {
    label: 'critical',
    badge: 'bg-rose-500/20 text-rose-300 border border-rose-500/40',
    glow: true,
  },
  high: {
    label: 'high',
    badge: 'bg-amber-500/20 text-amber-300 border border-amber-500/40',
  },
  medium: {
    label: 'medium',
    badge: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40',
  },
  low: {
    label: 'low',
    badge: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
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
