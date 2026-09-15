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

    res.json({
      ok: true,
      cardId: card.cardId,
      signature,
      payloadHash: hash,
      provenanceId: entry.id,
      ledgerTip: vault.ledgerTipHash(),
      dispatch,
      recommendations: nextActions.map((c) => ({
        cardId: c.cardId,
        actionType: c.payload.actionType,
        recommendationKind: c.payload.recommendationKind,
        status: c.status,
      })),
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
      note: 'Authorize pending cards via POST /queue/:cardId/authorize to resume the sandbox',
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

  return { app, vault, keypair, sandbox, dataDir }
}

export function startServer(opts: CreateServerOptions = {}) {
  const port = opts.port ?? Number(process.env.AIA_RUNTIME_PORT || DEFAULT_PORT)
  const { app, vault, keypair } = createApp({ ...opts, port })
  const server = app.listen(port, '127.0.0.1', () => {
    console.log(`[AIA runtime] listening on http://127.0.0.1:${port}`)
    console.log(`[AIA runtime] desk UI http://127.0.0.1:${port}/`)
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
