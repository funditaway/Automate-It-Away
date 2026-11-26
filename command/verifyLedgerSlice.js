#!/usr/bin/env node
/**
 * Verify an archived ledger slice + sidecar meta.json.
 *
 * Checks sliceSha256 against the manifest, recomputes each entryHash,
 * validates Ed25519 signatures against data/.keys/keyring.json, and
 * confirms internal `prev` continuity within the slice.
 *
 *   node verifyLedgerSlice.js <ledger-slice.ndjson> [meta.json]
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadKeyring, pemToRawPublicHex, verifyCanonical } from './lib/keys.js'
import { entryBody, hashEntry } from './lib/ledger.js'

const here = dirname(fileURLToPath(import.meta.url))

function sha256Hex(buf) {
  return createHash('sha256').update(buf).digest('hex')
}

function trustFromKeyring(keyring) {
  const byHex = new Map()
  for (const item of Array.isArray(keyring?.keys) ? keyring.keys : []) {
    if (!item?.publicKeyPem) continue
    const hex = item.publicKeyHex || pemToRawPublicHex(item.publicKeyPem)
    byHex.set(hex, item.publicKeyPem)
  }
  return byHex
}

export function verifyLedgerSlice(opts = {}) {
  const slicePath = resolve(opts.slicePath)
  const metaPath = resolve(opts.metaPath || slicePath.replace(/\.ndjson$/, '.meta.json'))
  const keyDir = opts.keyDir || join(opts.dataDir || join(here, 'data'), '.keys')
  const issues = []

  if (!existsSync(slicePath)) {
    return {
      ok: false,
      slicePath,
      metaPath: existsSync(metaPath) ? metaPath : null,
      sliceSha256Valid: false,
      chainValid: false,
      signaturesValid: false,
      entryCount: 0,
      issues: [`Ledger slice not found: ${slicePath}`],
    }
  }

  const sliceBuf = readFileSync(slicePath)
  const actualSha256 = sha256Hex(sliceBuf)

  let metadata = null
  let sliceSha256Valid = true
  if (existsSync(metaPath)) {
    metadata = JSON.parse(readFileSync(metaPath, 'utf8'))
    if (!metadata.sliceSha256 || metadata.sliceSha256 !== actualSha256) {
      sliceSha256Valid = false
      issues.push('sliceSha256 mismatch against sidecar metadata')
    }
  } else {
    sliceSha256Valid = false
    issues.push(`Sidecar metadata not found: ${metaPath}`)
  }

  const trust = trustFromKeyring(loadKeyring(keyDir))
  const lines = sliceBuf
    .toString('utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  let expectedPrev = null
  let chainValid = true
  let signaturesValid = true
  let firstEntryHash = null
  let lastEntryHash = null

  for (let i = 0; i < lines.length; i += 1) {
    let rec
    try {
      rec = JSON.parse(lines[i])
    } catch {
      chainValid = false
      signaturesValid = false
      issues.push(`Line ${i + 1}: invalid JSON`)
      continue
    }

    const label = `Line ${i + 1}${rec.cardId ? ` (${rec.cardId})` : ''}`
    if (i === 0) firstEntryHash = rec.entryHash || null

    if (i > 0 && expectedPrev && rec.prev !== expectedPrev) {
      chainValid = false
      issues.push(`${label}: prev break inside slice`)
    }

    if (hashEntry(rec) !== rec.entryHash) {
      signaturesValid = false
      issues.push(`${label}: entryHash mismatch`)
    }

    const signerPem = trust.get(rec.publicKey)
    if (!signerPem) {
      signaturesValid = false
      issues.push(`${label}: public key is not in the trusted keyring`)
    } else if (!verifyCanonical(signerPem, entryBody(rec), rec.signature)) {
      signaturesValid = false
      issues.push(`${label}: invalid Ed25519 signature`)
    }

    expectedPrev = rec.entryHash || expectedPrev
    lastEntryHash = rec.entryHash || lastEntryHash
  }

  if (metadata) {
    if (metadata.firstArchivedHash && firstEntryHash && metadata.firstArchivedHash !== firstEntryHash) {
      issues.push('firstArchivedHash in metadata does not match first slice entry')
      chainValid = false
    }
    if (metadata.lastArchivedHash && lastEntryHash && metadata.lastArchivedHash !== lastEntryHash) {
      issues.push('lastArchivedHash in metadata does not match last slice entry')
      chainValid = false
    }
  }

  const ok = sliceSha256Valid && chainValid && signaturesValid
  return {
    ok,
    slicePath,
    metaPath: existsSync(metaPath) ? metaPath : null,
    sliceSha256Valid,
    actualSha256,
    chainValid,
    signaturesValid,
    entryCount: lines.length,
    boundaryHandoff: metadata
      ? {
          firstArchivedHash: metadata.firstArchivedHash || null,
          lastArchivedHash: metadata.lastArchivedHash || null,
          firstRetainedPrevHash: metadata.firstRetainedPrevHash || null,
          firstRetainedEntryHash: metadata.firstRetainedEntryHash || null,
          expectedPrevForLiveLedger: metadata.expectedPrevForLiveLedger || null,
          expectedNextSeq: metadata.expectedNextSeq || null,
        }
      : null,
    issues,
  }
}

function isMain() {
  const entry = process.argv[1]
  if (!entry) return false
  return fileURLToPath(import.meta.url) === resolve(entry)
}

if (isMain()) {
  const slicePath = process.argv[2]
  if (!slicePath) {
    console.error('Usage: node verifyLedgerSlice.js <ledger-slice.ndjson> [meta.json]')
    process.exit(1)
  }
  try {
    const dataDir = process.env.AIA_DATA_DIR || join(here, 'data')
    const report = verifyLedgerSlice({
      slicePath,
      metaPath: process.argv[3],
      dataDir,
      keyDir: process.env.AIA_KEY_DIR || join(dataDir, '.keys'),
    })
    console.log(JSON.stringify(report, null, 2))
    process.exit(report.ok ? 0 : 1)
  } catch (err) {
    console.error(err.message || err)
    process.exit(1)
  }
}
