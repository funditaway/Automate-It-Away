#!/usr/bin/env node
/**
 * Offline-verifiable audit bundle exporter.
 *
 * Packages ledger.ndjson entries + public keyring metadata + a live
 * verification snapshot. Never copies ed25519.pem / private material / .env.
 *
 *   node exportAudit.js
 *   node exportAudit.js --card <cardId>
 *   node exportAudit.js --out /tmp/proof.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonicalJson, sha256Text } from './lib/canonical.js'
import { loadKeyring, loadTrustedPublicKeys } from './lib/keys.js'
import { Ledger, loadLedgerAnchor, verifyLedgerEntries } from './lib/ledger.js'

const here = dirname(fileURLToPath(import.meta.url))

function parseArgs(argv) {
  const opts = { cardId: null, outFile: null }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--card' && argv[i + 1]) {
      opts.cardId = argv[i + 1]
      i += 1
    } else if (argv[i] === '--out' && argv[i + 1]) {
      opts.outFile = argv[i + 1]
      i += 1
    }
  }
  return opts
}

/** Public-only keyring view — strips any accidental private fields. */
function publicKeyringView(keyring) {
  return {
    activeKeyId: keyring.activeKeyId || null,
    keys: (keyring.keys || []).map((item) => ({
      keyId: item.keyId || null,
      algorithm: item.algorithm || 'Ed25519',
      status: item.status || 'UNKNOWN',
      fingerprint: item.fingerprint || null,
      publicKeyHex: item.publicKeyHex || null,
      publicKeyPem: item.publicKeyPem || null,
      createdAt: item.createdAt || null,
      retiredAt: item.retiredAt || null,
    })),
  }
}

export function buildAuditBundle(opts = {}) {
  const dataDir = opts.dataDir || join(here, 'data')
  const keyDir = opts.keyDir || join(dataDir, '.keys')
  const ledgerPath = opts.ledgerPath || join(dataDir, 'ledger.ndjson')
  const cardId = opts.cardId || null

  if (!existsSync(ledgerPath)) {
    const error = new Error(`Ledger file not found: ${ledgerPath}`)
    error.code = 'LEDGER_MISSING'
    throw error
  }

  const ledger = new Ledger(ledgerPath)
  const allEntries = ledger.readEntries()
  const numbered = allEntries.map((record, idx) => ({ line: idx + 1, record }))
  const filtered = cardId ? numbered.filter((item) => item.record?.cardId === cardId) : numbered

  const keyring = publicKeyringView(loadKeyring(keyDir))
  const trust = loadTrustedPublicKeys(keyDir)
  const anchor = loadLedgerAnchor(ledgerPath)
  // Always audit the hot chain; --card only filters which lines are exported.
  const verification = verifyLedgerEntries(allEntries, trust, {
    expectedPrev: anchor?.expectedPrev,
    expectedNextSeq: anchor?.expectedNextSeq,
  })

  const unsignedBundle = {
    schemaVersion: '1.0',
    exportedAt: opts.exportedAt || new Date().toISOString(),
    scope: cardId ? { cardId } : { fullLedger: true },
    totalLedgerEntries: allEntries.length,
    exportedEntryCount: filtered.length,
    latestChainHead: allEntries.length ? allEntries[allEntries.length - 1].entryHash || null : null,
    verification: {
      ok: verification.ok,
      chainStatus: verification.ok ? 'INTACT' : 'ISSUES_FOUND',
      verifiedCount: verification.count,
      tip: verification.tip,
      trustedKeyCount: trust.size,
      issues: verification.errors,
    },
    keyring,
    entries: filtered,
  }

  const bundleSha256 = sha256Text(canonicalJson(unsignedBundle))
  return {
    ...unsignedBundle,
    bundleSha256,
  }
}

export function writeAuditBundle(bundle, outFile, outDir) {
  const auditsDir = outDir || join(here, 'audits')
  mkdirSync(auditsDir, { recursive: true, mode: 0o700 })

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const cardId = bundle.scope?.cardId
  const suffix = cardId ? `_${String(cardId).replace(/[^a-zA-Z0-9_-]+/g, '_')}` : ''
  const targetPath = resolve(outFile || join(auditsDir, `aia-audit${suffix}_${stamp}.json`))

  mkdirSync(dirname(targetPath), { recursive: true, mode: 0o700 })
  writeFileSync(targetPath, JSON.stringify(bundle, null, 2) + '\n', { mode: 0o600 })
  return targetPath
}

function isMain() {
  const entry = process.argv[1]
  if (!entry) return false
  return fileURLToPath(import.meta.url) === resolve(entry)
}

if (isMain()) {
  try {
    const opts = parseArgs(process.argv.slice(2))
    const dataDir = process.env.AIA_DATA_DIR || join(here, 'data')
    const keyDir = process.env.AIA_KEY_DIR || join(dataDir, '.keys')
    const ledgerPath = process.env.AIA_LEDGER_PATH || join(dataDir, 'ledger.ndjson')
    const outDir = process.env.AIA_AUDIT_OUT_DIR || join(here, 'audits')

    const bundle = buildAuditBundle({
      dataDir,
      keyDir,
      ledgerPath,
      cardId: opts.cardId,
    })
    const outputPath = writeAuditBundle(bundle, opts.outFile, outDir)

    console.log(
      JSON.stringify(
        {
          exported: true,
          outputPath,
          exportedEntryCount: bundle.exportedEntryCount,
          verificationOk: bundle.verification.ok,
          bundleSha256: bundle.bundleSha256,
        },
        null,
        2,
      ),
    )
    process.exit(bundle.verification.ok || bundle.exportedEntryCount === 0 ? 0 : 1)
  } catch (err) {
    console.error(err.message || err)
    process.exit(1)
  }
}
