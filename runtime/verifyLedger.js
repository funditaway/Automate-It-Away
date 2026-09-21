#!/usr/bin/env node
/**
 * verifyLedger.js — Independently recompute SHA-256 and verify Ed25519
 * signatures for every historical entry in ledger.ndjson.
 *
 * Usage:
 *   node verifyLedger.js [ledgerPath] [publicKeyPath]
 *
 * Defaults (from runtime cwd):
 *   data/ledger.ndjson
 *   .keys/public_key.pem  (falls back to .keys/ed25519.pub.pem)
 */
'use strict'

import { createHash, verify as cryptoVerify } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = __dirname

function canonicalJson(value) {
  return JSON.stringify(sortValue(value))
}

function sortValue(value) {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(sortValue)
  const out = {}
  for (const key of Object.keys(value).sort()) {
    out[key] = sortValue(value[key])
  }
  return out
}

function sha256Hex(value) {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')
}

function resolvePublicKey(explicit) {
  if (explicit && existsSync(explicit)) return explicit
  const candidates = [
    join(root, '.keys', 'public_key.pem'),
    join(root, '.keys', 'ed25519.pub.pem'),
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return null
}

function verifyEntry(entry, publicKeyPem, index) {
  const tx = entry.tx
  if (!tx || typeof tx !== 'object') {
    return { pass: false, hashOk: false, sigOk: false, cardId: '?', reason: 'missing tx' }
  }
  const expectedHash = sha256Hex(tx)
  const hashOk = expectedHash === entry.hash
  let sigOk = false
  try {
    const message = Buffer.from(canonicalJson(tx), 'utf8')
    const signature = Buffer.from(String(entry.signature || ''), 'hex')
    sigOk = cryptoVerify(null, message, publicKeyPem, signature)
  } catch {
    sigOk = false
  }
  return {
    pass: hashOk && sigOk,
    hashOk,
    sigOk,
    cardId: tx.cardId || '?',
    index,
  }
}

function main() {
  const ledgerPath = resolve(process.argv[2] || join(root, 'data', 'ledger.ndjson'))
  const pubPath = resolvePublicKey(process.argv[3] ? resolve(process.argv[3]) : null)

  if (!pubPath) {
    console.error('[FAIL] public key missing — run ./start.sh or ensure .keys/public_key.pem exists')
    process.exit(1)
  }
  if (!existsSync(ledgerPath)) {
    console.error(`[FAIL] ledger not found: ${ledgerPath}`)
    process.exit(1)
  }

  const publicKeyPem = readFileSync(pubPath, 'utf8')
  const lines = readFileSync(ledgerPath, 'utf8').split('\n').filter((l) => l.trim())

  if (!lines.length) {
    console.log('[PASS] ledger empty (nothing to verify)')
    process.exit(0)
  }

  let failed = 0
  lines.forEach((line, i) => {
    let entry
    try {
      entry = JSON.parse(line)
    } catch (err) {
      console.log(`[FAIL] #${i} parse error: ${err.message}`)
      failed += 1
      return
    }
    const result = verifyEntry(entry, publicKeyPem, i)
    const tag = result.pass ? '[PASS]' : '[FAIL]'
    const detail = result.pass
      ? `hash+sig ok`
      : `hash=${result.hashOk ? 'ok' : 'BAD'} sig=${result.sigOk ? 'ok' : 'BAD'}${result.reason ? ' ' + result.reason : ''}`
    console.log(`${tag} #${i} card=${result.cardId} ${detail}`)
    if (!result.pass) failed += 1
  })

  console.log(`---\nverified ${lines.length} entr${lines.length === 1 ? 'y' : 'ies'}; ${failed} failed`)
  process.exit(failed ? 1 : 0)
}

main()
