import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import Database from 'better-sqlite3'
import type {
  ActiveDecisionCard,
  DecisionCardPayload,
  DecisionCardStatus,
  ProvenanceEntry,
  VaultRecord,
} from './types.js'

const AES_ALGO = 'aes-256-gcm'

export interface VaultDbOptions {
  /** Absolute or relative path to aia_vault.db */
  dbPath?: string
  /** Directory that holds the local AES master key (default: sibling .keys/) */
  keyDir?: string
}

function resolveDbPath(dbPath?: string): string {
  return dbPath || join(process.cwd(), 'data', 'aia_vault.db')
}

function masterKeyPath(keyDir: string): string {
  return join(keyDir, 'vault.aes.key')
}

function loadOrCreateMasterKey(keyDir: string): Buffer {
  mkdirSync(keyDir, { recursive: true })
  const path = masterKeyPath(keyDir)
  if (existsSync(path)) {
    return Buffer.from(readFileSync(path, 'utf8').trim(), 'hex')
  }
  const key = randomBytes(32)
  writeFileSync(path, key.toString('hex'), { mode: 0o600 })
  return key
}

export class VaultDb {
  readonly db: Database.Database
  readonly dbPath: string
  private readonly masterKey: Buffer

  constructor(opts: VaultDbOptions = {}) {
    this.dbPath = resolveDbPath(opts.dbPath)
    mkdirSync(dirname(this.dbPath), { recursive: true })
    const keyDir = opts.keyDir || join(dirname(this.dbPath), '..', '.keys')
    this.masterKey = loadOrCreateMasterKey(keyDir)
    this.db = new Database(this.dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.migrate()
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vault (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        provider TEXT NOT NULL,
        ciphertext TEXT NOT NULL,
        iv TEXT NOT NULL,
        tag TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS queue (
        card_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        signature TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        dispatch_result TEXT
      );

      CREATE TABLE IF NOT EXISTS provenance_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        card_id TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        signature TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_queue_status ON queue(status);
      CREATE INDEX IF NOT EXISTS idx_ledger_card ON provenance_ledger(card_id);
    `)
  }

  close(): void {
    this.db.close()
  }

  // ── Vault (AES-256-GCM) ──────────────────────────────────────────────

  encryptSecret(plaintext: string): { ciphertext: string; iv: string; tag: string } {
    const iv = randomBytes(12)
    const cipher = createCipheriv(AES_ALGO, this.masterKey, iv)
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return {
      ciphertext: enc.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
    }
  }

  decryptSecret(ciphertext: string, iv: string, tag: string): string {
    const decipher = createDecipheriv(AES_ALGO, this.masterKey, Buffer.from(iv, 'base64'))
    decipher.setAuthTag(Buffer.from(tag, 'base64'))
    const plain = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64')),
      decipher.final(),
    ])
    return plain.toString('utf8')
  }

  putCredential(label: string, provider: string, secret: string, id?: string): VaultRecord {
    const now = Date.now()
    const recordId = id || randomUUID()
    const packed = this.encryptSecret(secret)
    const existing = this.db.prepare('SELECT created_at FROM vault WHERE id = ?').get(recordId) as
      | { created_at: number }
      | undefined
    const createdAt = existing?.created_at ?? now
    this.db
      .prepare(
        `INSERT INTO vault (id, label, provider, ciphertext, iv, tag, created_at, updated_at)
         VALUES (@id, @label, @provider, @ciphertext, @iv, @tag, @created_at, @updated_at)
         ON CONFLICT(id) DO UPDATE SET
           label = excluded.label,
           provider = excluded.provider,
           ciphertext = excluded.ciphertext,
           iv = excluded.iv,
           tag = excluded.tag,
           updated_at = excluded.updated_at`,
      )
      .run({
        id: recordId,
        label,
        provider,
        ciphertext: packed.ciphertext,
        iv: packed.iv,
        tag: packed.tag,
        created_at: createdAt,
        updated_at: now,
      })
    return {
      id: recordId,
      label,
      provider,
      ciphertext: packed.ciphertext,
      iv: packed.iv,
      tag: packed.tag,
      createdAt,
      updatedAt: now,
    }
  }

  getCredential(idOrProvider: string): string | null {
    const row = this.db
      .prepare(
        `SELECT ciphertext, iv, tag FROM vault
         WHERE id = ? OR provider = ? OR label = ?
         ORDER BY updated_at DESC LIMIT 1`,
      )
      .get(idOrProvider, idOrProvider, idOrProvider) as
      | { ciphertext: string; iv: string; tag: string }
      | undefined
    if (!row) return null
    return this.decryptSecret(row.ciphertext, row.iv, row.tag)
  }

  listCredentials(): Array<Omit<VaultRecord, 'ciphertext' | 'iv' | 'tag'> & { last4: string }> {
    const rows = this.db
      .prepare('SELECT id, label, provider, ciphertext, iv, tag, created_at, updated_at FROM vault')
      .all() as Array<{
      id: string
      label: string
      provider: string
      ciphertext: string
      iv: string
      tag: string
      created_at: number
      updated_at: number
    }>
    return rows.map((r) => {
      let last4 = ''
      try {
        const plain = this.decryptSecret(r.ciphertext, r.iv, r.tag)
        last4 = plain.slice(-4)
      } catch {
        last4 = '????'
      }
      return {
        id: r.id,
        label: r.label,
        provider: r.provider,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        last4,
      }
    })
  }

  // ── Queue ────────────────────────────────────────────────────────────

  enqueueCard(payload: DecisionCardPayload, cardId?: string): ActiveDecisionCard {
    const id = cardId || `card-${randomUUID()}`
    const now = Date.now()
    const card: ActiveDecisionCard = {
      cardId: id,
      status: 'pending',
      payload: { ...payload, timestamp: payload.timestamp || now },
      createdAt: now,
      updatedAt: now,
    }
    this.db
      .prepare(
        `INSERT INTO queue (card_id, status, payload_json, signature, created_at, updated_at, dispatch_result)
         VALUES (?, 'pending', ?, NULL, ?, ?, NULL)`,
      )
      .run(id, JSON.stringify(card.payload), now, now)
    return card
  }

  getCard(cardId: string): ActiveDecisionCard | null {
    const row = this.db.prepare('SELECT * FROM queue WHERE card_id = ?').get(cardId) as
      | {
          card_id: string
          status: DecisionCardStatus
          payload_json: string
          signature: string | null
          created_at: number
          updated_at: number
          dispatch_result: string | null
        }
      | undefined
    if (!row) return null
    return {
      cardId: row.card_id,
      status: row.status,
      payload: JSON.parse(row.payload_json) as DecisionCardPayload,
      signature: row.signature || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      dispatchResult: row.dispatch_result,
    }
  }

  listCards(status?: DecisionCardStatus): ActiveDecisionCard[] {
    const rows = (
      status
        ? this.db.prepare('SELECT * FROM queue WHERE status = ? ORDER BY created_at ASC').all(status)
        : this.db.prepare('SELECT * FROM queue ORDER BY created_at DESC').all()
    ) as Array<{
      card_id: string
      status: DecisionCardStatus
      payload_json: string
      signature: string | null
      created_at: number
      updated_at: number
      dispatch_result: string | null
    }>
    return rows.map((row) => ({
      cardId: row.card_id,
      status: row.status,
      payload: JSON.parse(row.payload_json) as DecisionCardPayload,
      signature: row.signature || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      dispatchResult: row.dispatch_result,
    }))
  }

  updateCardStatus(
    cardId: string,
    status: DecisionCardStatus,
    extras: { signature?: string; dispatchResult?: string } = {},
  ): ActiveDecisionCard | null {
    const now = Date.now()
    this.db
      .prepare(
        `UPDATE queue SET status = ?, signature = COALESCE(?, signature),
         dispatch_result = COALESCE(?, dispatch_result), updated_at = ?
         WHERE card_id = ?`,
      )
      .run(status, extras.signature ?? null, extras.dispatchResult ?? null, now, cardId)
    return this.getCard(cardId)
  }

  /**
   * Poll until the card leaves `pending`, or timeout.
   * Used by the sandbox interceptor for human authorization.
   */
  async waitForResolution(
    cardId: string,
    opts: { timeoutMs?: number; pollMs?: number } = {},
  ): Promise<ActiveDecisionCard> {
    const timeoutMs = opts.timeoutMs ?? 300_000
    const pollMs = opts.pollMs ?? 250
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const card = this.getCard(cardId)
      if (!card) throw new Error(`Card ${cardId} missing from queue`)
      if (card.status !== 'pending') return card
      await new Promise((r) => setTimeout(r, pollMs))
    }
    throw new Error(`Timed out waiting for human authorization on ${cardId}`)
  }

  // ── Provenance ledger (append-only) ──────────────────────────────────

  appendProvenance(entry: {
    cardId: string
    payloadHash: string
    agentId: string
    signature: string
    timestamp?: number
  }): ProvenanceEntry {
    const timestamp = entry.timestamp ?? Date.now()
    const info = this.db
      .prepare(
        `INSERT INTO provenance_ledger (card_id, payload_hash, agent_id, signature, timestamp)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(entry.cardId, entry.payloadHash, entry.agentId, entry.signature, timestamp)
    return {
      id: Number(info.lastInsertRowid),
      cardId: entry.cardId,
      payloadHash: entry.payloadHash,
      agentId: entry.agentId,
      signature: entry.signature,
      timestamp,
    }
  }

  listProvenance(limit = 50): ProvenanceEntry[] {
    const rows = this.db
      .prepare(
        `SELECT id, card_id, payload_hash, agent_id, signature, timestamp
         FROM provenance_ledger ORDER BY id DESC LIMIT ?`,
      )
      .all(limit) as Array<{
      id: number
      card_id: string
      payload_hash: string
      agent_id: string
      signature: string
      timestamp: number
    }>
    return rows.map((r) => ({
      id: r.id,
      cardId: r.card_id,
      payloadHash: r.payload_hash,
      agentId: r.agent_id,
      signature: r.signature,
      timestamp: r.timestamp,
    }))
  }

  ledgerTipHash(): string {
    const tip = this.db
      .prepare(
        `SELECT card_id, payload_hash, signature, timestamp FROM provenance_ledger
         ORDER BY id DESC LIMIT 1`,
      )
      .get() as
      | { card_id: string; payload_hash: string; signature: string; timestamp: number }
      | undefined
    if (!tip) return createHash('sha256').update('genesis').digest('hex').slice(0, 16)
    return createHash('sha256')
      .update(`${tip.card_id}:${tip.payload_hash}:${tip.signature}:${tip.timestamp}`)
      .digest('hex')
      .slice(0, 16)
  }
}
