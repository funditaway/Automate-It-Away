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
 * Walk the chain. `publicKeyPem` pins every line to this node's key so a
 * foreign signature cannot be spliced in.
 */
export function verifyLedgerEntries(entries, publicKeyPem) {
  const errors = []
  let prev = GENESIS
  const expectedHex = publicKeyPem ? pemToRawPublicHex(publicKeyPem) : null

  entries.forEach((entry, idx) => {
    const n = idx + 1
    if (entry.prev !== prev) errors.push(`line ${n}: prev does not match prior entryHash`)
    if (entry.seq !== n) errors.push(`line ${n}: seq ${entry.seq} != ${n}`)
    if (hashEntry(entry) !== entry.entryHash) errors.push(`line ${n}: entryHash mismatch`)
    if (expectedHex && entry.publicKey !== expectedHex) {
      errors.push(`line ${n}: public key is not the local sovereign key`)
    }
    if (!publicKeyPem || !verifyCanonical(publicKeyPem, entryBody(entry), entry.signature)) {
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

export function verifyLedgerFile(filePath, publicKeyPem) {
  if (!filePath || !existsSync(filePath)) {
    return { ok: true, errors: [], count: 0, tip: GENESIS, missing: true }
  }
  try {
    const ledger = new Ledger(filePath)
    const result = verifyLedgerEntries(ledger.readEntries(), publicKeyPem)
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
