/**
 * AIA command-center daemon.
 *
 * Express router for the desk, inbound webhooks, and the Ed25519 signing
 * gate. State-changing routes (authorize, reject, delegate) refuse to run
 * unless the body contains `confirm: true` — the desk sends that only from
 * a click or the Enter key.
 *
 * Live outbound calls stay dry-run unless AIA_DISPATCH_DRY_RUN=0, and even
 * then only an allowlisted HTTPS host is contacted. Bridge cards never broadcast.
 */
import express from 'express'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadOrCreateKeypair, shortPublicKey, verifyCanonical } from './lib/keys.js'
import { Ledger, entryBody } from './lib/ledger.js'
import { CardQueue } from './lib/queue.js'
import { DEFAULT_CARD_UI } from './lib/cardUi.js'
import { mountWebhooks } from './webhookIngest.js'
import { createSwarm, mountSwarm } from './deploySwarm.js'
import { mountBridge } from './bridgeModule.js'

const here = dirname(fileURLToPath(import.meta.url))
export const DEFAULT_PORT = 3000

/** Hosts the daemon may call after a human signature. Bridge URLs are not included. */
const DISPATCH_ALLOW = [/^https:\/\/services\.leadconnectorhq\.com\//i]

function createLock() {
  let tail = Promise.resolve()
  return function lock(fn) {
    const next = tail.then(fn, fn)
    tail = next.then(
      () => {},
      () => {},
    )
    return next
  }
}

function requireHitl(req, res) {
  if (req.body?.confirm !== true) {
    res.status(409).json({
      ok: false,
      error: 'Human confirmation required (confirm: true). No silent mutations.',
    })
    return false
  }
  return true
}

async function planDispatch(card, ctx) {
  const url = String(card.payload?.targetEndpoint || '')
  const allowed = DISPATCH_ALLOW.some((rule) => rule.test(url))
  if (ctx.dryRun || !allowed) {
    return {
      executed: false,
      dryRun: true,
      url,
      reason: ctx.dryRun ? 'dry-run' : 'endpoint not on the live dispatch allowlist',
    }
  }
  const fetchImpl = ctx.fetchImpl || fetch
  const response = await fetchImpl(url, {
    method: card.payload.method || 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(card.payload.body || {}),
  })
  return { executed: true, dryRun: false, status: response.status, url }
}

function commitAction(ctx, card, action) {
  const entry = ctx.ledger.appendSigned({
    cardId: card.cardId,
    action,
    payload: card.payload,
    privateKeyPem: ctx.keypair.privateKeyPem,
    publicKeyHex: ctx.keypair.publicKeyHex,
    timestamp: ctx.now(),
  })
  const verified = verifyCanonical(ctx.keypair.publicKeyPem, entryBody(entry), entry.signature)
  if (!verified) {
    const error = new Error('refusing to acknowledge an entry that does not verify')
    error.status = 500
    throw error
  }
  ctx.queue.mark(card.cardId, action === 'authorize' ? 'signed' : action === 'reject' ? 'rejected' : 'delegated', {
    signature: entry.signature,
    payloadHash: entry.payloadHash,
  })
  if (action === 'authorize' && card.payload.actionType === 'SWARM_ARM' && card.payload.packId) {
    ctx.swarm.markArmed(card.payload.packId)
  }
  return entry
}

function receipt(entry, extra = {}) {
  return {
    ok: true,
    verified: true,
    simulated: false,
    cardId: entry.cardId,
    action: entry.action,
    signature: entry.signature,
    payloadHash: entry.payloadHash,
    ledgerTip: entry.entryHash,
    provenanceId: entry.seq,
    signedAt: entry.timestamp,
    ...extra,
  }
}

export function createCommandCenter(opts = {}) {
  const dataDir = opts.dataDir || join(here, 'data')
  const packsDir = opts.packsDir || join(here, '..', 'packs')
  const keypair = loadOrCreateKeypair(opts.keyDir || join(dataDir, '.keys'))
  const ledger = new Ledger(opts.ledgerPath || join(dataDir, 'ledger.ndjson'))
  const queue = opts.queue || new CardQueue()
  const swarm = opts.swarm || createSwarm(packsDir)
  const dryRun = opts.dryRun ?? process.env.AIA_DISPATCH_DRY_RUN !== '0'
  const now = opts.now || (() => Date.now())
  const lock = createLock()

  const app = express()
  app.disable('x-powered-by')
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') return res.status(204).end()
    next()
  })
  app.use(express.json({ limit: '1mb' }))

  const publicDir = join(here, 'public')
  if (existsSync(publicDir)) app.use(express.static(publicDir))

  const ctx = {
    app,
    queue,
    ledger,
    keypair,
    swarm,
    dryRun,
    fetchImpl: opts.fetchImpl,
    grok: opts.grok || {},
    now,
    lock,
  }

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'aia-command',
      port: opts.port ?? DEFAULT_PORT,
      publicKey: shortPublicKey(keypair.publicKeyHex),
      ledgerTip: ledger.tipHash(),
      queuePending: queue.list('pending').length,
      dryRun,
      mode: 'hitl',
    })
  })

  app.get('/card_ui.json', (_req, res) => {
    res.json(DEFAULT_CARD_UI)
  })

  app.get('/queue', (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    res.json({ ok: true, cards: queue.list(status), ledgerTip: ledger.tipHash() })
  })

  app.get('/ledger', (req, res) => {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit || 50)))
    const entries = ledger.readEntries()
    res.json({
      ok: true,
      entries: entries.slice(-limit),
      tip: ledger.tipHash(),
      publicKey: keypair.publicKeyHex,
    })
  })

  mountWebhooks(ctx)
  mountSwarm(ctx)
  mountBridge(ctx)

  app.post('/api/sign', (req, res) => {
    if (!requireHitl(req, res)) return
    const cardId = String(req.body?.cardId || '')
    lock(async () => {
      const card = queue.get(cardId)
      if (!card) return res.status(404).json({ ok: false, error: 'Unknown card' })
      if (card.status !== 'pending') {
        return res.status(409).json({ ok: false, error: `Card is already ${card.status}` })
      }
      const entry = commitAction(ctx, card, 'authorize')
      const dispatch = await planDispatch(card, ctx)
      res.json(receipt(entry, { dispatch }))
    }).catch((err) => {
      if (!res.headersSent) res.status(err.status || 500).json({ ok: false, error: err.message || 'sign failed' })
    })
  })

  function settle(action) {
    return (req, res) => {
      if (!requireHitl(req, res)) return
      const cardId = String(req.params.cardId || '')
      lock(async () => {
        const card = queue.get(cardId)
        if (!card) return res.status(404).json({ ok: false, error: 'Unknown card' })
        if (card.status !== 'pending') {
          return res.status(409).json({ ok: false, error: `Card is already ${card.status}` })
        }
        const entry = commitAction(ctx, card, action)
        res.json(receipt(entry))
      }).catch((err) => {
        if (!res.headersSent) res.status(err.status || 500).json({ ok: false, error: err.message || `${action} failed` })
      })
    }
  }

  app.post('/queue/:cardId/reject', settle('reject'))
  app.post('/queue/:cardId/delegate', settle('delegate'))

  return { app, ledger, queue, keypair, swarm, dataDir, dryRun }
}

export function startServer(opts = {}) {
  const port = Number(opts.port ?? process.env.AIA_PORT ?? DEFAULT_PORT)
  const host = opts.host || process.env.AIA_BIND || '127.0.0.1'
  const center = createCommandCenter({ ...opts, port })
  const server = createServer(center.app)
  return new Promise((resolve) => {
    server.listen(port, host, () => {
      console.log(`AIA command center  http://${host}:${port}`)
      console.log('HITL gate on. Dispatch dry-run unless AIA_DISPATCH_DRY_RUN=0.')
      resolve({ ...center, server, port, host })
    })
  })
}

function isMain() {
  const entry = process.argv[1]
  if (!entry) return false
  return import.meta.url === pathToFileURL(entry).href
}

if (isMain()) {
  startServer().catch((err) => {
    console.error(err.message || err)
    process.exit(1)
  })
}
