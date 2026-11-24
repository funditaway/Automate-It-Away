/**
 * Command-center contract tests.
 * HITL gate, append-only ledger, local Grok fallback, proposal-only bridge.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runDoctor } from '../doctor.js'
import { archiveLedgerWindow } from '../archiveLedgerWindow.js'
import { buildAuditBundle, writeAuditBundle } from '../exportAudit.js'
import { loadTrustedPublicKeys, rotateKeypair } from '../lib/keys.js'
import { Ledger, verifyLedgerFile } from '../lib/ledger.js'
import { flushSpool } from '../flushSpool.js'
import { requeueDeadletter } from '../requeueDeadletter.js'
import { reconcileQueue } from '../reconcileQueue.js'
import { createCommandCenter } from '../server.js'
import { canonicalJson, sha256Text } from '../lib/canonical.js'
import { buildStatusSummary } from '../statusSummary.js'
import { verifyAuditBundle, verifyAuditBundleFile } from '../verifyAuditBundle.js'
import { verifyLedgerSlice } from '../verifyLedgerSlice.js'

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
    assert.equal(queued.body.schema, 'active-decision-card')
    assert.match(queued.body.cardId, /^[0-9a-f]{32}$/i)
    assert.equal(ledger.readEntries().length, 0)

    const queue = await request(base, '/queue?status=pending')
    assert.equal(queue.body.cards.length, 1)
    const card = queue.body.cards[0]
    assert.equal(card.payload.riskLevel, 'high')
    assert.equal(typeof card.payload.metaPrompt, 'string')
    assert.ok(card.payload.metaPrompt.length > 0)
    assert.equal(typeof card.payload.nextRecommendation, 'string')
    assert.ok(card.payload.nextRecommendation.length > 0)
    assert.equal(typeof card.payload.resourceCost?.amount, 'string')
    assert.equal(typeof card.payload.resourceCost?.token, 'string')
    assert.equal(typeof card.payload.diffData?.before, 'object')
    assert.equal(typeof card.payload.diffData?.after, 'object')
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
      assert.equal(proposed.body.schema, 'active-decision-card')
      assert.match(proposed.body.cardId, /^[0-9a-f]{32}$/i)
      const card = (await request(base, '/queue?status=pending')).body.cards[0]
      assert.equal(card.payload.riskLevel, 'critical')
      assert.equal(card.payload.actionType, 'BRIDGE_TRANSFER')
      assert.equal(typeof card.payload.metaPrompt, 'string')
      assert.equal(typeof card.payload.nextRecommendation, 'string')
      assert.equal(card.payload.resourceCost.amount, '0.01')
      assert.equal(card.payload.resourceCost.token, 'ETH')
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

test('appliance telemetry normalizes to AIA before/after diffs with energyRate', async () => {
  const {
    normalizeApplianceTelemetry,
    preferLocalEndpoint,
    riskForPhysicalAction,
    DeviceConnectionManager,
  } = await import('../lib/appliance.js')

  const cycle = normalizeApplianceTelemetry({
    event: 'cycle_complete',
    deviceId: 'washer-1',
    mqttTopic: 'home/laundry/washer',
    cloudUrl: 'https://api.example.com/smarthq/washer-1',
    watts: 40,
  })
  assert.equal(cycle.diffData.before.status, 'running')
  assert.equal(cycle.diffData.before.energyRate, 'high')
  assert.equal(cycle.diffData.after.status, 'complete')
  assert.equal(cycle.diffData.after.energyRate, 'low')
  assert.equal(cycle.diffData.after.savingsEstimated, '$0.12')
  assert.equal(cycle.targetEndpoint, 'home/laundry/washer')
  assert.equal(preferLocalEndpoint('https://cloud.example/x', 'mqtt://broker/home'), 'mqtt://broker/home')
  assert.equal(riskForPhysicalAction('unlock door'), 'high')
  assert.equal(riskForPhysicalAction('start_cycle'), 'medium')
  assert.equal(riskForPhysicalAction('cycle_complete'), 'low')

  const mgr = new DeviceConnectionManager({ baseDelayMs: 10 })
  mgr.discover({ deviceId: 'dryer-9', mqttTopic: 'home/laundry/dryer' })
  const retry = mgr.enqueueDeviceRetry('dryer-9', { reason: 'link_lost' })
  assert.equal(retry.status, 'retry_scheduled')
  assert.equal(mgr.getDevice('dryer-9').online, false)
  assert.equal(mgr.listDueRetries(Date.now() + 50).length, 1)
})

test('smarthq webhook uses appliance diffs; physical action requires medium+ and ENTER gate', async () => {
  await withCenter(async ({ base, queue }) => {
    const telemetry = await request(base, '/webhook/smarthq', {
      method: 'POST',
      body: {
        event: 'cycle_complete',
        deviceId: 'dryer-1',
        packId: 'home',
        mqttTopic: 'home/laundry/dryer',
        cloudUrl: 'https://api.geappliances.com/v1/dryer-1',
      },
    })
    assert.equal(telemetry.status, 202)
    const telCard = queue.get(telemetry.body.cardId)
    assert.equal(telCard.payload.diffData.before.status, 'running')
    assert.equal(telCard.payload.diffData.before.energyRate, 'high')
    assert.equal(telCard.payload.diffData.after.status, 'complete')
    assert.ok(telCard.payload.diffData.after.energyRate)
    assert.match(telCard.payload.targetEndpoint, /home\/laundry\/dryer|smarthq:/)

    const action = await request(base, '/api/appliance/action', {
      method: 'POST',
      body: { event: 'unlock', deviceId: 'door-1', mqttTopic: 'home/doors/front' },
    })
    assert.equal(action.status, 202)
    assert.equal(action.body.requiresEnter, true)
    assert.equal(action.body.executed, false)
    assert.ok(['medium', 'high', 'critical'].includes(action.body.riskLevel))
    const actCard = queue.get(action.body.cardId)
    assert.ok(['medium', 'high', 'critical'].includes(actCard.payload.riskLevel))

    const drop = await request(base, '/api/appliance/connection-drop', {
      method: 'POST',
      body: { deviceId: 'dryer-1', reason: 'mqtt_timeout', notifyQueue: true },
    })
    assert.equal(drop.status, 202)
    assert.equal(drop.body.uiLocked, false)
    assert.equal(drop.body.retry.status, 'retry_scheduled')
    assert.ok(drop.body.queuedNotice?.cardId)
  })
})

test('pack adapter events normalize to the universal Active Decision Card schema', async () => {
  await withCenter(async ({ base }) => {
    const queued = await request(base, '/api/pack/home/event', {
      method: 'POST',
      body: {
        event: 'door.open',
        summary: 'Front door reported open. Hold unlock.',
        mqttTopic: 'home/doors/front',
        riskLevel: 'high',
      },
    })
    assert.equal(queued.status, 202)
    assert.equal(queued.body.executed, false)
    assert.equal(queued.body.schema, 'active-decision-card')
    assert.match(queued.body.cardId, /^[0-9a-f]{32}$/i)
    const card = (await request(base, '/queue?status=pending')).body.cards[0]
    assert.equal(card.status, 'pending')
    assert.equal(card.payload.targetEndpoint, 'home/doors/front')
    assert.equal(typeof card.payload.metaPrompt, 'string')
    assert.match(card.payload.nextRecommendation, /Yes|Stop|authorize/i)
  })
})

test('decisionCard normalizer rejects incomplete payloads and coerces metaPrompt to string', async () => {
  const { isUniversalDecisionCard, metaPromptToString, toUniversalDecisionCard } = await import(
    '../lib/decisionCard.js'
  )
  assert.throws(() => toUniversalDecisionCard({ agentId: 'a' }), /targetEndpoint/)
  const card = toUniversalDecisionCard({
    agentId: 'agent_x',
    packName: 'Test',
    actionType: 'TEST_ACT',
    riskLevel: 'low',
    targetEndpoint: 'mqtt://desk/test',
    summary: 'unit',
    metaPrompt: {
      source: 'local',
      systemPrompt: 'Draft only.',
      agentInstructions: 'Hold.',
      constraints: ['no send'],
    },
  })
  assert.equal(isUniversalDecisionCard(card), true)
  assert.equal(typeof card.payload.metaPrompt, 'string')
  assert.match(card.payload.metaPrompt, /Draft only/)
  assert.match(metaPromptToString({ systemPrompt: 'x' }), /x/)
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

test('exportAudit builds a private-key-free bundle with a stable bundleSha256', async () => {
  await withCenter(async ({ base, dataDir }) => {
    const queued = await request(base, '/webhook/telemetry', {
      method: 'POST',
      body: { event: 'audit-export', packId: 'aia' },
    })
    const signed = await request(base, '/api/sign', {
      method: 'POST',
      body: { cardId: queued.body.cardId, confirm: true },
    })
    assert.equal(signed.status, 200)

    const outDir = join(dataDir, 'audits')
    const bundle = buildAuditBundle({
      dataDir,
      keyDir: join(dataDir, '.keys'),
      cardId: queued.body.cardId,
      exportedAt: '2026-01-01T00:00:00.000Z',
    })
    assert.equal(bundle.exportedEntryCount, 1)
    assert.equal(bundle.verification.ok, true)
    assert.equal(bundle.scope.cardId, queued.body.cardId)
    assert.ok(bundle.bundleSha256)
    assert.equal(JSON.stringify(bundle).includes('BEGIN PRIVATE KEY'), false)
    assert.equal(JSON.stringify(bundle).includes('ed25519.pem'), false)

    const { bundleSha256, ...unsigned } = bundle
    assert.equal(sha256Text(canonicalJson(unsigned)), bundleSha256)

    const outPath = writeAuditBundle(bundle, join(outDir, 'proof.json'), outDir)
    const written = JSON.parse(readFileSync(outPath, 'utf8'))
    assert.equal(written.bundleSha256, bundle.bundleSha256)
    assert.equal(written.entries[0].record.cardId, queued.body.cardId)

    const verified = verifyAuditBundleFile(outPath)
    assert.equal(verified.ok, true, verified.issues.join('; '))
    assert.equal(verified.bundleDigestValid, true)
    assert.equal(verified.signaturesValid, true)

    written.entries[0].record.payloadHash = 'f'.repeat(64)
    const tampered = verifyAuditBundle(written)
    assert.equal(tampered.ok, false)
    assert.equal(tampered.bundleDigestValid, false)
  })
})

test('statusSummary reports keyring and ledger tip without mutating state', async () => {
  await withCenter(async ({ base, dataDir, keypair }) => {
    const queued = await request(base, '/webhook/telemetry', {
      method: 'POST',
      body: { event: 'status-check', packId: 'aia' },
    })
    await request(base, '/api/sign', {
      method: 'POST',
      body: { cardId: queued.body.cardId, confirm: true },
    })

    mkdirSync(join(dataDir), { recursive: true })
    writeFileSync(
      join(dataDir, 'active_queue.json'),
      JSON.stringify(
        [
          {
            cardId: 'pending-1',
            status: 'pending',
            riskLevel: 'high',
            payload: { riskLevel: 'high' },
          },
        ],
        null,
        2,
      ) + '\n',
    )

    const summary = buildStatusSummary({
      dataDir,
      keyDir: join(dataDir, '.keys'),
      checkedAt: '2026-01-01T00:00:00.000Z',
    })
    assert.equal(summary.queue.totalCards, 1)
    assert.equal(summary.queue.byStatus.PENDING, 1)
    assert.equal(summary.queue.byRisk.high, 1)
    assert.equal(summary.ledger.entries, 1)
    assert.equal(summary.ledger.latestCardId, queued.body.cardId)
    assert.equal(summary.ledger.latestAction, 'authorize')
    assert.ok(summary.keyring.activeKeyId)
    assert.equal(summary.keyring.activeKeys >= 1, true)
    assert.equal(summary.keyring.totalKeys >= 1, true)
    assert.ok(keypair.publicKeyHex)
  })
})

test('archiveLedgerWindow trims the hot ledger and keeps verification continuous', async () => {
  await withCenter(async ({ base, dataDir, keypair }) => {
    for (let i = 0; i < 3; i += 1) {
      const queued = await request(base, '/webhook/telemetry', {
        method: 'POST',
        body: { event: `archive-${i}`, packId: 'aia', idempotencyKey: `arch-${i}` },
      })
      const signed = await request(base, '/api/sign', {
        method: 'POST',
        body: { cardId: queued.body.cardId, confirm: true },
      })
      assert.equal(signed.status, 200)
    }

    const ledgerPath = join(dataDir, 'ledger.ndjson')
    const before = verifyLedgerFile(ledgerPath, keypair.publicKeyPem)
    assert.equal(before.ok, true)
    assert.equal(before.count, 3)

    const dry = archiveLedgerWindow({
      dataDir,
      ledgerPath,
      keepLast: 1,
      dryRun: true,
      stamp: '2026-01-02T00:00:00.000Z',
    })
    assert.equal(dry.dryRun, true)
    assert.equal(dry.wouldArchiveCount, 2)
    assert.equal(dry.wouldRetainCount, 1)

    const archived = archiveLedgerWindow({
      dataDir,
      ledgerPath,
      keepLast: 1,
      stamp: '2026-01-02T00:00:00.000Z',
    })
    assert.equal(archived.archived, true)
    assert.equal(archived.archivedCount, 2)
    assert.equal(archived.retainedCount, 1)
    assert.ok(existsSync(archived.sliceFile))
    assert.ok(existsSync(archived.metaFile))
    assert.ok(existsSync(join(dataDir, 'ledger.anchor.json')))

    const sliceReport = verifyLedgerSlice({
      slicePath: archived.sliceFile,
      metaPath: archived.metaFile,
      dataDir,
      keyDir: join(dataDir, '.keys'),
    })
    assert.equal(sliceReport.ok, true, sliceReport.issues.join('; '))
    assert.equal(sliceReport.sliceSha256Valid, true)
    assert.equal(sliceReport.entryCount, 2)
    assert.equal(sliceReport.boundaryHandoff.lastArchivedHash, archived.boundaryPrevHash)

    const after = verifyLedgerFile(ledgerPath, keypair.publicKeyPem)
    assert.equal(after.ok, true, after.errors.join('; '))
    assert.equal(after.count, 1)
    assert.ok(after.anchor)
    assert.equal(after.anchor.lastArchivedHash, archived.boundaryPrevHash)

    const next = new Ledger(ledgerPath)
    next.appendSigned({
      cardId: 'post-archive',
      action: 'authorize',
      payload: { note: 'continues after archive' },
      privateKeyPem: keypair.privateKeyPem,
      publicKeyHex: keypair.publicKeyHex,
      timestamp: Date.now(),
    })
    const continued = verifyLedgerFile(ledgerPath, keypair.publicKeyPem)
    assert.equal(continued.ok, true, continued.errors.join('; '))
    assert.equal(continued.count, 2)
  })
})

test('reconcileQueue updates pending queue cards that already have ledger decisions', async () => {
  await withCenter(async ({ base, dataDir }) => {
    const queued = await request(base, '/webhook/telemetry', {
      method: 'POST',
      body: { event: 'reconcile-check', packId: 'aia' },
    })
    const signed = await request(base, '/api/sign', {
      method: 'POST',
      body: { cardId: queued.body.cardId, confirm: true },
    })
    assert.equal(signed.status, 200)

    const queuePath = join(dataDir, 'active_queue.json')
    writeFileSync(
      queuePath,
      JSON.stringify(
        [
          {
            cardId: queued.body.cardId,
            status: 'pending',
            riskLevel: 'medium',
            summary: 'stale pending after crash',
          },
          {
            cardId: 'still-open',
            status: 'pending',
            riskLevel: 'low',
          },
        ],
        null,
        2,
      ) + '\n',
    )

    const dry = reconcileQueue({
      dataDir,
      queuePath,
      ledgerPath: join(dataDir, 'ledger.ndjson'),
      dryRun: true,
      reconciledAt: '2026-01-03T00:00:00.000Z',
    })
    assert.equal(dry.dryRun, true)
    assert.equal(dry.driftCount, 1)
    assert.equal(dry.changes[0].toStatus, 'signed')
    assert.equal(JSON.parse(readFileSync(queuePath, 'utf8'))[0].status, 'pending')

    const live = reconcileQueue({
      dataDir,
      queuePath,
      ledgerPath: join(dataDir, 'ledger.ndjson'),
      reconciledAt: '2026-01-03T00:00:00.000Z',
    })
    assert.equal(live.reconciled, true)
    assert.equal(live.driftCount, 1)
    const after = JSON.parse(readFileSync(queuePath, 'utf8'))
    assert.equal(after[0].status, 'signed')
    assert.equal(after[0].reconciledAt, '2026-01-03T00:00:00.000Z')
    assert.equal(after[1].status, 'pending')
  })
})

test('flushSpool drains ordered spool lines and quarantines poison payloads', async () => {
  await withCenter(async ({ base, dataDir }) => {
    const spoolPath = join(dataDir, 'spool.ndjson')
    const deadletterPath = join(dataDir, 'spool.deadletter.ndjson')
    writeFileSync(
      spoolPath,
      [
        JSON.stringify({
          channel: 'telemetry',
          payload: { event: 'spool-ok', packId: 'aia', summary: 'healthy drain' },
        }),
        'not-json{{{',
        JSON.stringify({
          channel: 'telemetry',
          payload: { event: 'spool-second', packId: 'aia' },
        }),
      ].join('\n') + '\n',
    )

    const dry = await flushSpool({
      dataDir,
      spoolPath,
      deadletterPath,
      ingestUrl: base,
      dryRun: true,
      quarantineInvalid: true,
    })
    assert.equal(dry.dryRun, true)
    assert.equal(dry.flushed, 2)
    assert.equal(dry.remaining, 1)
    assert.equal(readFileSync(spoolPath, 'utf8').split('\n').filter(Boolean).length, 3)

    const live = await flushSpool({
      dataDir,
      spoolPath,
      deadletterPath,
      ingestUrl: base,
      quarantineInvalid: true,
    })
    assert.equal(live.flushed, 2)
    assert.equal(live.quarantined, 1)
    assert.equal(live.remaining, 0)
    assert.equal(readFileSync(spoolPath, 'utf8').trim(), '')
    const dead = readFileSync(deadletterPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
    assert.equal(dead.length, 1)
    assert.equal(dead[0].reason, 'MALFORMED_JSON')

    const queue = await request(base, '/queue?status=pending')
    assert.equal(queue.body.cards.length, 2)
    const events = queue.body.cards.map((c) => c.payload?.webhookEvent || c.payload?.summary || '')
    assert.ok(events.some((e) => /spool-ok|healthy drain/i.test(String(e))))
    assert.ok(events.some((e) => /spool-second/i.test(String(e))))
  })
})

test('requeueDeadletter inspects then recovers recoverable dead-letter payloads', async () => {
  await withCenter(async ({ base, dataDir }) => {
    const spoolPath = join(dataDir, 'spool.ndjson')
    const deadletterPath = join(dataDir, 'spool.deadletter.ndjson')
    writeFileSync(
      deadletterPath,
      [
        JSON.stringify({
          quarantinedAt: '2026-01-04T00:00:00.000Z',
          reason: 'HTTP_400',
          channel: 'telemetry',
          payload: { event: 'deadletter-ok', packId: 'aia', summary: 'recover me' },
        }),
        JSON.stringify({
          quarantinedAt: '2026-01-04T00:01:00.000Z',
          reason: 'MALFORMED_JSON',
          rawLine: 'not-json{{{',
        }),
        JSON.stringify({
          quarantinedAt: '2026-01-04T00:02:00.000Z',
          reason: 'HTTP_422',
          channel: 'telemetry',
          payload: { event: 'deadletter-other', packId: 'aia' },
        }),
      ].join('\n') + '\n',
    )

    const inspected = await requeueDeadletter({
      dataDir,
      spoolPath,
      deadletterPath,
      inspectOnly: true,
    })
    assert.equal(inspected.inspectOnly, true)
    assert.equal(inspected.totalQuarantined, 3)
    assert.equal(inspected.entries[0].reason, 'HTTP_400')
    assert.equal(readFileSync(deadletterPath, 'utf8').split('\n').filter(Boolean).length, 3)

    const filtered = await requeueDeadletter({
      dataDir,
      spoolPath,
      deadletterPath,
      reasonFilter: 'HTTP_400',
      limit: 1,
    })
    assert.equal(filtered.mode, 'spool-requeue')
    assert.equal(filtered.requeued, 1)
    assert.equal(filtered.remaining, 2)

    const spoolLines = readFileSync(spoolPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
    assert.equal(spoolLines.length, 1)
    assert.equal(spoolLines[0].payload.event, 'deadletter-ok')
    assert.equal(spoolLines[0].channel, 'telemetry')

    const remainingDead = readFileSync(deadletterPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
    assert.equal(remainingDead.length, 2)
    assert.equal(remainingDead[0].reason, 'MALFORMED_JSON')
    assert.equal(remainingDead[1].reason, 'HTTP_422')

    const direct = await requeueDeadletter({
      dataDir,
      spoolPath,
      deadletterPath,
      ingestUrl: base,
      sendDirect: true,
      reasonFilter: 'HTTP_422',
    })
    assert.equal(direct.mode, 'direct-ingest')
    assert.equal(direct.requeued, 1)
    assert.equal(direct.remaining, 1)

    const queue = await request(base, '/queue?status=pending')
    assert.ok(
      queue.body.cards.some((c) => /deadletter-other/i.test(String(c.payload?.webhookEvent || ''))),
    )
  })
})

test('key rotation keeps historical ledger lines verifiable via keyring', async () => {
  await withCenter(async ({ base, ledger, keypair, dataDir }) => {
    const queued = await request(base, '/webhook/telemetry', {
      method: 'POST',
      body: { event: 'rotation-check', packId: 'aia' },
    })
    const signed = await request(base, '/api/sign', {
      method: 'POST',
      body: { cardId: queued.body.cardId, confirm: true },
    })
    assert.equal(signed.status, 200)
    assert.equal(ledger.readEntries().length, 1)
    assert.equal(ledger.readEntries()[0].publicKey, keypair.publicKeyHex)

    const keyDir = join(dataDir, '.keys')
    const rotated = rotateKeypair(keyDir)
    assert.notEqual(rotated.publicKeyHex, keypair.publicKeyHex)
    assert.equal(rotated.keyring.keys.length >= 2, true)
    assert.ok(rotated.keyring.keys.some((k) => k.status === 'RETIRED'))
    assert.ok(rotated.keyring.keys.some((k) => k.status === 'ACTIVE' && k.keyId === rotated.keyId))

    const trust = loadTrustedPublicKeys(keyDir)
    const verified = verifyLedgerFile(join(dataDir, 'ledger.ndjson'), trust)
    assert.equal(verified.ok, true, verified.errors.join('; '))
    assert.equal(verified.count, 1)

    const activeOnly = verifyLedgerFile(join(dataDir, 'ledger.ndjson'), rotated.publicKeyPem)
    assert.equal(activeOnly.ok, false)
    assert.ok(activeOnly.errors.some((line) => /trusted keyring/i.test(line)))

    const nextLedger = new Ledger(join(dataDir, 'ledger.ndjson'))
    nextLedger.appendSigned({
      cardId: 'post-rotation',
      action: 'authorize',
      payload: { note: 'signed with new key' },
      privateKeyPem: rotated.privateKeyPem,
      publicKeyHex: rotated.publicKeyHex,
      timestamp: Date.now(),
    })
    const both = verifyLedgerFile(join(dataDir, 'ledger.ndjson'), trust)
    assert.equal(both.ok, true, both.errors.join('; '))
    assert.equal(both.count, 2)
  })
})
