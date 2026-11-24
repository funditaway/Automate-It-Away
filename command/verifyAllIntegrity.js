#!/usr/bin/env node
/**
 * End-to-end cryptographic & state integrity runner (read-only).
 *
 * Single non-destructive gate that:
 *   1. Verifies ledger.ndjson chain links + Ed25519 signatures via keyring
 *   2. Optionally validates an exported audit bundle (--bundle <path>)
 *   3. Reports active_queue.json vs ledger decision drift (dry-run only)
 *   4. Summarizes queue / spool / keyring state
 *
 * Never mutates ledger.ndjson, keyring.json, active_queue.json, or spool files.
 *
 *   node verifyAllIntegrity.js
 *   node verifyAllIntegrity.js --bundle ../audits/aia-audit.json
 */
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadOrCreateKeypair, loadTrustedPublicKeys } from './lib/keys.js'
import { verifyLedgerFile } from './lib/ledger.js'
import { reconcileQueue } from './reconcileQueue.js'
import { buildStatusSummary } from './statusSummary.js'
import { verifyAuditBundleFile } from './verifyAuditBundle.js'

const here = dirname(fileURLToPath(import.meta.url))

function parseArgs(argv) {
  let bundlePath = null
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--bundle' && argv[i + 1]) {
      bundlePath = argv[i + 1]
      i += 1
    }
  }
  return { bundlePath }
}

export function verifyAllIntegrity(opts = {}) {
  const dataDir = opts.dataDir || join(here, 'data')
  const keyDir = opts.keyDir || join(dataDir, '.keys')
  const ledgerPath = opts.ledgerPath || join(dataDir, 'ledger.ndjson')
  const queuePath = opts.queuePath || join(dataDir, 'active_queue.json')
  const spoolPath = opts.spoolPath || join(dataDir, 'spool.ndjson')
  const bundlePath = opts.bundlePath ? resolve(opts.bundlePath) : null
  const checkedAt = opts.checkedAt || new Date().toISOString()

  const keys = loadOrCreateKeypair(keyDir)
  const trust = loadTrustedPublicKeys(keyDir)
  if (!trust.has(keys.publicKeyHex)) trust.set(keys.publicKeyHex, keys.publicKeyPem)

  const ledgerRaw = verifyLedgerFile(ledgerPath, trust)
  const ledger = {
    ok: ledgerRaw.ok,
    exists: !ledgerRaw.missing,
    entriesVerified: ledgerRaw.count || 0,
    chainValid: ledgerRaw.ok || (ledgerRaw.errors || []).every((e) => !/prev|seq/i.test(e)),
    signaturesValid: ledgerRaw.ok || (ledgerRaw.errors || []).every((e) => !/signature|public key/i.test(e)),
    tip: ledgerRaw.tip,
    latestEntryHash: ledgerRaw.tip,
    trustedKeys: trust.size,
    activePublicKey: keys.publicKeyHex,
    anchor: ledgerRaw.anchor || null,
    issues: ledgerRaw.errors || [],
    filePath: ledgerPath,
  }
  // Prefer explicit classification from error strings when verification failed.
  if (!ledgerRaw.ok) {
    const errs = ledgerRaw.errors || []
    ledger.chainValid = !errs.some((e) => /prev|seq|entryHash|unreadable|invalid JSON/i.test(e))
    ledger.signaturesValid = !errs.some((e) => /signature|public key/i.test(e))
  } else {
    ledger.chainValid = true
    ledger.signaturesValid = true
  }

  const drift = reconcileQueue({
    dataDir,
    queuePath,
    ledgerPath,
    dryRun: true,
  })
  const queueDrift = {
    totalQueueCards: drift.totalCards,
    ledgerDecisionsFound: drift.ledgerDecisionsFound,
    driftCount: drift.driftCount,
    driftedCards: (drift.changes || []).map((c) => ({
      cardId: c.cardId,
      queueStatus: String(c.fromStatus || '').toUpperCase(),
      ledgerDecision: String(c.toStatus || '').toUpperCase(),
      action: c.action || null,
      entryHash: c.entryHash || null,
    })),
    dryRun: true,
    note: 'Drift is reported only; active_queue.json is not modified',
  }

  const bundle = bundlePath
    ? (() => {
        const report = verifyAuditBundleFile(bundlePath)
        return {
          ok: report.ok,
          bundlePath: report.bundlePath || bundlePath,
          digestValid: report.bundleDigestValid,
          chainValid: report.chainValid,
          signaturesValid: report.signaturesValid,
          entriesChecked: report.verifiedEntries,
          trustedKeyCount: report.trustedKeyCount,
          issues: report.issues || [],
        }
      })()
    : null

  const summary = buildStatusSummary({
    dataDir,
    keyDir,
    queuePath,
    ledgerPath,
    spoolPath,
    checkedAt,
  })

  const ok = ledger.ok && (!bundle || bundle.ok)

  return {
    checkedAt,
    ok,
    activeKeyId: summary.keyring?.activeKeyId || null,
    spoolPending: summary.spool?.pendingEvents || 0,
    ledger,
    queueDrift,
    bundle,
    summary: {
      queue: summary.queue,
      spool: summary.spool,
      keyring: summary.keyring,
      ledgerTip: {
        entries: summary.ledger?.entries || 0,
        latestCardId: summary.ledger?.latestCardId || null,
        latestAction: summary.ledger?.latestAction || null,
        latestEntryHash: summary.ledger?.latestEntryHash || null,
        anchor: summary.ledger?.anchor || null,
      },
    },
  }
}

function isMain() {
  const entry = process.argv[1]
  if (!entry) return false
  return fileURLToPath(import.meta.url) === resolve(entry)
}

if (isMain()) {
  try {
    const cli = parseArgs(process.argv.slice(2))
    const dataDir = process.env.AIA_DATA_DIR || join(here, 'data')
    const report = verifyAllIntegrity({
      dataDir,
      keyDir: process.env.AIA_KEY_DIR || join(dataDir, '.keys'),
      ledgerPath: process.env.AIA_LEDGER_PATH || join(dataDir, 'ledger.ndjson'),
      queuePath: process.env.AIA_QUEUE_PATH || join(dataDir, 'active_queue.json'),
      spoolPath: process.env.AIA_SPOOL_PATH || join(dataDir, 'spool.ndjson'),
      bundlePath: cli.bundlePath,
    })
    console.log(JSON.stringify(report, null, 2))
    if (!report.ok) process.exit(1)
  } catch (err) {
    console.error(err.message || err)
    process.exit(1)
  }
}
