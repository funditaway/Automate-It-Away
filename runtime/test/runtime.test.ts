import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { VaultDb } from '../src/db.js'
import {
  canonicalJson,
  loadOrCreateKeypair,
  payloadHash,
  signCanonical,
  verifyCanonical,
} from '../src/crypto.js'
import { createApp } from '../src/server.js'
import { SandboxManager } from '../src/sandboxManager.js'
import { cardFromGhlWebhook, dispatchToGhl } from '../src/ghl.js'
import {
  compileTemplate,
  selectTemplate,
  synthesizeMetaPrompt,
} from '../src/promptSynthesizer.js'
import {
  enqueueRecommendations,
  recommendNextActions,
} from '../src/recommendationEngine.js'
import { requiresAuthorization, packageSensitiveRequest } from '../src/sandboxWorker.js'

function tempWorkspace(): { root: string; dataDir: string; keyDir: string; dbPath: string } {
  const root = mkdtempSync(join(tmpdir(), 'aia-runtime-'))
  const dataDir = join(root, 'data')
  const keyDir = join(root, '.keys')
  mkdirSync(dataDir, { recursive: true })
  mkdirSync(keyDir, { recursive: true })
  return { root, dataDir, keyDir, dbPath: join(dataDir, 'aia_vault.db') }
}

describe('crypto', () => {
  it('canonicalizes JSON with sorted keys', () => {
    assert.equal(canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}')
  })

  it('signs and verifies Ed25519 over canonical payload', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aia-keys-'))
    const kp = loadOrCreateKeypair(dir)
    const payload = { cardId: 'c1', payload: { agentId: 'a', z: 1, a: 2 } }
    const sig = signCanonical(kp.privateKeyPem, payload)
    assert.match(sig, /^[0-9a-f]+$/i)
    assert.equal(sig.length, 128)
    assert.equal(verifyCanonical(kp.publicKeyPem, payload, sig), true)
    assert.equal(verifyCanonical(kp.publicKeyPem, { ...payload, cardId: 'other' }, sig), false)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('vault db', () => {
  it('encrypts credentials and appends provenance', () => {
    const ws = tempWorkspace()
    const vault = new VaultDb({ dbPath: ws.dbPath, keyDir: ws.keyDir })
    vault.putCredential('GHL Live', 'gohighlevel', 'pit-secret-key-1234')
    assert.equal(vault.getCredential('gohighlevel'), 'pit-secret-key-1234')
    const listed = vault.listCredentials()
    assert.equal(listed[0].last4, '1234')
    assert.ok(!JSON.stringify(listed).includes('pit-secret'))

    const card = vault.enqueueCard({
      agentId: 'agent_test',
      packName: 'Test',
      actionType: 'GHL_TEST',
      riskLevel: 'high',
      targetEndpoint: 'https://services.leadconnectorhq.com/contacts/1',
      summary: 'test',
      timestamp: Date.now(),
    })
    assert.equal(card.status, 'pending')

    const kp = loadOrCreateKeypair(ws.keyDir)
    const signature = signCanonical(kp.privateKeyPem, { cardId: card.cardId, payload: card.payload })
    const hash = payloadHash(card.payload)
    vault.updateCardStatus(card.cardId, 'signed', { signature })
    const entry = vault.appendProvenance({
      cardId: card.cardId,
      payloadHash: hash,
      agentId: card.payload.agentId,
      signature,
    })
    assert.ok(entry.id >= 1)
    assert.equal(vault.listProvenance(1)[0].signature, signature)
    assert.equal(verifyCanonical(kp.publicKeyPem, { cardId: card.cardId, payload: card.payload }, signature), true)
    vault.close()
    rmSync(ws.root, { recursive: true, force: true })
  })
})

describe('meta-prompt synthesizer', () => {
  it('compiles templates from slots without handler-hardcoded prose', () => {
    const out = compileTemplate('Hello {{contact.name|lead}} via {{event}}', {
      contact: { name: 'Ada' },
      event: 'ContactCreate',
    })
    assert.equal(out, 'Hello Ada via ContactCreate')
    assert.equal(selectTemplate('OpportunityStageUpdate').id, 'ghl.opportunity.stage')
  })

  it('synthesizes a Decision Card + meta-prompt from a GHL webhook + vault context', () => {
    const bundle = synthesizeMetaPrompt(
      {
        type: 'ContactCreate',
        contactId: 'abc',
        contact: { id: 'abc', tags: ['new'], status: 'open', fullName: 'Ada Lovelace' },
        locationId: 'loc1',
      },
      {
        agentId: 'agent_ghl_inbound',
        packName: 'Lead Pack',
        credentials: [{ label: 'GHL', provider: 'gohighlevel', last4: '9999' }],
        deskRules: ['When lead → If new → Then nurture'],
      },
    )
    assert.equal(bundle.templateId, 'ghl.contact.created')
    assert.match(bundle.systemPrompt, /agent_ghl_inbound/)
    assert.match(bundle.agentInstructions, /Ada Lovelace/)
    assert.match(bundle.agentInstructions, /gohighlevel/)
    assert.ok(bundle.constraints.some((c) => /Active Decision Cards|HOLD|desk/.test(c)))
    assert.ok(bundle.constraints.some((c) => /When lead/.test(c)))
    assert.equal(bundle.decisionPayload.source, 'ghl_webhook')
    assert.ok(bundle.decisionPayload.metaPrompt)
    assert.equal(bundle.decisionPayload.metaPrompt?.templateId, 'ghl.contact.created')
    assert.match(bundle.decisionPayload.targetEndpoint, /leadconnectorhq\.com/)
    assert.deepEqual(bundle.outputSchema.required, ['diffData', 'suggestedAction'])
  })
})

describe('recommendation engine', () => {
  it('queues next-action cards after successful completion (no cascade)', () => {
    const ws = tempWorkspace()
    const vault = new VaultDb({ dbPath: ws.dbPath, keyDir: ws.keyDir })
    const parent = vault.enqueueCard({
      agentId: 'agent_test',
      packName: 'Lead Pack',
      actionType: 'GHL_CONTACTCREATE',
      riskLevel: 'high',
      targetEndpoint: 'https://services.leadconnectorhq.com/contacts/c-1',
      summary: 'tag contact',
      source: 'ghl_webhook',
      webhookEvent: 'ContactCreate',
      diffData: { before: { contactId: 'c-1' }, after: { contactId: 'c-1' } },
      timestamp: Date.now(),
    })
    vault.updateCardStatus(parent.cardId, 'dispatched')
    const completed = vault.getCard(parent.cardId)!
    const recs = enqueueRecommendations(vault, { completedCard: completed })
    assert.ok(recs.length >= 1)
    assert.equal(recs[0].status, 'pending')
    assert.equal(recs[0].payload.source, 'recommendation')
    assert.ok(recs[0].payload.parentCardId === parent.cardId)

    // Sovereign: recommendations do not auto-cascade
    const cascaded = recommendNextActions({
      completedCard: { ...recs[0], status: 'dispatched' },
    })
    assert.equal(cascaded.length, 0)
    vault.close()
    rmSync(ws.root, { recursive: true, force: true })
  })

  it('turns CRM reply feedback into outreach + schedule recommendations', () => {
    const ws = tempWorkspace()
    const vault = new VaultDb({ dbPath: ws.dbPath, keyDir: ws.keyDir })
    const parent = vault.enqueueCard({
      agentId: 'a',
      packName: 'p',
      actionType: 'GHL_OUTBOUND',
      riskLevel: 'high',
      targetEndpoint: 'https://services.leadconnectorhq.com/contacts/c-9',
      summary: 'prior',
      source: 'ghl_webhook',
      timestamp: Date.now(),
    })
    vault.updateCardStatus(parent.cardId, 'dispatched')
    const recs = recommendNextActions({
      completedCard: vault.getCard(parent.cardId)!,
      feedback: { contactReplied: true, contactId: 'c-9', event: 'InboundMessage' },
    })
    assert.ok(recs.some((r) => r.kind === 'follow_up_outreach'))
    assert.ok(recs.some((r) => r.kind === 'schedule_appointment'))
    vault.close()
    rmSync(ws.root, { recursive: true, force: true })
  })
})

describe('sandbox protocol', () => {
  it('requires authorization for high-stakes URLs', () => {
    assert.equal(
      requiresAuthorization({
        url: 'https://services.leadconnectorhq.com/contacts/',
        method: 'POST',
      }),
      true,
    )
    assert.equal(requiresAuthorization({ url: 'local-note', method: 'GET' }), false)
    const packaged = packageSensitiveRequest({
      url: 'https://services.leadconnectorhq.com/contacts/1',
      method: 'DELETE',
    })
    assert.equal(packaged.riskLevel, 'critical')
  })
})

describe('ghl mapping + dry dispatch', () => {
  it('builds a decision card from webhook body', () => {
    const payload = cardFromGhlWebhook({
      type: 'ContactCreate',
      contactId: 'abc',
      contact: { id: 'abc', tags: ['new'], status: 'open' },
      locationId: 'loc1',
    })
    assert.equal(payload.source, 'ghl_webhook')
    assert.equal(payload.riskLevel, 'high')
    assert.match(payload.targetEndpoint, /leadconnectorhq\.com/)
  })

  it('dry-runs outbound dispatch', async () => {
    const ws = tempWorkspace()
    const vault = new VaultDb({ dbPath: ws.dbPath, keyDir: ws.keyDir })
    vault.putCredential('GHL', 'gohighlevel', 'token-xyz')
    const result = await dispatchToGhl(
      vault,
      {
        agentId: 'a',
        packName: 'p',
        actionType: 'GHL_WEBHOOK_OUTBOUND',
        riskLevel: 'high',
        targetEndpoint: 'https://services.leadconnectorhq.com/contacts/',
        method: 'POST',
        body: { tags: ['x'] },
        summary: 's',
        timestamp: Date.now(),
      },
      { dryRun: true },
    )
    assert.equal(result.ok, true)
    assert.equal(result.dryRun, true)
    vault.close()
    rmSync(ws.root, { recursive: true, force: true })
  })
})

describe('desk terminal', () => {
  it('serves the sovereign desk UI', async () => {
    const ws = tempWorkspace()
    const { app, vault } = createApp({
      dataDir: ws.dataDir,
      dbPath: ws.dbPath,
      keyDir: ws.keyDir,
      dryRun: true,
    })
    const server = app.listen(0, '127.0.0.1')
    await new Promise<void>((r) => server.once('listening', () => r()))
    const { port } = server.address() as { port: number }
    const res = await fetch(`http://127.0.0.1:${port}/`)
    assert.equal(res.status, 200)
    const html = await res.text()
    assert.match(html, /Active Decision Queue/)
    assert.match(html, /SIMULATE GHL WEBHOOK/)
    assert.match(html, /\/api\/sign/)
    assert.match(html, /Visual Audit Receipt/)
    assert.match(html, /Meta-Prompt Synthesis/)
    assert.match(html, /toggleSimulation/)
    server.close()
    vault.close()
    rmSync(ws.root, { recursive: true, force: true })
  })
})

describe('realtime + /api/sign', () => {
  it('signs via POST /api/sign and streams SSE events', async () => {
    const ws = tempWorkspace()
    const { app, vault, attachRealtime } = createApp({
      dataDir: ws.dataDir,
      dbPath: ws.dbPath,
      keyDir: ws.keyDir,
      dryRun: true,
    })
    const { createServer } = await import('node:http')
    const server = createServer(app)
    attachRealtime(server)
    server.listen(0, '127.0.0.1')
    await new Promise<void>((r) => server.once('listening', () => r()))
    const { port } = server.address() as { port: number }
    const base = `http://127.0.0.1:${port}`

    const events: string[] = []
    const streamRes = await fetch(`${base}/api/stream`)
    assert.equal(streamRes.status, 200)
    assert.match(String(streamRes.headers.get('content-type')), /text\/event-stream/)
    const reader = streamRes.body!.getReader()
    const decoder = new TextDecoder()
    const readHello = (async () => {
      let buf = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        if (buf.includes('event: hello')) {
          events.push('hello')
          break
        }
      }
    })()
    await Promise.race([readHello, new Promise((_, rej) => setTimeout(() => rej(new Error('SSE timeout')), 3000))])

    const created = await fetch(`${base}/queue`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        payload: {
          agentId: 'agent_sse',
          packName: 'SSE Pack',
          actionType: 'GHL_TEST_SIGN',
          riskLevel: 'high',
          targetEndpoint: 'https://services.leadconnectorhq.com/contacts/1',
          summary: 'sign via api',
          timestamp: Date.now(),
        },
      }),
    })
    assert.equal(created.status, 201)
    const cardBody = (await created.json()) as { card: { cardId: string } }

    vault.putCredential('GHL', 'gohighlevel', 'test-token')
    const signed = await fetch(`${base}/api/sign`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cardId: cardBody.card.cardId }),
    })
    assert.equal(signed.status, 200)
    const sigBody = (await signed.json()) as {
      ok: boolean
      signature: string
      payloadHash: string
      verified: boolean
      provenanceId: number
    }
    assert.equal(sigBody.ok, true)
    assert.equal(sigBody.verified, true)
    assert.match(sigBody.signature, /^[0-9a-f]{128}$/i)
    assert.ok(sigBody.payloadHash)
    assert.ok(sigBody.provenanceId >= 1)
    assert.ok(events.includes('hello'))

    try { reader.cancel() } catch { /* ignore */ }
    server.close()
    vault.close()
    rmSync(ws.root, { recursive: true, force: true })
  })
})

describe('http server closed-loop orchestration', () => {
  it('webhook → synthesize meta-prompt → authorize → ledger + dispatch → recommendations', async () => {
    const ws = tempWorkspace()
    const { app, vault } = createApp({
      dataDir: ws.dataDir,
      dbPath: ws.dbPath,
      keyDir: ws.keyDir,
      dryRun: true,
    })
    const server = app.listen(0, '127.0.0.1')
    await new Promise<void>((r) => server.once('listening', () => r()))
    const { port } = server.address() as { port: number }
    const base = `http://127.0.0.1:${port}`

    const wh = await fetch(`${base}/webhook/ghl`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'OpportunityStageUpdate',
        contactId: 'c-99',
        contact: { id: 'c-99', tags: ['lead'] },
        suggestedAction: {
          method: 'PUT',
          endpoint: '/contacts/c-99',
          body: { tags: ['nurture'] },
        },
      }),
    })
    assert.equal(wh.status, 202)
    const queued = (await wh.json()) as {
      cardId: string
      queued: boolean
      metaPrompt: { templateId: string; systemPrompt: string }
    }
    assert.equal(queued.queued, true)
    assert.ok(queued.metaPrompt)
    assert.equal(queued.metaPrompt.templateId, 'ghl.opportunity.stage')
    assert.match(queued.metaPrompt.systemPrompt, /pipeline/)

    const stored = vault.getCard(queued.cardId)!
    assert.ok(stored.payload.metaPrompt?.systemPrompt)

    vault.putCredential('GHL', 'gohighlevel', 'test-token')

    const auth = await fetch(`${base}/queue/${queued.cardId}/authorize`, { method: 'POST' })
    assert.equal(auth.status, 200)
    const body = (await auth.json()) as {
      ok: boolean
      signature: string
      provenanceId: number
      dispatch: { ok: boolean; dryRun: boolean }
      recommendations: Array<{ cardId: string; status: string; recommendationKind: string }>
    }
    assert.equal(body.ok, true)
    assert.match(body.signature, /^[0-9a-f]{128}$/i)
    assert.ok(body.provenanceId >= 1)
    assert.equal(body.dispatch.ok, true)
    assert.equal(body.dispatch.dryRun, true)
    assert.ok(body.recommendations.length >= 1)
    assert.equal(body.recommendations[0].status, 'pending')

    const ledger = await fetch(`${base}/ledger`)
    const ledgerBody = (await ledger.json()) as { entries: Array<{ cardId: string; signature: string }> }
    assert.equal(ledgerBody.entries[0].cardId, queued.cardId)
    assert.equal(ledgerBody.entries[0].signature, body.signature)

    const card = vault.getCard(queued.cardId)
    assert.ok(card)
    assert.equal(card!.status, 'dispatched')

    // Recommendation cards sit in the queue awaiting human sign-off
    const pendingRec = vault.getCard(body.recommendations[0].cardId)!
    assert.equal(pendingRec.payload.source, 'recommendation')
    assert.equal(pendingRec.status, 'pending')

    server.close()
    vault.close()
    rmSync(ws.root, { recursive: true, force: true })
  })
})

describe('sandbox interceptor', () => {
  it('pauses on sensitive call and resumes after authorize', async () => {
    const ws = tempWorkspace()
    const vault = new VaultDb({ dbPath: ws.dbPath, keyDir: ws.keyDir })
    const kp = loadOrCreateKeypair(ws.keyDir)
    const sandbox = new SandboxManager(vault)

    const scriptPath = join(ws.root, 'logic.js')
    writeFileSync(
      scriptPath,
      `
      async function run(context, aia) {
        const out = await aia.http({
          method: 'POST',
          url: 'https://services.leadconnectorhq.com/contacts/',
          body: { email: 'a@b.com' },
          actionType: 'GHL_CONTACT_CREATE',
        });
        return out;
      }
      module.exports = { run };
      `,
    )

    const runPromise = sandbox.runLogic({
      agentId: 'agent_sandbox',
      packName: 'Test Pack',
      scriptPath,
      authTimeoutMs: 10_000,
      metaPrompt: {
        templateId: 'ghl.contact.created',
        systemPrompt: 'test system',
        agentInstructions: 'test instructions',
        constraints: ['no autonomous send'],
      },
    })

    // Wait until card is queued
    let cardId = ''
    for (let i = 0; i < 40; i++) {
      const pending = vault.listCards('pending')
      if (pending.length) {
        cardId = pending[0].cardId
        break
      }
      await new Promise((r) => setTimeout(r, 50))
    }
    assert.ok(cardId, 'expected a pending decision card')

    const card = vault.getCard(cardId)!
    const signature = signCanonical(kp.privateKeyPem, { cardId, payload: card.payload })
    vault.updateCardStatus(cardId, 'signed', { signature })
    vault.appendProvenance({
      cardId,
      payloadHash: payloadHash(card.payload),
      agentId: card.payload.agentId,
      signature,
    })

    const result = await runPromise
    assert.equal(result.ok, true)
    assert.equal(result.cards.length, 1)
    assert.equal(result.cards[0].status, 'signed')
    assert.ok(result.result && (result.result as { authorized: boolean }).authorized)

    vault.close()
    rmSync(ws.root, { recursive: true, force: true })
  })
})
