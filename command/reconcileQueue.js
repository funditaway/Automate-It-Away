#!/usr/bin/env node
/**
 * Reconcile active_queue.json against signed ledger.ndjson decisions.
 *
 * After crashes, restores, or manual edits, cards may still look PENDING
 * even though ledger.ndjson already recorded authorize/reject/delegate.
 * This tool updates the on-disk queue snapshot to match the ledger.
 *
 *   node reconcileQueue.js
 *   node reconcileQueue.js --dry-run
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

/** Map ledger action / decision labels onto queue status values used by server.js */
export function ledgerActionToQueueStatus(actionOrDecision) {
  const raw = String(actionOrDecision || '').toUpperCase()
  if (raw === 'AUTHORIZE' || raw === 'APPROVED' || raw === 'SIGNED' || raw === 'CARD_APPROVED') {
    return 'signed'
  }
  if (raw === 'REJECT' || raw === 'REJECTED' || raw === 'CARD_REJECTED') {
    return 'rejected'
  }
  if (raw === 'DELEGATE' || raw === 'DELEGATED' || raw === 'DEFERRED') {
    return 'delegated'
  }
  return null
}

function parseArgs(argv) {
  return { dryRun: argv.includes('--dry-run') }
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!existsSync(filePath)) return fallback
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    return fallback
  }
}

export function loadLedgerDecisions(ledgerPath) {
  const decisions = new Map()
  if (!existsSync(ledgerPath)) return decisions

  const raw = readFileSync(ledgerPath, 'utf8')
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  for (const line of lines) {
    try {
      const rec = JSON.parse(line)
      if (!rec?.cardId) continue
      const status = ledgerActionToQueueStatus(rec.action || rec.decision)
      if (!status) continue
      decisions.set(rec.cardId, {
        status,
        decidedAt: rec.decidedAt || rec.authorizedAt || rec.timestamp || null,
        entryHash: rec.entryHash || null,
        action: rec.action || rec.decision || null,
      })
    } catch {
      /* verifyLedger.js reports structural ledger issues */
    }
  }

  return decisions
}

function atomicWriteJson(targetPath, payload, mode = 0o600) {
  mkdirSync(dirname(targetPath), { recursive: true, mode: 0o700 })
  const tmpPath = `${targetPath}.${process.pid}.tmp`
  writeFileSync(tmpPath, JSON.stringify(payload, null, 2) + '\n', { mode })
  renameSync(tmpPath, targetPath)
}

export function reconcileQueue(opts = {}) {
  const dataDir = opts.dataDir || join(here, 'data')
  const queuePath = opts.queuePath || join(dataDir, 'active_queue.json')
  const ledgerPath = opts.ledgerPath || join(dataDir, 'ledger.ndjson')
  const dryRun = Boolean(opts.dryRun)

  const queueRaw = readJsonSafe(queuePath, [])
  const isWrapped = !Array.isArray(queueRaw) && queueRaw && Array.isArray(queueRaw.cards)
  const cards = Array.isArray(queueRaw) ? queueRaw : isWrapped ? queueRaw.cards : []

  const decisions = loadLedgerDecisions(ledgerPath)
  const changes = []

  const updatedCards = cards.map((card) => {
    if (!card || typeof card !== 'object' || !card.cardId) return card
    const ledgerOutcome = decisions.get(card.cardId)
    if (!ledgerOutcome) return card

    const currentStatus = String(card.status || 'pending').toLowerCase()
    if (currentStatus !== ledgerOutcome.status) {
      changes.push({
        cardId: card.cardId,
        fromStatus: currentStatus,
        toStatus: ledgerOutcome.status,
        decidedAt: ledgerOutcome.decidedAt,
        entryHash: ledgerOutcome.entryHash,
        action: ledgerOutcome.action,
      })
      return {
        ...card,
        status: ledgerOutcome.status,
        reconciledAt: opts.reconciledAt || new Date().toISOString(),
        ledgerEntryHash: ledgerOutcome.entryHash || card.ledgerEntryHash || null,
      }
    }
    return card
  })

  const nextQueuePayload = isWrapped ? { ...queueRaw, cards: updatedCards } : updatedCards

  if (!dryRun && changes.length > 0) {
    atomicWriteJson(queuePath, nextQueuePayload, 0o600)
  }

  return {
    reconciled: !dryRun && changes.length > 0,
    dryRun,
    queuePath,
    ledgerPath,
    queuePresent: existsSync(queuePath),
    totalCards: cards.length,
    ledgerDecisionsFound: decisions.size,
    driftCount: changes.length,
    changes,
  }
}

function isMain() {
  const entry = process.argv[1]
  if (!entry) return false
  return fileURLToPath(import.meta.url) === resolve(entry)
}

if (isMain()) {
  const cli = parseArgs(process.argv.slice(2))
  const dataDir = process.env.AIA_DATA_DIR || join(here, 'data')
  const report = reconcileQueue({
    dataDir,
    queuePath: process.env.AIA_QUEUE_PATH || join(dataDir, 'active_queue.json'),
    ledgerPath: process.env.AIA_LEDGER_PATH || join(dataDir, 'ledger.ndjson'),
    dryRun: cli.dryRun,
  })
  console.log(JSON.stringify(report, null, 2))
}
