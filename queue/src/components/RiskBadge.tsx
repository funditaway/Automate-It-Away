import type { RiskLevel } from '../types'
import { RISK_STYLES } from '../lib/risk'

interface RiskBadgeProps {
  level: RiskLevel
  size?: 'sm' | 'md'
}

export function RiskBadge({ level, size = 'sm' }: RiskBadgeProps) {
  const style = RISK_STYLES[level]
  const pad = size === 'md' ? 'px-2.5 py-1 text-[11px]' : 'px-2 py-0.5 text-[10px]'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md font-semibold uppercase tracking-[0.08em] ${pad} ${style.className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.pip}`} aria-hidden />
      {style.label}
    </span>
  )
}
