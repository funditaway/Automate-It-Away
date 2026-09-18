export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

export type DecisionCardStatus = 'pending' | 'signed' | 'rejected' | 'delegated' | 'dispatched' | 'failed'

export interface MetaPromptAttachment {
  templateId: string
  systemPrompt: string
  agentInstructions: string
  constraints: string[]
  outputSchema?: Record<string, unknown>
}

export interface DecisionCardPayload {
  agentId: string
  packName: string
  actionType: string
  riskLevel: RiskLevel
  targetEndpoint: string
  summary: string
  method?: string
  body?: unknown
  headers?: Record<string, string>
  diffData?: {
    before?: Record<string, unknown>
    after?: Record<string, unknown>
  }
  resourceCost?: {
    amount: string
    token: string
  }
  source?: 'ghl_webhook' | 'sandbox' | 'manual' | 'recommendation'
  webhookEvent?: string
  /** Attached when the meta-prompt synthesizer compiled this card */
  metaPrompt?: MetaPromptAttachment
  /** Parent card that spawned a recommendation (closed-loop) */
  parentCardId?: string
  recommendationKind?: string
  timestamp: number
}

export interface ActiveDecisionCard {
  cardId: string
  status: DecisionCardStatus
  payload: DecisionCardPayload
  signature?: string
  createdAt: number
  updatedAt: number
  dispatchResult?: string | null
}

export interface VaultRecord {
  id: string
  label: string
  provider: string
  ciphertext: string
  iv: string
  tag: string
  createdAt: number
  updatedAt: number
}

export interface ProvenanceEntry {
  id: number
  cardId: string
  payloadHash: string
  agentId: string
  signature: string
  timestamp: number
}

export interface SandboxRequest {
  method: string
  url: string
  headers?: Record<string, string>
  body?: unknown
  actionType?: string
  summary?: string
  riskLevel?: RiskLevel
}

export interface CardUiSchema {
  title: string
  subtitle: string
  fields: Array<{
    id: string
    label: string
    path: string
    kind: string
  }>
  actions: {
    primary: { id: string; label: string; shortcut: string }
    secondary: Array<{ id: string; label: string }>
  }
}
