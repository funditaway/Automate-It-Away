/**
 * Sandbox Execution & Interceptor (TypeScript protocol)
 *
 * Typed contract for the secure local runtime that executes agent `logic.js`.
 * The worker_threads entry is `sandboxWorkerEntry.js` (plain JS, no TS loader);
 * this module owns the message protocol, sensitivity rules, and helpers shared
 * with SandboxManager — packaging high-stakes calls into Active Decision Cards
 * for the local SQLite authorization queue.
 */

import type { RiskLevel, SandboxRequest } from './types.js'

export type WorkerToHostMessage =
  | { type: 'sensitive_request'; requestId: string; request: SandboxRequest }
  | { type: 'done'; result: unknown }
  | { type: 'error'; error: string }

export type HostToWorkerMessage = {
  type: 'auth_result'
  requestId: string
  authorized: boolean
  cardId?: string
  signature?: string
  reason?: string
}

export interface SandboxWorkerData {
  scriptSource: string
  scriptPath?: string
  context?: Record<string, unknown>
}

/** URLs / schemes that must pause for cryptographic human authorization. */
export const SENSITIVE_URL_RE =
  /leadconnectorhq\.com|gohighlevel|googleapis|api\.|webhook|smtp|rpc|0x[a-f0-9]{6}/i

export function isSensitiveUrl(url: unknown): boolean {
  const u = String(url || '').toLowerCase()
  return (
    SENSITIVE_URL_RE.test(u) || u.startsWith('http://') || u.startsWith('https://')
  )
}

/**
 * Decide whether a bridge call must be intercepted into an Active Decision Card.
 * Non-sensitive GETs may proceed; all other external calls pause for sign-off.
 */
export function requiresAuthorization(req: Pick<SandboxRequest, 'url' | 'method'>): boolean {
  const method = (req.method || 'POST').toUpperCase()
  if (!isSensitiveUrl(req.url) && method === 'GET') return false
  return true
}

export function inferSandboxRisk(url: string, method: string): RiskLevel {
  const u = url.toLowerCase()
  const m = method.toUpperCase()
  if (/delete|purge|destroy|wipe/.test(u) || m === 'DELETE') return 'critical'
  if (/contacts|opportunities|conversations|campaigns|workflows|calendars/.test(u)) return 'high'
  if (m === 'POST' || m === 'PUT' || m === 'PATCH') return 'medium'
  return 'low'
}

/**
 * Package a high-stakes bridge call into the shape consumed by card_ui.json /
 * the SQLite queue (payload fields filled by SandboxManager).
 */
export function packageSensitiveRequest(
  req: SandboxRequest,
  defaults: { actionType?: string; summary?: string; riskLevel?: RiskLevel } = {},
): SandboxRequest {
  const method = (req.method || 'POST').toUpperCase()
  return {
    method,
    url: req.url,
    headers: req.headers,
    body: req.body,
    actionType: req.actionType || defaults.actionType || `SANDBOX_${method}`,
    summary: req.summary || defaults.summary,
    riskLevel: req.riskLevel || defaults.riskLevel || inferSandboxRisk(req.url, method),
  }
}

/** Merge synthesized meta-prompt context into the worker's run context. */
export function buildWorkerContext(
  base: Record<string, unknown> = {},
  meta?: {
    systemPrompt?: string
    agentInstructions?: string
    constraints?: string[]
    outputSchema?: Record<string, unknown>
    templateId?: string
    sandboxContext?: Record<string, unknown>
  },
): Record<string, unknown> {
  if (!meta) return { ...base }
  return {
    ...base,
    ...(meta.sandboxContext || {}),
    metaPrompt: {
      templateId: meta.templateId,
      systemPrompt: meta.systemPrompt,
      agentInstructions: meta.agentInstructions,
      constraints: meta.constraints || [],
      outputSchema: meta.outputSchema,
    },
  }
}
