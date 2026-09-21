import express, { type Express, type Request, type Response } from 'express'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { VaultDb } from './db.js'
import {
  loadOrCreateKeypair,
  payloadHash,
  shortPublicKey,
  verifyCanonical,
  defaultKeyDir,
} from './crypto.js'
import {
  appendLedgerEntry,
  buildLedgerTransaction,
  defaultLedgerPath,
  signLedgerTransaction,
} from './ledger.js'
import { SandboxManager, loadCardUiSchema } from './sandboxManager.js'
import { dispatchToGhl } from './ghl.js'
import { synthesizeMetaPrompt } from './promptSynthesizer.js'
import {
  enqueueRecommendations,
  recommendationsFromFeedback,
  type CrmFeedback,
} from './recommendationEngine.js'
import type { DecisionCardPayload } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const DEFAULT_PORT = 3847

export interface CreateServerOptions {
  port?: number
  dbPath?: string
  keyDir?: string
  dryRun?: boolean
  dataDir?: string
}

type BusEvent = {
  type: string
  at: number
  [key: string]: unknown
}

function vaultContextFrom(vault: VaultDb, body: Record<string, unknown>) {
  return {
    credentials: vault.listCredentials().map((c) => ({
      label: c.label,
      provider: c.provider,
      last4: c.last4,
    })),
    packName: body.packName ? String(body.packName) : undefined,
    agentId: body.agentId ? String(body.agentId) : undefined,
    deskRules: Array.isArray(body.deskRules) ? body.deskRules.map(String) : undefined,
  }
}

export function createApp(opts: CreateServerOptions = {}): {
  app: Express
  vault: VaultDb
  keypair: ReturnType<typeof loadOrCreateKeypair>
  sandbox: SandboxManager
  dataDir: string
  attachRealtime: (server: HttpServer) => WebSocketServer
  broadcast: (event: BusEvent) => void
} {
  const dataDir = opts.dataDir || join(process.cwd(), 'data')
  const dbPath = opts.dbPath || join(dataDir, 'aia_vault.db')
  const keyDir = opts.keyDir || defaultKeyDir(join(dataDir, '..'))
  const ledgerPath = defaultLedgerPath(dataDir)
  const vault = new VaultDb({ dbPath, keyDir })
  const keypair = loadOrCreateKeypair(keyDir)
  const sandbox = new SandboxManager(vault)
  const dryRun = opts.dryRun ?? process.env.AIA_GHL_DRY_RUN !== '0'
  const cardUi = loadCardUiSchema()

  const sseClients = new Set<Response>()
  const wsClients = new Set<WebSocket>()

  function broadcast(event: BusEvent) {
    const payload = JSON.stringify(event)
    for (const res of sseClients) {
      try {
        res.write(`event: ${event.type}\ndata: ${payload}\n\n`)
      } catch {
        sseClients.delete(res)
      }
    }
    for (const socket of wsClients) {
      if (socket.readyState === 1 /* OPEN */) {
        try {
          socket.send(payload)
        } catch {
          wsClients.delete(socket)
        }
      }
    }
  }

  const app = express()
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-AIA-Agent')
    if (req.method === 'OPTIONS') return res.status(204).end()
    next()
  })
  app.use(express.json({ limit: '2mb' }))

  const publicDir = join(__dirname, '..', 'public')
  if (existsSync(publicDir)) {
    app.use(express.static(publicDir))
  }

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'aia-local-runtime',
      port: opts.port ?? DEFAULT_PORT,
      ledgerTip: vault.ledgerTipHash(),
      publicKey: shortPublicKey(keypair.publicKeyHex),
      queuePending: vault.listCards('pending').length,
      dryRun,
      realtime: { sse: sseClients.size, ws: wsClients.size },
    })
  })

  app.get('/card_ui.json', (_req, res) => {
    res.json(cardUi)
  })

  /** Server-Sent Events stream for live decision-card sync */
  app.get('/api/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders?.()
    sseClients.add(res)
    res.write(
      `event: hello\ndata: ${JSON.stringify({
        type: 'hello',
        at: Date.now(),
        ledgerTip: vault.ledgerTipHash(),
        publicKey: shortPublicKey(keypair.publicKeyHex),
        pending: vault.listCards('pending').length,
      })}\n\n`,
    )
    const heartbeat = setInterval(() => {
      try {
        res.write(`: ping ${Date.now()}\n\n`)
      } catch {
        clearInterval(heartbeat)
        sseClients.delete(res)
      }
    }, 15_000)
    req.on('close', () => {
      clearInterval(heartbeat)
      sseClients.delete(res)
    })
  })

  app.get('/queue', (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const cards = status
      ? vault.listCards(status as 'pending' | 'signed' | 'rejected' | 'delegated' | 'dispatched' | 'failed')
      : vault.listCards()
    res.json({ ok: true, cards, ledgerTip: vault.ledgerTipHash() })
  })

  app.get('/ledger', (req, res) => {
    const limit = Number(req.query.limit || 50)
    res.json({
      ok: true,
      entries: vault.listProvenance(limit),
      tip: vault.ledgerTipHash(),
      publicKey: keypair.publicKeyHex,
    })
  })

  app.get('/vault', (_req, res) => {
    res.json({ ok: true, credentials: vault.listCredentials() })
  })

  app.post('/vault', (req, res) => {
    const { label, provider, secret, id } = req.body || {}
    if (!label || !provider || !secret) {
      return res.status(400).json({ ok: false, error: 'label, provider, and secret are required' })
    }
    const record = vault.putCredential(String(label), String(provider), String(secret), id ? String(id) : undefined)
    res.status(201).json({
      ok: true,
      id: record.id,
      label: record.label,
      provider: record.provider,
      last4: String(secret).slice(-4),
    })
  })

  /**
   * Inbound GoHighLevel webhooks → meta-prompt synthesis → Decision Card queue.
   * Feedback-shaped events also fan into the recommendation engine (still pending YES).
   */
  app.post('/webhook/ghl', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>
    const agentId = String(body.agentId || req.headers['x-aia-agent'] || 'agent_ghl_inbound')
    const synthesized = synthesizeMetaPrompt(body, {
      ...vaultContextFrom(vault, body),
      agentId,
    })
    const card = vault.enqueueCard(synthesized.decisionPayload)
    broadcast({
      type: 'card.enqueued',
      at: Date.now(),
      card,
      ledgerTip: vault.ledgerTipHash(),
    })

    // Optional closed-loop feedback mode: CRM follow-up events can also
    // enqueue recommendation cards (still pending human YES — never auto-sent).
    let recommendations: ReturnType<typeof recommendationsFromFeedback> = []
    const asFeedback =
      body.asFeedback === true ||
      body.closedLoop === true ||
      String(body.mode || '').toLowerCase() === 'feedback'
    if (asFeedback) {
      const event = String(body.type || body.event || '').toLowerCase()
      const feedbackHints: CrmFeedback = {
        event: String(body.type || body.event || ''),
        contactId: String(
          (body.contact as { id?: string } | undefined)?.id ||
            body.contactId ||
            synthesized.sandboxContext.contactId ||
            '',
        ),
        contactReplied: /replied|inboundmessage|conversation|sms_reply|email_reply/.test(event),
        stageUpdated: /stage|pipeline|opportunity/.test(event),
        stage:
          String(
            (body.opportunity as { stage?: string } | undefined)?.stage || body.stage || '',
          ) || undefined,
        mediaRequested: Boolean(body.mediaRequested),
        appointmentRequested: Boolean(body.appointmentRequested),
        messagePreview: body.messagePreview ? String(body.messagePreview) : undefined,
        raw: body,
      }
      recommendations = recommendationsFromFeedback(vault, feedbackHints, card)
      for (const rec of recommendations) {
        broadcast({
          type: 'card.enqueued',
          at: Date.now(),
          card: rec,
          ledgerTip: vault.ledgerTipHash(),
          parentCardId: card.cardId,
          source: 'recommendation',
        })
      }
    }

    res.status(202).json({
      ok: true,
      queued: true,
      cardId: card.cardId,
      status: card.status,
      riskLevel: synthesized.decisionPayload.riskLevel,
      metaPrompt: {
        templateId: synthesized.templateId,
        systemPrompt: synthesized.systemPrompt,
        agentInstructions: synthesized.agentInstructions,
        constraints: synthesized.constraints,
        outputSchema: synthesized.outputSchema,
      },
      recommendations: recommendations.map((c) => ({
        cardId: c.cardId,
        actionType: c.payload.actionType,
        recommendationKind: c.payload.recommendationKind,
      })),
      cardUi,
      message: 'Paused for human authorization in the local queue',
    })
  })

  /** Authorize & sign a pending card, append provenance, dispatch to GHL when applicable */
  async function authorizeCard(cardId: string, res: Response) {
    const card = vault.getCard(cardId)
    if (!card) return res.status(404).json({ ok: false, error: 'Card not found' })
    if (card.status !== 'pending') {
      return res.status(409).json({ ok: false, error: `Card already ${card.status}` })
    }

    // Append-only ledger protocol: dequeue → tx payload → SHA-256 → Ed25519 → ledger.ndjson
    const tx = buildLedgerTransaction(card)
    const ledgerEntry = signLedgerTransaction(keypair.privateKeyPem, tx)
    const signature = ledgerEntry.signature
    const hash = ledgerEntry.hash
    const valid =
      verifyCanonical(keypair.publicKeyPem, tx, signature) &&
      hash === payloadHash(tx)
    if (!valid) {
      return res.status(500).json({ ok: false, error: 'Local signature verification failed' })
    }

    // Remove from the active (pending) queue
    vault.updateCardStatus(card.cardId, 'signed', { signature })
    appendLedgerEntry(ledgerPath, ledgerEntry)
    const entry = vault.appendProvenance({
      cardId: card.cardId,
      payloadHash: hash,
      agentId: card.payload.agentId,
      signature,
    })

    let dispatch = null
    const isGhl =
      /leadconnectorhq\.com|gohighlevel/i.test(card.payload.targetEndpoint) ||
      card.payload.source === 'ghl_webhook' ||
      /^GHL_/i.test(card.payload.actionType)

    let finalCard = vault.getCard(card.cardId)!
    if (isGhl) {
      dispatch = await dispatchToGhl(vault, card.payload, { dryRun })
      finalCard =
        vault.updateCardStatus(card.cardId, dispatch.ok ? 'dispatched' : 'failed', {
          dispatchResult: JSON.stringify(dispatch),
        }) || finalCard
    }

    // Closed-loop: successful completion feeds the recommendation engine
    let nextActions: ReturnType<typeof enqueueRecommendations> = []
    if (finalCard.status === 'signed' || finalCard.status === 'dispatched') {
      nextActions = enqueueRecommendations(vault, { completedCard: finalCard })
    }

    for (const rec of nextActions) {
      broadcast({
        type: 'card.enqueued',
        at: Date.now(),
        card: rec,
        ledgerTip: vault.ledgerTipHash(),
        parentCardId: card.cardId,
        source: 'recommendation',
      })
    }

    const result = {
      ok: true,
      cardId: card.cardId,
      signature,
      payloadHash: hash,
      provenanceId: entry.id,
      ledgerTip: vault.ledgerTipHash(),
      signedAt: Date.now(),
      publicKey: shortPublicKey(keypair.publicKeyHex),
      verified: true,
      dispatch,
      recommendations: nextActions.map((c) => ({
        cardId: c.cardId,
        actionType: c.payload.actionType,
        recommendationKind: c.payload.recommendationKind,
        status: c.status,
      })),
    }
    broadcast({
      type: 'card.signed',
      at: Date.now(),
      cardId: card.cardId,
      signature,
      payloadHash: hash,
      ledgerTip: result.ledgerTip,
      provenanceId: entry.id,
    })
    res.json(result)
  }

  /** Authorize & sign a pending card, append provenance, dispatch to GHL when applicable */
  app.post('/queue/:cardId/authorize', async (req: Request, res: Response) => {
    await authorizeCard(String(req.params.cardId), res)
  })

  /** Cryptographic signature dispatcher used by the standalone terminal client */
  app.post('/api/sign', async (req: Request, res: Response) => {
    const cardId = String(req.body?.cardId || req.query.cardId || '')
    if (!cardId) return res.status(400).json({ ok: false, error: 'cardId is required' })
    await authorizeCard(cardId, res)
  })

  app.post('/queue/:cardId/reject', (req, res) => {
    const card = vault.getCard(req.params.cardId)
    if (!card) return res.status(404).json({ ok: false, error: 'Card not found' })
    if (card.status !== 'pending') {
      return res.status(409).json({ ok: false, error: `Card already ${card.status}` })
    }
    vault.updateCardStatus(card.cardId, 'rejected')
    broadcast({
      type: 'card.rejected',
      at: Date.now(),
      cardId: card.cardId,
      ledgerTip: vault.ledgerTipHash(),
    })
    res.json({ ok: true, cardId: card.cardId, status: 'rejected' })
  })

  app.post('/queue/:cardId/delegate', (req, res) => {
    const card = vault.getCard(req.params.cardId)
    if (!card) return res.status(404).json({ ok: false, error: 'Card not found' })
    if (card.status !== 'pending') {
      return res.status(409).json({ ok: false, error: `Card already ${card.status}` })
    }
    vault.updateCardStatus(card.cardId, 'delegated')
    broadcast({
      type: 'card.delegated',
      at: Date.now(),
      cardId: card.cardId,
      ledgerTip: vault.ledgerTipHash(),
    })
    res.json({ ok: true, cardId: card.cardId, status: 'delegated' })
  })

  /** Manually enqueue a Decision Card (e.g. from desk UI) */
  app.post('/queue', (req, res) => {
    const payload = req.body?.payload as DecisionCardPayload | undefined
    if (!payload?.agentId || !payload?.actionType || !payload?.targetEndpoint) {
      return res.status(400).json({
        ok: false,
        error: 'payload.agentId, actionType, and targetEndpoint are required',
      })
    }
    const card = vault.enqueueCard({
      ...payload,
      riskLevel: payload.riskLevel || 'medium',
      summary: payload.summary || payload.actionType,
      timestamp: payload.timestamp || Date.now(),
      source: payload.source || 'manual',
    })
    broadcast({
      type: 'card.enqueued',
      at: Date.now(),
      card,
      ledgerTip: vault.ledgerTipHash(),
    })
    res.status(201).json({ ok: true, card })
  })

  /** Explicit CRM feedback → recommendation cards only (no silent send) */
  app.post('/recommendations/from-feedback', (req, res) => {
    const feedback = (req.body || {}) as CrmFeedback
    const parentId = req.body?.parentCardId ? String(req.body.parentCardId) : undefined
    const anchor = parentId ? vault.getCard(parentId) || undefined : undefined
    const cards = recommendationsFromFeedback(vault, feedback, anchor)
    res.status(202).json({
      ok: true,
      queued: cards.length,
      cards: cards.map((c) => ({
        cardId: c.cardId,
        actionType: c.payload.actionType,
        recommendationKind: c.payload.recommendationKind,
        status: c.status,
      })),
      message: 'Recommendations queued pending human authorization',
    })
  })

  /** Run a logic.js agent pack through the sandbox interceptor */
  app.post('/sandbox/run', async (req, res) => {
    const scriptPath = String(req.body?.scriptPath || '')
    const agentId = String(req.body?.agentId || 'agent_local')
    const packName = String(req.body?.packName || 'Local Agent Pack')
    if (!scriptPath || !existsSync(scriptPath)) {
      return res.status(400).json({ ok: false, error: 'scriptPath must point to an existing logic.js' })
    }
    const authTimeoutMs = Number(req.body?.authTimeoutMs || 120_000)

    let metaPrompt = req.body?.metaPrompt as
      | {
          templateId?: string
          systemPrompt?: string
          agentInstructions?: string
          constraints?: string[]
          outputSchema?: Record<string, unknown>
          sandboxContext?: Record<string, unknown>
        }
      | undefined

    // Optional: synthesize meta-prompt from an inline webhook payload
    if (!metaPrompt && req.body?.webhook && typeof req.body.webhook === 'object') {
      const bundle = synthesizeMetaPrompt(
        req.body.webhook as Record<string, unknown>,
        vaultContextFrom(vault, req.body.webhook as Record<string, unknown>),
      )
      metaPrompt = {
        templateId: bundle.templateId,
        systemPrompt: bundle.systemPrompt,
        agentInstructions: bundle.agentInstructions,
        constraints: bundle.constraints,
        outputSchema: bundle.outputSchema,
        sandboxContext: bundle.sandboxContext,
      }
    }

    const runPromise = sandbox.runLogic({
      agentId,
      packName,
      scriptPath,
      context: req.body?.context || {},
      metaPrompt,
      authTimeoutMs,
    })

    await new Promise((r) => setTimeout(r, 150))
    const pending = vault.listCards('pending')
    if (pending[0]) {
      broadcast({
        type: 'card.enqueued',
        at: Date.now(),
        card: pending[0],
        ledgerTip: vault.ledgerTipHash(),
      })
    }
    res.status(202).json({
      ok: true,
      started: true,
      pendingCards: pending.map((c) => c.cardId),
      metaPrompt: metaPrompt
        ? {
            templateId: metaPrompt.templateId,
            systemPrompt: metaPrompt.systemPrompt,
            agentInstructions: metaPrompt.agentInstructions,
          }
        : null,
      note: 'Authorize pending cards via POST /queue/:cardId/authorize or POST /api/sign to resume the sandbox',
    })

    void runPromise
      .then((result) => {
        if (!result.ok) return
        // After sandbox completes successfully, recommend next actions from the last signed card
        const signed = [...result.cards]
          .reverse()
          .find((c) => c.status === 'signed' || c.status === 'dispatched')
        if (signed) {
          const fresh = vault.getCard(signed.cardId) || signed
          enqueueRecommendations(vault, { completedCard: fresh })
        }
      })
      .catch(() => undefined)
  })

  function attachRealtime(server: HttpServer): WebSocketServer {
    const wss = new WebSocketServer({ server, path: '/ws' })
    wss.on('connection', (socket) => {
      wsClients.add(socket)
      socket.send(
        JSON.stringify({
          type: 'hello',
          at: Date.now(),
          ledgerTip: vault.ledgerTipHash(),
          publicKey: shortPublicKey(keypair.publicKeyHex),
          pending: vault.listCards('pending').length,
        }),
      )
      socket.on('close', () => wsClients.delete(socket))
      socket.on('error', () => wsClients.delete(socket))
      socket.on('message', (raw) => {
        try {
          const msg = JSON.parse(String(raw)) as { type?: string }
          if (msg.type === 'ping') {
            socket.send(JSON.stringify({ type: 'pong', at: Date.now() }))
          }
        } catch {
          /* ignore malformed */
        }
      })
    })
    return wss
  }

  return { app, vault, keypair, sandbox, dataDir, attachRealtime, broadcast }
}

export function startServer(opts: CreateServerOptions = {}) {
  const port = opts.port ?? Number(process.env.AIA_RUNTIME_PORT || DEFAULT_PORT)
  const { app, vault, keypair, attachRealtime } = createApp({ ...opts, port })
  const server = createHttpServer(app)
  attachRealtime(server)
  server.listen(port, '127.0.0.1', () => {
    console.log(`[AIA runtime] listening on http://127.0.0.1:${port}`)
    console.log(`[AIA runtime] desk UI http://127.0.0.1:${port}/`)
    console.log(`[AIA runtime] ws://127.0.0.1:${port}/ws · SSE /api/stream · POST /api/sign`)
    console.log(`[AIA runtime] vault=${vault.dbPath}`)
    console.log(`[AIA runtime] pubkey=${shortPublicKey(keypair.publicKeyHex)}`)
    console.log(`[AIA runtime] ledgerTip=${vault.ledgerTipHash()}`)
  })
  return { app, server, vault, keypair }
}

const isMain =
  process.argv[1] &&
  (fileURLToPath(import.meta.url) === process.argv[1] ||
    process.argv[1].endsWith('server.ts') ||
    process.argv[1].endsWith('server.js'))

if (isMain) {
  startServer()
}
