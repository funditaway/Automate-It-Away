#!/usr/bin/env node
/**
 * Inspect and recover quarantined spool.deadletter.ndjson entries.
 *
 * Review failure reasons first (--inspect), then selectively re-append
 * recoverable payloads into spool.ndjson, or dispatch them directly to
 * the HITL daemon with --send. Un-requeued lines stay in the dead-letter
 * file; rewrites are atomic with 0600 permissions.
 *
 *   node requeueDeadletter.js --inspect
 *   node requeueDeadletter.js --reason HTTP_400 --limit 5
 *   node requeueDeadletter.js --send --reason HTTP_422
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { postSpoolEvent } from './flushSpool.js'

const here = dirname(fileURLToPath(import.meta.url))
const DEFAULT_CHANNELS = new Set(['ghl', 'smarthq', 'telemetry'])

function parseArgs(argv) {
  const opts = {
    inspectOnly: false,
    sendDirect: false,
    reasonFilter: null,
    limit: Infinity,
  }

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--inspect') {
      opts.inspectOnly = true
    } else if (argv[i] === '--send') {
      opts.sendDirect = true
    } else if (argv[i] === '--reason' && argv[i + 1]) {
      opts.reasonFilter = String(argv[i + 1]).trim()
      i += 1
    } else if (argv[i] === '--limit' && argv[i + 1]) {
      const parsed = Number.parseInt(argv[i + 1], 10)
      if (Number.isFinite(parsed) && parsed > 0) {
        opts.limit = parsed
      }
      i += 1
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

function normalizeChannel(value) {
  const channel = String(value || 'telemetry').toLowerCase()
  return DEFAULT_CHANNELS.has(channel) ? channel : 'telemetry'
}

/**
 * Recover a deliverable { channel, payload } from a dead-letter NDJSON line.
 * Requires an explicit object `payload` (HTTP quarantine shape) or a
 * parseable `rawLine` that itself contains a payload / inbound body.
 * Never treats quarantine metadata (reason/quarantinedAt) as the event body.
 */
export function extractRecoverablePayload(rawLine) {
  const parsed = JSON.parse(rawLine)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Dead-letter line is not a JSON object')
  }

  if (parsed.payload && typeof parsed.payload === 'object' && !Array.isArray(parsed.payload)) {
    return {
      envelope: parsed,
      channel: normalizeChannel(parsed.channel),
      payload: parsed.payload,
    }
  }

  if (typeof parsed.rawLine === 'string' && parsed.rawLine.trim()) {
    const inner = JSON.parse(parsed.rawLine)
    if (!inner || typeof inner !== 'object' || Array.isArray(inner)) {
      throw new Error('rawLine is not a recoverable object')
    }
    if (inner.payload && typeof inner.payload === 'object' && !Array.isArray(inner.payload)) {
      return {
        envelope: parsed,
        channel: normalizeChannel(inner.channel || parsed.channel),
        payload: inner.payload,
      }
    }
    return {
      envelope: parsed,
      channel: normalizeChannel(inner.channel || parsed.channel),
      payload: inner,
    }
  }

  throw new Error('No recoverable payload on dead-letter entry')
}

function previewEntry(line, lineNumber) {
  let reason = 'UNKNOWN'
  let quarantinedAt = null
  let cardId = null
  let channel = null

  try {
    const obj = JSON.parse(line)
    reason = obj.reason || 'RECORDED'
    quarantinedAt = obj.quarantinedAt || null
    channel = obj.channel || null
    const p = obj.payload && typeof obj.payload === 'object' ? obj.payload : null
    cardId = (p && p.cardId) || obj.cardId || null
  } catch {
    reason = 'MALFORMED_JSON'
  }

  return { lineNumber, reason, quarantinedAt, cardId, channel }
}

export async function requeueDeadletter(opts = {}) {
  const dataDir = opts.dataDir || join(here, 'data')
  const deadletterPath = opts.deadletterPath || join(dataDir, 'spool.deadletter.ndjson')
  const spoolPath = opts.spoolPath || join(dataDir, 'spool.ndjson')
  const ingestUrl =
    opts.ingestUrl || process.env.AIA_DAEMON_URL || process.env.AIA_INGEST_URL || 'http://127.0.0.1:3000'
  const secret = opts.secret ?? process.env.AIA_WEBHOOK_SECRET ?? ''
  const inspectOnly = Boolean(opts.inspectOnly)
  const sendDirect = Boolean(opts.sendDirect)
  const reasonFilter = opts.reasonFilter || null
  const limit = Number.isFinite(opts.limit) && opts.limit > 0 ? opts.limit : Infinity
  const postEvent = opts.postEvent || postSpoolEvent

  if (!existsSync(deadletterPath)) {
    return {
      deadletterPath,
      totalQuarantined: 0,
      requeued: 0,
      remaining: 0,
      reason: 'Dead-letter file does not exist',
    }
  }

  const lines = readFileSync(deadletterPath, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  if (lines.length === 0) {
    return {
      deadletterPath,
      totalQuarantined: 0,
      requeued: 0,
      remaining: 0,
    }
  }

  const previews = []
  const keepLines = []
  const toProcess = []

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const preview = previewEntry(line, i + 1)
    previews.push(preview)

    const matchesReason = !reasonFilter || preview.reason === reasonFilter
    if (!inspectOnly && matchesReason && toProcess.length < limit) {
      toProcess.push(line)
    } else {
      keepLines.push(line)
    }
  }

  if (inspectOnly) {
    return {
      inspectOnly: true,
      deadletterPath,
      totalQuarantined: lines.length,
      entries: previews,
    }
  }

  let requeued = 0
  const spoolAppends = []
  const stillQuarantined = [...keepLines]

  for (const line of toProcess) {
    try {
      const { channel, payload } = extractRecoverablePayload(line)
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        stillQuarantined.push(line)
        continue
      }

      if (sendDirect) {
        const res = await postEvent(ingestUrl, channel, payload, {
          secret,
          fetchImpl: opts.fetchImpl,
          timeoutMs: opts.timeoutMs,
        })
        if (res.status >= 200 && res.status < 300) {
          requeued += 1
        } else {
          stillQuarantined.push(line)
        }
      } else {
        spoolAppends.push(
          JSON.stringify({
            requeuedAt: new Date().toISOString(),
            channel,
            payload,
          }),
        )
        requeued += 1
      }
    } catch {
      stillQuarantined.push(line)
    }
  }

  if (!sendDirect && spoolAppends.length > 0) {
    const existingSpool = existsSync(spoolPath) ? readFileSync(spoolPath, 'utf8') : ''
    const prefix = existingSpool && !existingSpool.endsWith('\n') ? '\n' : ''
    atomicWriteFile(spoolPath, existingSpool + prefix + spoolAppends.join('\n') + '\n', 0o600)
  }

  atomicWriteFile(
    deadletterPath,
    stillQuarantined.length > 0 ? stillQuarantined.join('\n') + '\n' : '',
    0o600,
  )

  return {
    requeued,
    mode: sendDirect ? 'direct-ingest' : 'spool-requeue',
    spoolPath: sendDirect ? null : spoolPath,
    deadletterPath,
    remaining: stillQuarantined.length,
    inspectedCount: previews.length,
    ingestUrl: sendDirect ? ingestUrl : undefined,
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
  requeueDeadletter({
    dataDir,
    spoolPath: process.env.AIA_SPOOL_PATH || join(dataDir, 'spool.ndjson'),
    deadletterPath: process.env.AIA_DEADLETTER_PATH || join(dataDir, 'spool.deadletter.ndjson'),
    inspectOnly: cli.inspectOnly,
    sendDirect: cli.sendDirect,
    reasonFilter: cli.reasonFilter,
    limit: cli.limit,
  })
    .then((report) => {
      console.log(JSON.stringify(report, null, 2))
    })
    .catch((err) => {
      console.error(err.message || err)
      process.exit(1)
    })
}
