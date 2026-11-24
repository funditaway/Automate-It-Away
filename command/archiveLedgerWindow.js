#!/usr/bin/env node
/**
 * Chain-aware ledger archive / prune.
 *
 * Moves older ledger.ndjson lines into data/ledger-archives/ while writing
 * ledger.anchor.json so the hot file remains verifiable and appendable.
 *
 *   node archiveLedgerWindow.js --keep-last 1000
 *   node archiveLedgerWindow.js --before-days 30 --dry-run
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { GENESIS, writeLedgerAnchor } from './lib/ledger.js'

const here = dirname(fileURLToPath(import.meta.url))

function sha256Hex(buf) {
  return createHash('sha256').update(buf).digest('hex')
}

function parseArgs(argv) {
  const opts = { keepLast: 1000, dryRun: false, beforeDays: null }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--keep-last' && argv[i + 1]) {
      const n = Number.parseInt(argv[i + 1], 10)
      if (Number.isFinite(n) && n >= 0) opts.keepLast = n
      i += 1
    } else if (argv[i] === '--before-days' && argv[i + 1]) {
      const d = Number.parseFloat(argv[i + 1])
      if (Number.isFinite(d) && d > 0) opts.beforeDays = d
      i += 1
    } else if (argv[i] === '--dry-run') {
      opts.dryRun = true
    }
  }
  return opts
}

function atomicWriteFile(targetPath, content, mode = 0o600) {
  mkdirSync(dirname(targetPath), { recursive: true, mode: 0o700 })
  const tmpPath = `${targetPath}.${process.pid}.tmp`
  writeFileSync(tmpPath, content, { mode })
  renameSync(tmpPath, targetPath)
}

function entryTimestampMs(rec) {
  const raw = rec.decidedAt ?? rec.timestamp ?? rec.createdAt ?? rec.authorizedAt
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    // Heuristic: seconds vs milliseconds
    return raw < 1e12 ? raw * 1000 : raw
  }
  const parsed = Date.parse(String(raw || ''))
  return Number.isFinite(parsed) ? parsed : null
}

export function planLedgerArchive(lines, opts = {}) {
  const keepLast = Number.isFinite(opts.keepLast) ? opts.keepLast : 1000
  let splitIndex = Math.max(0, lines.length - keepLast)

  if (opts.beforeDays != null) {
    const cutoffMs = Date.now() - opts.beforeDays * 24 * 60 * 60 * 1000
    let ageSplit = 0
    for (let i = 0; i < lines.length; i += 1) {
      try {
        const rec = JSON.parse(lines[i])
        const ts = entryTimestampMs(rec)
        if (ts != null && ts < cutoffMs) ageSplit = i + 1
        else break
      } catch {
        break
      }
    }
    splitIndex = Math.min(splitIndex, ageSplit)
  }

  return {
    splitIndex,
    archivedLines: lines.slice(0, splitIndex),
    retainedLines: lines.slice(splitIndex),
  }
}

export function archiveLedgerWindow(opts = {}) {
  const dataDir = opts.dataDir || join(here, 'data')
  const ledgerPath = opts.ledgerPath || join(dataDir, 'ledger.ndjson')
  const archiveDir = opts.archiveDir || join(dataDir, 'ledger-archives')
  const keepLast = opts.keepLast ?? 1000
  const beforeDays = opts.beforeDays ?? null
  const dryRun = Boolean(opts.dryRun)

  if (!existsSync(ledgerPath)) {
    return { archived: false, reason: 'Ledger file not found', ledgerPath }
  }

  const raw = readFileSync(ledgerPath, 'utf8')
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  if (lines.length === 0) {
    return { archived: false, reason: 'Ledger is empty', totalEntries: 0 }
  }

  const plan = planLedgerArchive(lines, { keepLast, beforeDays })
  if (plan.splitIndex <= 0) {
    return {
      archived: false,
      reason: 'No entries eligible for archival under current retention window',
      totalEntries: lines.length,
      retainedEntries: lines.length,
    }
  }

  const { archivedLines, retainedLines } = plan
  const archivedPayload = Buffer.from(archivedLines.join('\n') + '\n', 'utf8')
  const retainedPayload = Buffer.from(
    retainedLines.length ? retainedLines.join('\n') + '\n' : '',
    'utf8',
  )

  let firstArchivedHash = null
  let lastArchivedHash = null
  let lastArchivedSeq = null
  let firstRetainedPrev = null
  let firstRetainedEntryHash = null
  let firstRetainedSeq = null

  try {
    const firstArch = JSON.parse(archivedLines[0])
    const lastArch = JSON.parse(archivedLines[archivedLines.length - 1])
    firstArchivedHash = firstArch.entryHash || null
    lastArchivedHash = lastArch.entryHash || null
    lastArchivedSeq = lastArch.seq ?? null
  } catch {
    /* raw slice still written */
  }

  if (retainedLines.length) {
    try {
      const firstRet = JSON.parse(retainedLines[0])
      firstRetainedPrev = firstRet.prev || null
      firstRetainedEntryHash = firstRet.entryHash || null
      firstRetainedSeq = firstRet.seq ?? null
    } catch {
      /* ignore */
    }
  }

  const stamp = (opts.stamp || new Date().toISOString()).replace(/[:.]/g, '-')
  const sliceFile = join(archiveDir, `ledger-slice-${stamp}.ndjson`)
  const metaFile = join(archiveDir, `ledger-slice-${stamp}.meta.json`)

  const expectedNextSeq =
    firstRetainedSeq != null
      ? Number(firstRetainedSeq)
      : lastArchivedSeq != null
        ? Number(lastArchivedSeq) + 1
        : 1

  const metadata = {
    createdAt: opts.stamp || new Date().toISOString(),
    sourceLedgerPath: ledgerPath,
    sliceFile,
    archivedCount: archivedLines.length,
    retainedCount: retainedLines.length,
    sliceSha256: sha256Hex(archivedPayload),
    firstArchivedHash,
    lastArchivedHash,
    firstRetainedPrevHash: firstRetainedPrev,
    firstRetainedEntryHash,
    boundaryPrevHash: lastArchivedHash,
    boundaryEntryHash: firstRetainedEntryHash,
    expectedPrevForLiveLedger: lastArchivedHash || GENESIS,
    expectedNextSeq,
  }

  if (dryRun) {
    return {
      dryRun: true,
      wouldArchiveCount: archivedLines.length,
      wouldRetainCount: retainedLines.length,
      sliceFile,
      metaFile,
      metadata,
    }
  }

  mkdirSync(archiveDir, { recursive: true, mode: 0o700 })
  atomicWriteFile(sliceFile, archivedPayload, 0o600)
  atomicWriteFile(metaFile, JSON.stringify(metadata, null, 2) + '\n', 0o600)
  atomicWriteFile(ledgerPath, retainedPayload, 0o600)

  const anchor = writeLedgerAnchor(ledgerPath, {
    createdAt: metadata.createdAt,
    expectedPrev: metadata.expectedPrevForLiveLedger,
    expectedNextSeq: metadata.expectedNextSeq,
    lastArchivedHash,
    archiveMetaFile: metaFile,
  })

  return {
    archived: true,
    sliceFile,
    metaFile,
    anchorPath: anchor.path,
    archivedCount: archivedLines.length,
    retainedCount: retainedLines.length,
    sliceSha256: metadata.sliceSha256,
    boundaryPrevHash: metadata.boundaryPrevHash,
    boundaryEntryHash: metadata.boundaryEntryHash,
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
  const result = archiveLedgerWindow({
    dataDir,
    ledgerPath: process.env.AIA_LEDGER_PATH || join(dataDir, 'ledger.ndjson'),
    archiveDir: process.env.AIA_LEDGER_ARCHIVE_DIR || join(dataDir, 'ledger-archives'),
    keepLast: cli.keepLast,
    beforeDays: cli.beforeDays,
    dryRun: cli.dryRun,
  })
  console.log(JSON.stringify(result, null, 2))
  if (result.archived === false && result.reason === 'Ledger file not found') process.exit(1)
}
