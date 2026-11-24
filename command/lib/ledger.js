/**
 * Append-only ledger.ndjson.
 *
 * Each line is one human-authorized action. The line commits:
 *   - payloadHash: SHA-256 of the canonical card payload
 *   - signature:   Ed25519 over the canonical entry body
 *   - entryHash:   SHA-256 of the canonical signed body (the chain link)
 *   - prev:        previous entryHash, or 64 zeros for the first line
 *
 * Lines are only ever appended. Verification recomputes the hashes and
 * checks the signature against the local sovereign public key.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { payloadHash, sha256Text, canonicalJson } from './canonical.js'
import { pemToRawPublicHex, signCanonical, verifyCanonical } from './keys.js'

export const GENESIS = '0'.repeat(64)

/** Fields covered by the Ed25519 signature. entryHash is derived, not signed. */
export function entryBody(entry) {
  return {
    seq: entry.seq,
    prev: entry.prev,
    cardId: entry.cardId,
    action: entry.action,
    payloadHash: entry.payloadHash,
    publicKey: entry.publicKey,
    timestamp: entry.timestamp,
  }
}

export function hashEntry(entry) {
  const committed = { ...entryBody(entry), signature: entry.signature }
  return sha256Text(canonicalJson(committed))
}

export class Ledger {
  constructor(filePath) {
    this.filePath = filePath
    mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 })
    if (!existsSync(filePath)) writeFileSync(filePath, '', { mode: 0o600 })
  }

  readEntries() {
    const raw = readFileSync(this.filePath, 'utf8')
    const entries = []
    const lines = raw.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      try {
        entries.push(JSON.parse(line))
      } catch {
        const error = new Error(`ledger line ${i + 1} is not valid JSON`)
        error.line = i + 1
        throw error
      }
    }
    return entries
  }

  tipHash() {
    const entries = this.readEntries()
    if (!entries.length) return GENESIS
    return entries[entries.length - 1].entryHash || GENESIS
  }

  /**
   * Sign `payload` under `action` and append one line.
   * Caller must already have collected explicit human confirmation.
   */
  appendSigned({ cardId, action, payload, privateKeyPem, publicKeyHex, timestamp }) {
    const entries = this.readEntries()
    const prev = entries.length ? entries[entries.length - 1].entryHash : GENESIS
    const seq = entries.length ? Number(entries[entries.length - 1].seq) + 1 : 1
    const body = {
      seq,
      prev,
      cardId,
      action,
      payloadHash: payloadHash(payload),
      publicKey: publicKeyHex,
      timestamp,
    }
    const signature = signCanonical(privateKeyPem, body)
    const entry = { ...body, signature, entryHash: hashEntry({ ...body, signature }) }
    appendFileSync(this.filePath, JSON.stringify(entry) + '\n')
    return entry
  }
}

/**
 * Build a hex → PEM trust map from a single PEM, a Map, or a keyring-like list.
 * Rotated deployments pass every retained public key so older lines still verify.
 */
export function buildTrustedKeyMap(trust) {
  const byHex = new Map()
  if (!trust) return byHex
  if (trust instanceof Map) {
    for (const [hex, pem] of trust.entries()) {
      if (pem) byHex.set(hex || pemToRawPublicHex(pem), pem)
    }
    return byHex
  }
  if (typeof trust === 'string') {
    byHex.set(pemToRawPublicHex(trust), trust)
    return byHex
  }
  if (Array.isArray(trust)) {
    for (const item of trust) {
      const pem = typeof item === 'string' ? item : item?.publicKeyPem
      if (!pem) continue
      const hex = item?.publicKeyHex || pemToRawPublicHex(pem)
      byHex.set(hex, pem)
    }
  }
  return byHex
}

/**
 * Walk the chain. Trust may be one PEM (legacy) or a map/list of retained
 * public keys so rotated keyrings can still audit historical lines.
 */
export function verifyLedgerEntries(entries, trust) {
  const errors = []
  let prev = GENESIS
  const byHex = buildTrustedKeyMap(trust)

  entries.forEach((entry, idx) => {
    const n = idx + 1
    if (entry.prev !== prev) errors.push(`line ${n}: prev does not match prior entryHash`)
    if (entry.seq !== n) errors.push(`line ${n}: seq ${entry.seq} != ${n}`)
    if (hashEntry(entry) !== entry.entryHash) errors.push(`line ${n}: entryHash mismatch`)
    const signerPem = byHex.get(entry.publicKey)
    if (!signerPem) {
      errors.push(`line ${n}: public key is not in the trusted keyring`)
    } else if (!verifyCanonical(signerPem, entryBody(entry), entry.signature)) {
      errors.push(`line ${n}: Ed25519 signature invalid`)
    }
    prev = entry.entryHash
  })

  return {
    ok: errors.length === 0,
    errors,
    count: entries.length,
    tip: entries.length ? entries[entries.length - 1].entryHash : GENESIS,
  }
}

export function verifyLedgerFile(filePath, trust) {
  if (!filePath || !existsSync(filePath)) {
    return { ok: true, errors: [], count: 0, tip: GENESIS, missing: true }
  }
  try {
    const ledger = new Ledger(filePath)
    const result = verifyLedgerEntries(ledger.readEntries(), trust)
    return { ...result, missing: false, filePath }
  } catch (err) {
    return {
      ok: false,
      errors: [err.message || 'ledger unreadable'],
      count: 0,
      tip: null,
      missing: false,
      filePath,
    }
  }
}
