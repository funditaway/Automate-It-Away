import { Worker } from 'node:worker_threads'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { VaultDb } from './db.js'
import {
  buildWorkerContext,
  inferSandboxRisk,
  packageSensitiveRequest,
  type HostToWorkerMessage,
  type WorkerToHostMessage,
} from './sandboxWorker.js'
import type { ActiveDecisionCard, CardUiSchema, DecisionCardPayload, SandboxRequest } from './types.js'

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

function buildPayload(
  agentId: string,
  packName: string,
  req: SandboxRequest,
  cardUi: CardUiSchema,
): DecisionCardPayload {
  const packaged = packageSensitiveRequest(req)
  const method = packaged.method || 'POST'
  const riskLevel = packaged.riskLevel || inferSandboxRisk(packaged.url, method)
  return {
    agentId,
    packName,
    actionType: packaged.actionType || `SANDBOX_${method}`,
    riskLevel,
    targetEndpoint: packaged.url,
    method,
    body: packaged.body,
    headers: packaged.headers,
    summary:
      packaged.summary ||
      `${cardUi.title}: agent ${agentId} requests ${method} ${packaged.url}`,
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
  /** Synthesized meta-prompt injected into logic.js context */
  metaPrompt?: {
    templateId?: string
    systemPrompt?: string
    agentInstructions?: string
    constraints?: string[]
    outputSchema?: Record<string, unknown>
    sandboxContext?: Record<string, unknown>
  }
  /** How long to wait for human auth per intercepted call */
  authTimeoutMs?: number
  cardUiPath?: string
  /** Invoked when a sensitive call is packaged into an Active Decision Card */
  onCardQueued?: (card: ActiveDecisionCard) => void
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
    const workerPath = [
      join(__dirname, 'sandboxWorkerEntry.js'),
      join(__dirname, 'sandboxWorker.js'),
    ].find((p) => existsSync(p))
    if (!workerPath) {
      return Promise.resolve({
        ok: false,
        cards,
        error: `sandboxWorkerEntry missing under ${__dirname}`,
      })
    }

    return new Promise((resolve) => {
      const workerContext = buildWorkerContext(opts.context || {}, opts.metaPrompt)
      const worker = new Worker(workerPath, {
        workerData: {
          scriptSource,
          context: workerContext,
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

      worker.on('message', (msg: WorkerToHostMessage) => {
        void (async () => {
          if (msg.type === 'sensitive_request' && msg.request && msg.requestId) {
            const payload = buildPayload(
              opts.agentId,
              opts.packName || 'Local Agent Pack',
              msg.request,
              cardUi,
            )
            // Sovereign boundary: enqueue Active Decision Card; never call out yet
            const card = this.vault.enqueueCard(payload)
            cards.push(card)
            opts.onCardQueued?.(card)
            try {
              const resolved = await this.vault.waitForResolution(card.cardId, {
                timeoutMs: opts.authTimeoutMs ?? 300_000,
              })
              cards[cards.length - 1] = resolved
              const reply: HostToWorkerMessage =
                resolved.status === 'signed' || resolved.status === 'dispatched'
                  ? {
                      type: 'auth_result',
                      requestId: msg.requestId,
                      authorized: true,
                      cardId: resolved.cardId,
                      signature: resolved.signature,
                    }
                  : {
                      type: 'auth_result',
                      requestId: msg.requestId,
                      authorized: false,
                      cardId: resolved.cardId,
                      reason: resolved.status,
                    }
              worker.postMessage(reply)
            } catch (err) {
              const reply: HostToWorkerMessage = {
                type: 'auth_result',
                requestId: msg.requestId,
                authorized: false,
                reason: err instanceof Error ? err.message : String(err),
              }
              worker.postMessage(reply)
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
