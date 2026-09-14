import { Worker } from 'node:worker_threads'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { VaultDb } from './db.js'
import type { ActiveDecisionCard, CardUiSchema, DecisionCardPayload, RiskLevel, SandboxRequest } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function loadCardUiSchema(path?: string): CardUiSchema {
  const candidates = [
    path,
    join(__dirname, 'data', 'card_ui.json'),
    join(__dirname, '..', '..', 'queue', 'src', 'data', 'card_ui.json'),
  ].filter(Boolean) as string[]
  for (const p of candidates) {
    if (existsSync(p)) {
      return JSON.parse(readFileSync(p, 'utf8')) as CardUiSchema
    }
  }
  return {
    title: 'Active Decision Card',
    subtitle: 'Inspect payload diffs and cryptographically authorize agent execution.',
    fields: [],
    actions: {
      primary: { id: 'yes', label: 'YES: AUTHORIZE & SIGN', shortcut: 'ENTER' },
      secondary: [
        { id: 'reject', label: 'Reject & Abort' },
        { id: 'delegate', label: 'Delegate to Sub-Agent' },
      ],
    },
  }
}

function inferRisk(url: string, method: string): RiskLevel {
  const u = url.toLowerCase()
  const m = method.toUpperCase()
  if (/delete|purge|destroy|wipe/.test(u) || m === 'DELETE') return 'critical'
  if (/contacts|opportunities|conversations|campaigns|workflows/.test(u)) return 'high'
  if (m === 'POST' || m === 'PUT' || m === 'PATCH') return 'medium'
  return 'low'
}

function buildPayload(
  agentId: string,
  packName: string,
  req: SandboxRequest,
  cardUi: CardUiSchema,
): DecisionCardPayload {
  const method = (req.method || 'POST').toUpperCase()
  const riskLevel = req.riskLevel || inferRisk(req.url, method)
  return {
    agentId,
    packName,
    actionType: req.actionType || `SANDBOX_${method}`,
    riskLevel,
    targetEndpoint: req.url,
    method,
    body: req.body,
    headers: req.headers,
    summary:
      req.summary ||
      `${cardUi.title}: agent ${agentId} requests ${method} ${req.url}`,
    diffData: {
      before: { authorized: false, status: 'paused' },
      after: { authorized: true, status: 'awaiting_human' },
    },
    source: 'sandbox',
    timestamp: Date.now(),
  }
}

export interface SandboxRunOptions {
  agentId: string
  packName?: string
  scriptPath: string
  context?: Record<string, unknown>
  /** How long to wait for human auth per intercepted call */
  authTimeoutMs?: number
  cardUiPath?: string
}

export interface SandboxRunResult {
  ok: boolean
  cards: ActiveDecisionCard[]
  result?: unknown
  error?: string
}

/**
 * Runs agentic logic.js inside a worker. Sensitive network calls are intercepted:
 * a Decision Card is queued, and the worker pauses until the card leaves `pending`.
 */
export class SandboxManager {
  constructor(private readonly vault: VaultDb) {}

  async runLogic(opts: SandboxRunOptions): Promise<SandboxRunResult> {
    const cardUi = loadCardUiSchema(opts.cardUiPath)
    const scriptSource = readFileSync(opts.scriptPath, 'utf8')
    const cards: ActiveDecisionCard[] = []
    const workerPath = join(__dirname, 'sandboxWorker.js')
    if (!existsSync(workerPath)) {
      return Promise.resolve({
        ok: false,
        cards,
        error: `sandboxWorker missing at ${workerPath}`,
      })
    }

    return new Promise((resolve) => {
      const worker = new Worker(workerPath, {
        workerData: {
          scriptSource,
          context: opts.context || {},
          scriptPath: opts.scriptPath,
        },
      })

      let settled = false
      const finish = (out: SandboxRunResult) => {
        if (settled) return
        settled = true
        void worker.terminate()
        resolve(out)
      }

      worker.on('message', (msg: { type: string; request?: SandboxRequest; requestId?: string; result?: unknown; error?: string }) => {
        void (async () => {
          if (msg.type === 'sensitive_request' && msg.request && msg.requestId) {
            const payload = buildPayload(
              opts.agentId,
              opts.packName || 'Local Agent Pack',
              msg.request,
              cardUi,
            )
            const card = this.vault.enqueueCard(payload)
            cards.push(card)
            try {
              const resolved = await this.vault.waitForResolution(card.cardId, {
                timeoutMs: opts.authTimeoutMs ?? 300_000,
              })
              cards[cards.length - 1] = resolved
              if (resolved.status === 'signed' || resolved.status === 'dispatched') {
                worker.postMessage({
                  type: 'auth_result',
                  requestId: msg.requestId,
                  authorized: true,
                  cardId: resolved.cardId,
                  signature: resolved.signature,
                })
              } else {
                worker.postMessage({
                  type: 'auth_result',
                  requestId: msg.requestId,
                  authorized: false,
                  cardId: resolved.cardId,
                  reason: resolved.status,
                })
              }
            } catch (err) {
              worker.postMessage({
                type: 'auth_result',
                requestId: msg.requestId,
                authorized: false,
                reason: err instanceof Error ? err.message : String(err),
              })
            }
            return
          }

          if (msg.type === 'done') {
            finish({ ok: true, cards, result: msg.result })
            return
          }
          if (msg.type === 'error') {
            finish({ ok: false, cards, error: msg.error || 'worker error' })
          }
        })()
      })

      worker.on('error', (err) => {
        finish({ ok: false, cards, error: err.message })
      })

      worker.on('exit', (code) => {
        if (!settled) {
          finish({
            ok: code === 0,
            cards,
            error: code === 0 ? undefined : `worker exited with code ${code}`,
          })
        }
      })
    })
  }
}
