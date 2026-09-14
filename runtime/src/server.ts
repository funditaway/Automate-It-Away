import express, { type Express, type Request, type Response } from 'express'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { VaultDb } from './db.js'
import {
  loadOrCreateKeypair,
  payloadHash,
  shortPublicKey,
  signCanonical,
  verifyCanonical,
  defaultKeyDir,
} from './crypto.js'
import { SandboxManager, loadCardUiSchema } from './sandboxManager.js'
import { cardFromGhlWebhook, dispatchToGhl } from './ghl.js'
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

export function createApp(opts: CreateServerOptions = {}): {
  app: Express
  vault: VaultDb
  keypair: ReturnType<typeof loadOrCreateKeypair>
  sandbox: SandboxManager
  dataDir: string
} {
  const dataDir = opts.dataDir || join(process.cwd(), 'data')
  const dbPath = opts.dbPath || join(dataDir, 'aia_vault.db')
  const keyDir = opts.keyDir || defaultKeyDir(join(dataDir, '..'))
  const vault = new VaultDb({ dbPath, keyDir })
  const keypair = loadOrCreateKeypair(keyDir)
  const sandbox = new SandboxManager(vault)
  const dryRun = opts.dryRun ?? process.env.AIA_GHL_DRY_RUN !== '0'
  const cardUi = loadCardUiSchema()

  const app = express()
  app.use(express.json({ limit: '2mb' }))

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'aia-local-runtime',
      port: opts.port ?? DEFAULT_PORT,
      ledgerTip: vault.ledgerTipHash(),
      publicKey: shortPublicKey(keypair.publicKeyHex),
      queuePending: vault.listCards('pending').length,
      dryRun,
    })
  })

  app.get('/card_ui.json', (_req, res) => {
    res.json(cardUi)
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

  /** Inbound GoHighLevel webhooks → evaluate risk → queue Decision Card */
  app.post('/webhook/ghl', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>
    const agentId = String(body.agentId || req.headers['x-aia-agent'] || 'agent_ghl_inbound')
    const payload = cardFromGhlWebhook(body, agentId)
    const card = vault.enqueueCard(payload)
    res.status(202).json({
      ok: true,
      queued: true,
      cardId: card.cardId,
      status: card.status,
      riskLevel: payload.riskLevel,
      cardUi,
      message: 'Paused for human authorization in the local queue',
    })
  })

  /** Authorize & sign a pending card, append provenance, dispatch to GHL when applicable */
  app.post('/queue/:cardId/authorize', async (req: Request, res: Response) => {
    const card = vault.getCard(req.params.cardId)
    if (!card) return res.status(404).json({ ok: false, error: 'Card not found' })
    if (card.status !== 'pending') {
      return res.status(409).json({ ok: false, error: `Card already ${card.status}` })
    }

    const signature = signCanonical(keypair.privateKeyPem, {
      cardId: card.cardId,
      payload: card.payload,
    })
    const hash = payloadHash(card.payload)
    const valid = verifyCanonical(
      keypair.publicKeyPem,
      { cardId: card.cardId, payload: card.payload },
      signature,
    )
    if (!valid) {
      return res.status(500).json({ ok: false, error: 'Local signature verification failed' })
    }

    vault.updateCardStatus(card.cardId, 'signed', { signature })
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

    if (isGhl) {
      dispatch = await dispatchToGhl(vault, card.payload, { dryRun })
      vault.updateCardStatus(card.cardId, dispatch.ok ? 'dispatched' : 'failed', {
        dispatchResult: JSON.stringify(dispatch),
      })
    }

    res.json({
      ok: true,
      cardId: card.cardId,
      signature,
      payloadHash: hash,
      provenanceId: entry.id,
      ledgerTip: vault.ledgerTipHash(),
      dispatch,
    })
  })

  app.post('/queue/:cardId/reject', (req, res) => {
    const card = vault.getCard(req.params.cardId)
    if (!card) return res.status(404).json({ ok: false, error: 'Card not found' })
    if (card.status !== 'pending') {
      return res.status(409).json({ ok: false, error: `Card already ${card.status}` })
    }
    vault.updateCardStatus(card.cardId, 'rejected')
    res.json({ ok: true, cardId: card.cardId, status: 'rejected' })
  })

  app.post('/queue/:cardId/delegate', (req, res) => {
    const card = vault.getCard(req.params.cardId)
    if (!card) return res.status(404).json({ ok: false, error: 'Card not found' })
    if (card.status !== 'pending') {
      return res.status(409).json({ ok: false, error: `Card already ${card.status}` })
    }
    vault.updateCardStatus(card.cardId, 'delegated')
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
    res.status(201).json({ ok: true, card })
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
    // Fire-and-forget style: return the first queued card quickly by racing
    // — for HTTP we run with a short note that authorization continues via /queue
    const runPromise = sandbox.runLogic({
      agentId,
      packName,
      scriptPath,
      context: req.body?.context || {},
      authTimeoutMs,
    })
    // Give the interceptor a moment to enqueue
    await new Promise((r) => setTimeout(r, 150))
    const pending = vault.listCards('pending')
    res.status(202).json({
      ok: true,
      started: true,
      pendingCards: pending.map((c) => c.cardId),
      note: 'Authorize pending cards via POST /queue/:cardId/authorize to resume the sandbox',
    })
    void runPromise.catch(() => undefined)
  })

  return { app, vault, keypair, sandbox, dataDir }
}

export function startServer(opts: CreateServerOptions = {}) {
  const port = opts.port ?? Number(process.env.AIA_RUNTIME_PORT || DEFAULT_PORT)
  const { app, vault, keypair } = createApp({ ...opts, port })
  const server = app.listen(port, '127.0.0.1', () => {
    console.log(`[AIA runtime] listening on http://127.0.0.1:${port}`)
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
