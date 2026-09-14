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

describe('http server ghl loop', () => {
  it('webhook → authorize → ledger + dispatch', async () => {
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
    const queued = (await wh.json()) as { cardId: string; queued: boolean }
    assert.equal(queued.queued, true)

    vault.putCredential('GHL', 'gohighlevel', 'test-token')

    const auth = await fetch(`${base}/queue/${queued.cardId}/authorize`, { method: 'POST' })
    assert.equal(auth.status, 200)
    const body = (await auth.json()) as {
      ok: boolean
      signature: string
      provenanceId: number
      dispatch: { ok: boolean; dryRun: boolean }
    }
    assert.equal(body.ok, true)
    assert.match(body.signature, /^[0-9a-f]{128}$/i)
    assert.ok(body.provenanceId >= 1)
    assert.equal(body.dispatch.ok, true)
    assert.equal(body.dispatch.dryRun, true)

    const ledger = await fetch(`${base}/ledger`)
    const ledgerBody = (await ledger.json()) as { entries: Array<{ cardId: string; signature: string }> }
    assert.equal(ledgerBody.entries[0].cardId, queued.cardId)
    assert.equal(ledgerBody.entries[0].signature, body.signature)

    const card = vault.getCard(queued.cardId)
    assert.ok(card)
    assert.equal(card!.status, 'dispatched')

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
