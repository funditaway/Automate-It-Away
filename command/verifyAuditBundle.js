#!/usr/bin/env node
/**
 * Offline audit-bundle verifier.
 *
 * Validates exportAudit.js packages without the live daemon or private key:
 *   1. Recompute bundleSha256 over the canonical unsigned payload
 *   2. Recompute each entryHash and Ed25519 signature against the embedded keyring
 *   3. Check prev continuity across contiguous exported lines (full ledger or sequential lines)
 *
 *   node verifyAuditBundle.js <audit-bundle.json>
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonicalJson, sha256Text } from './lib/canonical.js'
import { pemToRawPublicHex, verifyCanonical } from './lib/keys.js'
import { entryBody, hashEntry } from './lib/ledger.js'

function trustFromKeyring(keyring) {
  const byHex = new Map()
  const keys = Array.isArray(keyring?.keys) ? keyring.keys : []
  for (const item of keys) {
    if (!item?.publicKeyPem) continue
    const hex = item.publicKeyHex || pemToRawPublicHex(item.publicKeyPem)
    byHex.set(hex, item.publicKeyPem)
  }
  return byHex
}

function unwrapRecord(item) {
  if (!item || typeof item !== 'object') return { line: null, record: null }
  if (item.record && typeof item.record === 'object') {
    return { line: item.line ?? null, record: item.record }
  }
  return { line: item.line ?? null, record: item }
}

export function verifyAuditBundle(raw) {
  const issues = []
  if (!raw || typeof raw !== 'object') {
    return {
      ok: false,
      bundleDigestValid: false,
      chainValid: false,
      signaturesValid: false,
      verifiedEntries: 0,
      issues: ['Bundle is not a JSON object'],
    }
  }

  const { bundleSha256, ...unsignedBundle } = raw
  const expectedDigest = sha256Text(canonicalJson(unsignedBundle))
  const bundleDigestValid = Boolean(bundleSha256) && bundleSha256 === expectedDigest
  if (!bundleDigestValid) {
    issues.push('bundleSha256 mismatch: audit package may have been modified')
  }

  const trust = trustFromKeyring(unsignedBundle.keyring)
  const wrapped = Array.isArray(unsignedBundle.entries) ? unsignedBundle.entries : []
  const entries = wrapped.map(unwrapRecord)

  let chainValid = true
  let signaturesValid = true
  let previous = null

  for (let i = 0; i < entries.length; i += 1) {
    const { line, record } = entries[i]
    const label = `Entry ${i + 1}${record?.cardId ? ` (${record.cardId})` : ''}`

    if (!record || typeof record !== 'object') {
      chainValid = false
      signaturesValid = false
      issues.push(`${label}: malformed record`)
      continue
    }

    const recomputedHash = hashEntry(record)
    if (record.entryHash !== recomputedHash) {
      signaturesValid = false
      issues.push(`${label}: entryHash mismatch`)
    }

    const signerPem = trust.get(record.publicKey)
    if (!signerPem) {
      signaturesValid = false
      issues.push(`${label}: public key is not in the embedded keyring`)
    } else if (!verifyCanonical(signerPem, entryBody(record), record.signature)) {
      signaturesValid = false
      issues.push(`${label}: invalid Ed25519 signature`)
    }

    if (i === 0 && unsignedBundle.scope?.fullLedger && Number(record.seq) === 1 && record.prev !== '0'.repeat(64)) {
      chainValid = false
      issues.push(`${label}: prev does not match genesis for seq 1`)
    }

    const contiguous =
      previous &&
      (Boolean(unsignedBundle.scope?.fullLedger) ||
        (line != null && previous.line != null && Number(line) === Number(previous.line) + 1) ||
        (record.seq != null &&
          previous.record?.seq != null &&
          Number(record.seq) === Number(previous.record.seq) + 1))

    if (contiguous && previous?.record?.entryHash && record.prev !== previous.record.entryHash) {
      chainValid = false
      issues.push(`${label}: prev break (expected ${previous.record.entryHash})`)
    }

    previous = { line, record }
  }

  // Empty filtered export is still a valid proof envelope if the digest matches.
  const ok = bundleDigestValid && chainValid && signaturesValid

  return {
    ok,
    bundleDigestValid,
    chainValid,
    signaturesValid,
    verifiedEntries: entries.length,
    trustedKeyCount: trust.size,
    issues,
  }
}

export function verifyAuditBundleFile(bundlePath) {
  if (!existsSync(bundlePath)) {
    return {
      ok: false,
      bundlePath,
      bundleDigestValid: false,
      chainValid: false,
      signaturesValid: false,
      verifiedEntries: 0,
      issues: [`Audit bundle not found: ${bundlePath}`],
    }
  }
  const raw = JSON.parse(readFileSync(bundlePath, 'utf8'))
  return { ...verifyAuditBundle(raw), bundlePath }
}

function isMain() {
  const entry = process.argv[1]
  if (!entry) return false
  return fileURLToPath(import.meta.url) === resolve(entry)
}

if (isMain()) {
  const bundlePath = process.argv[2]
  if (!bundlePath) {
    console.error('Usage: node verifyAuditBundle.js <audit-bundle.json>')
    process.exit(1)
  }
  try {
    const report = verifyAuditBundleFile(resolve(bundlePath))
    console.log(JSON.stringify(report, null, 2))
    process.exit(report.ok ? 0 : 1)
  } catch (err) {
    console.error(err.message || err)
    process.exit(1)
  }
}
