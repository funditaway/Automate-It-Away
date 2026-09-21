#!/usr/bin/env node
/**
 * doctor.js — System diagnostics for AIA local crypto + immutable ledger.
 *
 * Checks:
 *   - Node.js crypto (Ed25519) available
 *   - private_key.pem / public_key.pem (or legacy ed25519 names)
 *   - ledger.ndjson readability
 *   - vault DB presence (optional)
 *
 * Usage: node doctor.js
 */
'use strict'

import { generateKeyPairSync, createHash, sign as cryptoSign, verify as cryptoVerify } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = __dirname
const keyDir = join(root, '.keys')
const dataDir = join(root, 'data')

let issues = 0

function ok(msg) {
  console.log(`[PASS] ${msg}`)
}

function fail(msg) {
  console.error(`[FAIL] ${msg}`)
  issues += 1
}

function warn(msg) {
  console.log(`[WARN] ${msg}`)
}

function checkCrypto() {
  try {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    const msg = Buffer.from('aia-doctor-probe')
    const sig = cryptoSign(null, msg, privateKey)
    const valid = cryptoVerify(null, msg, publicKey, sig)
    if (!valid) {
      fail('Node crypto Ed25519 sign/verify round-trip failed')
      return
    }
    createHash('sha256').update('probe').digest('hex')
    ok('native Node.js crypto (Ed25519 + SHA-256) available')
  } catch (err) {
    fail(`native crypto unavailable: ${err.message}`)
  }
}

function checkKeys() {
  const standardPriv = join(keyDir, 'private_key.pem')
  const standardPub = join(keyDir, 'public_key.pem')
  const legacyPriv = join(keyDir, 'ed25519.pem')
  const legacyPub = join(keyDir, 'ed25519.pub.pem')

  const hasStandard = existsSync(standardPriv) && existsSync(standardPub)
  const hasLegacy = existsSync(legacyPriv) && existsSync(legacyPub)

  if (hasStandard) {
    ok(`Ed25519 keys present: ${standardPriv}`)
    ok(`Ed25519 public key present: ${standardPub}`)
    return { priv: standardPriv, pub: standardPub }
  }
  if (hasLegacy) {
    warn('legacy ed25519.pem / ed25519.pub.pem found — prefer private_key.pem / public_key.pem')
    ok(`legacy private key readable: ${legacyPriv}`)
    ok(`legacy public key readable: ${legacyPub}`)
    return { priv: legacyPriv, pub: legacyPub }
  }

  fail('Ed25519 keys missing — run ./start.sh to generate private_key.pem / public_key.pem')
  return null
}

function checkLedger() {
  const ledgerPath = join(dataDir, 'ledger.ndjson')
  if (!existsSync(ledgerPath)) {
    warn(`ledger.ndjson not found yet at ${ledgerPath} (created on first /api/sign)`)
    return
  }
  const st = statSync(ledgerPath)
  const raw = readFileSync(ledgerPath, 'utf8')
  const lines = raw.split('\n').filter((l) => l.trim())
  let bad = 0
  for (const line of lines) {
    try {
      JSON.parse(line)
    } catch {
      bad += 1
    }
  }
  if (bad) {
    fail(`ledger.ndjson has ${bad} unparseable line(s)`)
  } else {
    ok(`ledger.ndjson readable (${lines.length} entr${lines.length === 1 ? 'y' : 'ies'}, ${st.size} bytes)`)
  }
}

function checkVault() {
  const dbPath = join(dataDir, 'aia_vault.db')
  if (existsSync(dbPath)) {
    ok(`SQLite vault present: ${dbPath}`)
  } else {
    warn(`aia_vault.db not found yet at ${dbPath}`)
  }
}

function main() {
  console.log('AIA runtime doctor')
  console.log(`root: ${root}`)
  checkCrypto()
  checkKeys()
  checkLedger()
  checkVault()
  console.log('---')
  if (issues) {
    console.error(`doctor: ${issues} issue(s) — fix before signing`)
    process.exit(1)
  }
  console.log('doctor: all critical checks passed')
  process.exit(0)
}

main()
