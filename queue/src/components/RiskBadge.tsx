import type { RiskLevel } from '../types'
import { RISK_STYLES } from '../lib/risk'

interface RiskBadgeProps {
  level: RiskLevel
  size?: 'sm' | 'md'
}

export function RiskBadge({ level, size = 'sm' }: RiskBadgeProps) {
  const style = RISK_STYLES[level]
  const pad = size === 'md' ? 'px-2.5 py-0.5' : 'px-2 py-0.5'
  return (
    <span
      className={`inline-flex items-center rounded font-mono text-[10px] font-bold uppercase tracking-wide ${pad} ${style.badge} ${style.glow ? 'critical-glow' : ''}`}
    >
      {style.label}
    </span>
  )
}
