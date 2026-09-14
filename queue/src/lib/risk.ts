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
    badge: 'bg-aia-alert/20 text-red-300 border border-aia-alert/45',
    glow: true,
  },
  high: {
    label: 'high',
    badge: 'bg-aia-orange/20 text-aia-orange border border-aia-orange/45',
  },
  medium: {
    label: 'medium',
    badge: 'bg-aia-teal/20 text-teal-300 border border-aia-teal/45',
  },
  low: {
    label: 'low',
    badge: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/35',
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
