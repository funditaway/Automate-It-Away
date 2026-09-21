/**
 * Command-center contract tests.
 * HITL gate, append-only ledger, local Grok fallback, proposal-only bridge.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runDoctor } from '../doctor.js'
import { verifyLedgerFile } from '../lib/ledger.js'
import { createCommandCenter } from '../server.js'

const here = dirname(fileURLToPath(import.meta.url))
const commandRoot = join(here, '..')
const packsDir = join(commandRoot, '..', 'packs')

function listen(app) {
  const server = createServer(app)
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

async function withCenter(fn, extra = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'aia-cmd-'))
  const center = createCommandCenter({ dataDir, packsDir, ...extra })
  const server = await listen(center.app)
  const { port } = server.address()
  const base = `http://127.0.0.1:${port}`
  try {
    await fn({ ...center, base, dataDir })
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

async function request(base, path, options = {}) {
  const res = await fetch(base + path, {
    method: options.method || 'GET',
    headers: { 'content-type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

test('webhook ingest queues a card and does not sign the ledger', async () => {
  await withCenter(async ({ base, ledger }) => {
    const queued = await request(base, '/webhook/ghl', {
      method: 'POST',
      body: { type: 'ContactCreate', contactId: 'c-1', contact: { status: 'open', tags: ['inbound'] } },
    })
    assert.equal(queued.status, 202)
    assert.equal(queued.body.executed, false)
    assert.equal(queued.body.status, 'pending')
    assert.equal(queued.body.synthesis, 'local')
    assert.equal(ledger.readEntries().length, 0)

    const queue = await request(base, '/queue?status=pending')
    assert.equal(queue.body.cards.length, 1)
    assert.equal(queue.body.cards[0].payload.riskLevel, 'high')
  })
})

test('authorize without confirm is refused and writes nothing', async () => {
  await withCenter(async ({ base, ledger }) => {
    const queued = await request(base, '/webhook/ghl', {
      method: 'POST',
      body: { type: 'ContactCreate', contactId: 'c-2' },
    })
    const denied = await request(base, '/api/sign', {
      method: 'POST',
      body: { cardId: queued.body.cardId },
    })
    assert.equal(denied.status, 409)
    assert.equal(ledger.readEntries().length, 0)
  })
})

test('explicit confirm signs an Ed25519 ledger line and a second sign is refused', async () => {
  await withCenter(async ({ base, ledger, keypair, dataDir }) => {
    const queued = await request(base, '/webhook/smarthq', {
      method: 'POST',
      body: { event: 'cycle_complete', deviceId: 'dryer-1', packId: 'home' },
    })
    const signed = await request(base, '/api/sign', {
      method: 'POST',
      body: { cardId: queued.body.cardId, confirm: true },
    })
    assert.equal(signed.status, 200)
    assert.equal(signed.body.verified, true)
    assert.equal(signed.body.dispatch.executed, false)
    assert.equal(signed.body.dispatch.dryRun, true)
    assert.equal(ledger.readEntries().length, 1)

    const verified = verifyLedgerFile(join(dataDir, 'ledger.ndjson'), keypair.publicKeyPem)
    assert.equal(verified.ok, true)
    assert.equal(verified.count, 1)

    const again = await request(base, '/api/sign', {
      method: 'POST',
      body: { cardId: queued.body.cardId, confirm: true },
    })
    assert.equal(again.status, 409)
    assert.equal(ledger.readEntries().length, 1)
  })
})

test('a tampered ledger line fails verification', async () => {
  await withCenter(async ({ base, keypair, dataDir }) => {
    const queued = await request(base, '/webhook/telemetry', {
      method: 'POST',
      body: { event: 'ping', packId: 'aia' },
    })
    await request(base, '/api/sign', {
      method: 'POST',
      body: { cardId: queued.body.cardId, confirm: true },
    })
    const ledgerPath = join(dataDir, 'ledger.ndjson')
    const original = readFileSync(ledgerPath, 'utf8')
    const entry = JSON.parse(original.trim())
    entry.payloadHash = 'f'.repeat(64)
    writeFileSync(ledgerPath, JSON.stringify(entry) + '\n')
    const verified = verifyLedgerFile(ledgerPath, keypair.publicKeyPem)
    assert.equal(verified.ok, false)
    assert.ok(verified.errors.some((line) => /entryHash|signature/i.test(line)))
  })
})

test('Grok synthesis is used when the API answers, and local fallback survives a thrown fetch', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'aia-grok-'))
  let calls = 0
  const center = createCommandCenter({
    dataDir,
    packsDir,
    grok: { apiKey: 'test-key', apiUrl: 'https://api.x.ai/v1/chat/completions', model: 'grok-3' },
    fetchImpl: async () => {
      calls += 1
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: 'Grok drafted a review',
                  riskLevel: 'medium',
                  actionType: 'GROK_REVIEW',
                  systemPrompt: 'draft only',
                  agentInstructions: 'wait for YES',
                  constraints: ['no send'],
                  diffData: { before: { a: 1 }, after: { a: 2 } },
                }),
              },
            },
          ],
        }),
      }
    },
  })
  const server = await listen(center.app)
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    const queued = await request(base, '/webhook/ghl', {
      method: 'POST',
      body: { type: 'NoteCreate', contactId: 'n-1' },
    })
    assert.equal(queued.body.synthesis, 'grok')
    assert.equal(calls, 1)
    const card = center.queue.get(queued.body.cardId)
    assert.equal(card.payload.summary, 'Grok drafted a review')
    assert.equal(card.payload.riskLevel, 'medium')
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }

  const fallbackDir = mkdtempSync(join(tmpdir(), 'aia-grok-fail-'))
  const fallback = createCommandCenter({
    dataDir: fallbackDir,
    packsDir,
    grok: { apiKey: 'test-key' },
    fetchImpl: async () => {
      throw new Error('spacexai down')
    },
  })
  const server2 = await listen(fallback.app)
  const base2 = `http://127.0.0.1:${server2.address().port}`
  try {
    const queued = await request(base2, '/webhook/telemetry', {
      method: 'POST',
      body: { event: 'status', packName: 'Telemetry' },
    })
    assert.equal(queued.status, 202)
    assert.equal(queued.body.synthesis, 'local')
    assert.equal(queued.body.executed, false)
  } finally {
    await new Promise((resolve) => server2.close(resolve))
  }
})

test('swarm arm is a pending card until a human signs it', async () => {
  await withCenter(async ({ base, swarm }) => {
    const listed = await request(base, '/api/swarm')
    assert.ok(listed.body.packs.some((pack) => pack.id === 'consign' && pack.armed === false))
    const armed = await request(base, '/api/swarm/consign/arm', { method: 'POST', body: {} })
    assert.equal(armed.status, 202)
    assert.equal(armed.body.executed, false)
    assert.equal(swarm.get('consign') && swarm.list().find((pack) => pack.id === 'consign').armed, false)
    const signed = await request(base, '/api/sign', {
      method: 'POST',
      body: { cardId: armed.body.cardId, confirm: true },
    })
    assert.equal(signed.status, 200)
    assert.equal(swarm.list().find((pack) => pack.id === 'consign').armed, true)
  })
})

test('bridge proposals never broadcast and do not call fetch', async () => {
  let called = 0
  await withCenter(
    async ({ base }) => {
      const status = await request(base, '/api/bridge')
      assert.equal(status.body.broadcast, false)
      assert.equal(status.body.mode, 'proposal-only')
      const proposed = await request(base, '/api/bridge/propose', {
        method: 'POST',
        body: { kind: 'transfer', chainId: 8453, amount: '0.01', asset: 'ETH', to: '0xabc' },
      })
      assert.equal(proposed.status, 202)
      assert.equal(proposed.body.broadcast, false)
      assert.equal(proposed.body.executed, false)
      const card = (await request(base, '/queue?status=pending')).body.cards[0]
      assert.equal(card.payload.riskLevel, 'critical')
      assert.equal(card.payload.actionType, 'BRIDGE_TRANSFER')
      assert.equal(called, 0)
    },
    {
      fetchImpl: async () => {
        called += 1
        throw new Error('broadcast attempted')
      },
    },
  )
})

test('reject requires confirm and appends a signed line', async () => {
  await withCenter(async ({ base, ledger }) => {
    const queued = await request(base, '/webhook/ghl', {
      method: 'POST',
      body: { type: 'ContactCreate', contactId: 'c-9' },
    })
    const denied = await request(base, `/queue/${queued.body.cardId}/reject`, { method: 'POST', body: {} })
    assert.equal(denied.status, 409)
    const rejected = await request(base, `/queue/${queued.body.cardId}/reject`, {
      method: 'POST',
      body: { confirm: true },
    })
    assert.equal(rejected.status, 200)
    assert.equal(ledger.readEntries()[0].action, 'reject')
  })
})

test('doctor passes on a fresh data dir with the repo packs', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'aia-doc-'))
  const report = await runDoctor({ dataDir, packsDir })
  assert.equal(report.ok, true)
  assert.ok(report.checks.some((item) => item.name === 'ledger' && item.status === 'pass'))
  const grok = report.checks.find((item) => item.name === 'grok')
  assert.ok(grok && (grok.status === 'warn' || grok.status === 'pass'))
})

test('the desk is a single index.html with queue, Enter, and simulation fallback', () => {
  const html = readFileSync(join(commandRoot, 'public', 'index.html'), 'utf8')
  for (const bit of [
    'bg-desk-900',
    'font-mono',
    'Active Decision Queue',
    'YES: AUTHORIZE',
    '[ENTER]',
    'keydown',
    'enterSimulation',
    'http://localhost:3000',
    'critical-glow',
    'SIMULATE GHL WEBHOOK',
    'type="module"',
  ]) {
    assert.ok(html.includes(bit), 'index.html missing ' + bit)
  }
  assert.equal(html.includes('react'), false)
})

test('verifyLedger CLI accepts an empty ledger', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'aia-cli-'))
  const result = spawnSync(process.execPath, [join(commandRoot, 'verifyLedger.js'), join(dataDir, 'ledger.ndjson')], {
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(result.stdout, /ledger ok/)
})
