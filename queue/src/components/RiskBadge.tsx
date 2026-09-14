import type { RiskLevel } from '../types'
import { RISK_STYLES } from '../lib/risk'

interface RiskBadgeProps {
  level: RiskLevel
  size?: 'sm' | 'md'
}

export function RiskBadge({ level, size = 'sm' }: RiskBadgeProps) {
  const style = RISK_STYLES[level]
  const pad = size === 'md' ? 'min-h-11 px-3 py-2 text-[11px]' : 'min-h-8 px-2.5 py-1.5 text-[10px]'
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md font-mono font-bold uppercase tracking-wide ${pad} ${style.badge} ${style.glow ? 'critical-glow' : ''}`}
    >
      {style.label}
    </span>
  )
}
