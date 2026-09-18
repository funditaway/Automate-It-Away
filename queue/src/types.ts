export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

export type DecisionCardStatus = 'pending' | 'signed' | 'rejected' | 'delegated'

export interface DecisionCardPayload {
  agentId: string
  packName: string
  actionType: string
  riskLevel: RiskLevel
  targetEndpoint: string
  summary: string
  diffData?: {
    before?: Record<string, unknown>
    after?: Record<string, unknown>
  }
  resourceCost?: {
    amount: string
    token: string
  }
  timestamp: number
}

export interface ActiveDecisionCard {
  cardId: string
  status: DecisionCardStatus
  payload: DecisionCardPayload
  signature?: string
}

export interface AuditEvent {
  id: string
  cardId: string
  action: 'signed' | 'rejected' | 'delegated' | 'enqueued'
  at: number
  signature?: string
  detail: string
}

export interface CardUiField {
  id: string
  label: string
  path: string
  kind: 'text' | 'badge' | 'mono' | 'diff' | 'cost' | 'time'
}

export interface CardUiSchema {
  title: string
  subtitle: string
  fields: CardUiField[]
  actions: {
    primary: { id: string; label: string; shortcut: string }
    secondary: Array<{ id: string; label: string }>
  }
}
