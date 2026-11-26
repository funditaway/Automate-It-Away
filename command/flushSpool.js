#!/usr/bin/env node
/**
 * Drain spool.ndjson into the HITL daemon webhook routes.
 *
 * Replays buffered inbound events (after outages) to /webhook/<channel>,
 * optionally quarantining malformed or 4xx-rejected lines into
 * spool.deadletter.ndjson so poison payloads cannot block the drain.
 *
 *   node flushSpool.js
 *   node flushSpool.js --dry-run
 *   node flushSpool.js --quarantine-invalid
 */
import { createHmac } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const DEFAULT_CHANNELS = new Set(['ghl', 'smarthq', 'telemetry'])

function parseArgs(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
    quarantineInvalid: argv.includes('--quarantine-invalid'),
  }
}

function atomicWriteFile(targetPath, content, mode = 0o600) {
  mkdirSync(dirname(targetPath), { recursive: true, mode: 0o700 })
  const tmpPath = `${targetPath}.${process.pid}.tmp`
  writeFileSync(tmpPath, content, { mode })
  renameSync(tmpPath, targetPath)
}

function resolveEndpoint(baseUrl, channel) {
  const normalized = String(baseUrl || '').replace(/\/+$/, '')
  if (/\/webhook(\/|$)/i.test(normalized) || /\/api\/queue$/i.test(normalized)) {
    return normalized
  }
  const safeChannel = DEFAULT_CHANNELS.has(channel) ? channel : 'telemetry'
  return `${normalized}/webhook/${safeChannel}`
}

function extractDelivery(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return { channel: 'telemetry', payload: parsed }
  }
  const channel = String(parsed.channel || parsed.pack || 'telemetry').toLowerCase()
  const payload =
    parsed.payload && typeof parsed.payload === 'object'
      ? parsed.payload
      : parsed.card && typeof parsed.card === 'object'
        ? parsed.card
        : parsed
  return {
    channel: DEFAULT_CHANNELS.has(channel) ? channel : 'telemetry',
    payload,
  }
}

export async function postSpoolEvent(baseUrl, channel, payload, opts = {}) {
  const endpoint = resolveEndpoint(baseUrl, channel)
  const rawBuf = Buffer.from(JSON.stringify(payload), 'utf8')
  const headers = {
    'Content-Type': 'application/json',
    'Content-Length': String(Buffer.byteLength(rawBuf)),
    'X-AIA-Timestamp': String(Math.floor(Date.now() / 1000)),
  }
  const secret = opts.secret || ''
  if (secret) {
    const sig = createHmac('sha256', secret).update(rawBuf).digest('hex')
    headers['X-AIA-Signature'] = `sha256=${sig}`
  }

  const fetchImpl = opts.fetchImpl || globalThis.fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs || 5000)
  try {
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers,
      body: rawBuf,
      signal: controller.signal,
    })
    const body = await res.text()
    return { status: res.status || 0, body, endpoint }
  } finally {
    clearTimeout(timer)
  }
}

export async function flushSpool(opts = {}) {
  const dataDir = opts.dataDir || join(here, 'data')
  const spoolPath = opts.spoolPath || join(dataDir, 'spool.ndjson')
  const deadletterPath = opts.deadletterPath || join(dataDir, 'spool.deadletter.ndjson')
  const ingestUrl = opts.ingestUrl || process.env.AIA_DAEMON_URL || process.env.AIA_INGEST_URL || 'http://127.0.0.1:3000'
  const secret = opts.secret ?? process.env.AIA_WEBHOOK_SECRET ?? ''
  const dryRun = Boolean(opts.dryRun)
  const quarantineInvalid = Boolean(opts.quarantineInvalid)
  const postEvent = opts.postEvent || postSpoolEvent

  if (!existsSync(spoolPath)) {
    return {
      flushed: 0,
      remaining: 0,
      quarantined: 0,
      spoolPath,
      ingestUrl,
      dryRun,
      reason: 'Spool file does not exist',
    }
  }

  const lines = readFileSync(spoolPath, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  if (lines.length === 0) {
    return {
      flushed: 0,
      remaining: 0,
      quarantined: 0,
      spoolPath,
      ingestUrl,
      dryRun,
    }
  }

  let flushed = 0
  let quarantined = 0
  const remainingLines = []
  const deadletterEntries = []
  let endpointDown = false

  for (const line of lines) {
    let parsed
    try {
      parsed = JSON.parse(line)
    } catch {
      if (quarantineInvalid) {
        quarantined += 1
        deadletterEntries.push({
          quarantinedAt: new Date().toISOString(),
          reason: 'MALFORMED_JSON',
          rawLine: line,
        })
      } else {
        remainingLines.push(line)
      }
      continue
    }

    if (endpointDown) {
      remainingLines.push(line)
      continue
    }

    const { channel, payload } = extractDelivery(parsed)

    if (dryRun) {
      flushed += 1
      continue
    }

    try {
      const res = await postEvent(ingestUrl, channel, payload, {
        secret,
        fetchImpl: opts.fetchImpl,
        timeoutMs: opts.timeoutMs,
      })
      if (res.status >= 200 && res.status < 300) {
        flushed += 1
      } else if (res.status >= 400 && res.status < 500 && quarantineInvalid) {
        quarantined += 1
        deadletterEntries.push({
          quarantinedAt: new Date().toISOString(),
          reason: `HTTP_${res.status}`,
          responseBody: res.body,
          channel,
          payload,
        })
      } else {
        remainingLines.push(line)
      }
    } catch {
      endpointDown = true
      remainingLines.push(line)
    }
  }

  if (!dryRun) {
    if (deadletterEntries.length > 0) {
      const existingDead = existsSync(deadletterPath) ? readFileSync(deadletterPath, 'utf8') : ''
      const prefix = existingDead && !existingDead.endsWith('\n') ? '\n' : ''
      atomicWriteFile(
        deadletterPath,
        existingDead + prefix + deadletterEntries.map((e) => JSON.stringify(e)).join('\n') + '\n',
        0o600,
      )
    }
    atomicWriteFile(spoolPath, remainingLines.length ? remainingLines.join('\n') + '\n' : '', 0o600)
  }

  return {
    dryRun,
    ingestUrl,
    flushed,
    quarantined,
    remaining: dryRun ? lines.length - flushed : remainingLines.length,
    deadletterPath: quarantined > 0 ? deadletterPath : null,
    endpointDown,
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
  flushSpool({
    dataDir,
    spoolPath: process.env.AIA_SPOOL_PATH || join(dataDir, 'spool.ndjson'),
    deadletterPath: process.env.AIA_DEADLETTER_PATH || join(dataDir, 'spool.deadletter.ndjson'),
    dryRun: cli.dryRun,
    quarantineInvalid: cli.quarantineInvalid,
  })
    .then((report) => {
      console.log(JSON.stringify(report, null, 2))
    })
    .catch((err) => {
      console.error(err.message || err)
      process.exit(1)
    })
}
