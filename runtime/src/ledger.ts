import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'
import { canonicalJson, payloadHash, signCanonical, verifyCanonical } from './crypto.js'
import type { ActiveDecisionCard, DecisionCardPayload } from './types.js'

/** Standardized append-only transaction recorded in ledger.ndjson */
export interface LedgerTransaction {
  cardId: string
  agentId: string
  packName: string
  actionType: string
  riskLevel: string
  targetEndpoint: string
  summary: string
  source?: string
  diffData?: DecisionCardPayload['diffData']
  timestamp: number
}

export interface LedgerEntry {
  tx: LedgerTransaction
  /** SHA-256 hex of canonicalJson(tx) */
  hash: string
  /** Ed25519 hex signature over the transaction payload */
  signature: string
  signedAt: number
}

export function defaultLedgerPath(dataDir: string): string {
  return join(dataDir, 'ledger.ndjson')
}

export function buildLedgerTransaction(card: ActiveDecisionCard): LedgerTransaction {
  const p = card.payload
  return {
    cardId: card.cardId,
    agentId: p.agentId,
    packName: p.packName,
    actionType: p.actionType,
    riskLevel: p.riskLevel,
    targetEndpoint: p.targetEndpoint,
    summary: p.summary,
    source: p.source,
    diffData: p.diffData,
    timestamp: p.timestamp,
  }
}

export function hashTransaction(tx: LedgerTransaction): string {
  return payloadHash(tx)
}

/** Sign a transaction: hash proof + Ed25519 signature over the tx object. */
export function signLedgerTransaction(
  privateKeyPem: string,
  tx: LedgerTransaction,
  signedAt = Date.now(),
): LedgerEntry {
  const hash = hashTransaction(tx)
  const signature = signCanonical(privateKeyPem, tx)
  return { tx, hash, signature, signedAt }
}

export function appendLedgerEntry(ledgerPath: string, entry: LedgerEntry): void {
  mkdirSync(dirname(ledgerPath), { recursive: true })
  const line = JSON.stringify(entry) + '\n'
  appendFileSync(ledgerPath, line, { encoding: 'utf8', mode: 0o600 })
}

export function readLedgerEntries(ledgerPath: string): LedgerEntry[] {
  if (!existsSync(ledgerPath)) return []
  const raw = readFileSync(ledgerPath, 'utf8')
  const entries: LedgerEntry[] = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    entries.push(JSON.parse(trimmed) as LedgerEntry)
  }
  return entries
}

export interface LedgerVerifyResult {
  index: number
  cardId: string
  hashOk: boolean
  sigOk: boolean
  pass: boolean
}

/** Independently recompute SHA-256 and verify Ed25519 for every ledger line. */
export function verifyLedgerEntries(
  entries: LedgerEntry[],
  publicKeyPem: string,
): LedgerVerifyResult[] {
  return entries.map((entry, index) => {
    const expectedHash = hashTransaction(entry.tx)
    const hashOk = expectedHash === entry.hash
    const sigOk = verifyCanonical(publicKeyPem, entry.tx, entry.signature)
    return {
      index,
      cardId: entry.tx.cardId,
      hashOk,
      sigOk,
      pass: hashOk && sigOk,
    }
  })
}

/** Tip hash for telemetry: last entry's hash, or genesis stub. */
export function ledgerNdjsonTip(ledgerPath: string): string {
  const entries = readLedgerEntries(ledgerPath)
  if (!entries.length) {
    return createHash('sha256').update('genesis').digest('hex').slice(0, 16)
  }
  return entries[entries.length - 1].hash.slice(0, 16)
}

export function serializeLedgerLine(entry: LedgerEntry): string {
  return canonicalJson(entry)
}
