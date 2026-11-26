#!/usr/bin/env node
/**
 * Read-only queue / spool / keyring / ledger snapshot.
 *
 * Does not start the daemon and never mutates state. The HITL queue is
 * in-memory while the daemon runs; if `active_queue.json` is present it is
 * summarized. Spool / keyring / ledger are always inspected from disk.
 *
 *   node statusSummary.js
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadKeyring } from './lib/keys.js'
import { loadLedgerAnchor } from './lib/ledger.js'

const here = dirname(fileURLToPath(import.meta.url))

function readJsonSafe(filePath, fallback) {
  try {
    if (!existsSync(filePath)) return fallback
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    return fallback
  }
}

function countNonEmptyLines(filePath) {
  if (!existsSync(filePath)) return 0
  const raw = readFileSync(filePath, 'utf8').trim()
  if (!raw) return 0
  return raw.split('\n').filter((line) => line.trim().length > 0).length
}

function getLatestLedgerRecord(filePath) {
  if (!existsSync(filePath)) return null
  const raw = readFileSync(filePath, 'utf8').trim()
  if (!raw) return null
  const lines = raw.split('\n').filter((line) => line.trim().length > 0)
  try {
    return JSON.parse(lines[lines.length - 1])
  } catch {
    return null
  }
}

export function buildStatusSummary(opts = {}) {
  const dataDir = opts.dataDir || join(here, 'data')
  const keyDir = opts.keyDir || join(dataDir, '.keys')
  const queuePath = opts.queuePath || join(dataDir, 'active_queue.json')
  const ledgerPath = opts.ledgerPath || join(dataDir, 'ledger.ndjson')
  const spoolPath = opts.spoolPath || join(dataDir, 'spool.ndjson')

  const queueData = readJsonSafe(queuePath, [])
  const cards = Array.isArray(queueData)
    ? queueData
    : Array.isArray(queueData.cards)
      ? queueData.cards
      : []

  const byStatus = {}
  const byRisk = {}
  for (const card of cards) {
    const statusKey = String(card.status || 'UNKNOWN').toUpperCase()
    const riskKey = String(card.riskLevel || card.payload?.riskLevel || 'medium').toLowerCase()
    byStatus[statusKey] = (byStatus[statusKey] || 0) + 1
    byRisk[riskKey] = (byRisk[riskKey] || 0) + 1
  }

  const keyring = loadKeyring(keyDir)
  const keys = Array.isArray(keyring.keys) ? keyring.keys : []
  const activeKeys = keys.filter((k) => k && k.status === 'ACTIVE').length
  const retiredKeys = keys.filter((k) => k && k.status === 'RETIRED').length

  const spoolPending = countNonEmptyLines(spoolPath)
  const ledgerEntries = countNonEmptyLines(ledgerPath)
  const latestRecord = getLatestLedgerRecord(ledgerPath)
  const anchor = loadLedgerAnchor(ledgerPath)

  return {
    checkedAt: opts.checkedAt || new Date().toISOString(),
    dataDir,
    queue: {
      source: existsSync(queuePath) ? queuePath : null,
      note: existsSync(queuePath)
        ? 'File snapshot present'
        : 'Daemon queue is in-memory; no active_queue.json snapshot on disk',
      totalCards: cards.length,
      byStatus,
      byRisk,
    },
    spool: {
      path: existsSync(spoolPath) ? spoolPath : null,
      pendingEvents: spoolPending,
    },
    keyring: {
      activeKeyId: keyring.activeKeyId || null,
      activeKeys,
      retiredKeys,
      totalKeys: keys.length,
    },
    ledger: {
      entries: ledgerEntries,
      latestCardId: latestRecord ? latestRecord.cardId || null : null,
      latestAction: latestRecord ? latestRecord.action || latestRecord.decision || null : null,
      latestEntryHash: latestRecord ? latestRecord.entryHash || null : null,
      anchor: anchor
        ? {
            expectedPrev: anchor.expectedPrev,
            expectedNextSeq: anchor.expectedNextSeq,
            lastArchivedHash: anchor.lastArchivedHash,
            archiveMetaFile: anchor.archiveMetaFile,
          }
        : null,
    },
  }
}

function isMain() {
  const entry = process.argv[1]
  if (!entry) return false
  return fileURLToPath(import.meta.url) === resolve(entry)
}

if (isMain()) {
  const dataDir = process.env.AIA_DATA_DIR || join(here, 'data')
  const summary = buildStatusSummary({
    dataDir,
    keyDir: process.env.AIA_KEY_DIR || join(dataDir, '.keys'),
    queuePath: process.env.AIA_QUEUE_PATH || join(dataDir, 'active_queue.json'),
    ledgerPath: process.env.AIA_LEDGER_PATH || join(dataDir, 'ledger.ndjson'),
    spoolPath: process.env.AIA_SPOOL_PATH || join(dataDir, 'spool.ndjson'),
  })
  console.log(JSON.stringify(summary, null, 2))
}
