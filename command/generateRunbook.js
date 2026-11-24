#!/usr/bin/env node
/**
 * Generate a secret-safe operator RUNBOOK.md from the live workspace.
 *
 * Documents active paths, ports, key IDs, queue/ledger/spool counts, and
 * recovery commands. Never copies .env values, ed25519.pem, or webhook secrets.
 *
 *   node generateRunbook.js
 *   node generateRunbook.js --out /tmp/RUNBOOK.md
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadKeyring } from './lib/keys.js'

const here = dirname(fileURLToPath(import.meta.url))

function parseArgs(argv) {
  let outPath = null
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out' && argv[i + 1]) {
      outPath = argv[i + 1]
      i += 1
    }
  }
  return { outPath }
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!existsSync(filePath)) return fallback
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    return fallback
  }
}

function countLines(filePath) {
  if (!existsSync(filePath)) return 0
  const raw = readFileSync(filePath, 'utf8').trim()
  if (!raw) return 0
  return raw.split('\n').filter((l) => l.trim().length > 0).length
}

function atomicWriteFile(targetPath, content, mode = 0o600) {
  mkdirSync(dirname(targetPath), { recursive: true, mode: 0o700 })
  const tmpPath = `${targetPath}.${process.pid}.tmp`
  writeFileSync(tmpPath, content, { mode })
  renameSync(tmpPath, targetPath)
}

function detectPort(env) {
  const bind = env.AIA_BIND || '127.0.0.1'
  const port = env.AIA_PORT || '3000'
  return `http://${bind}:${port}`
}

export function generateRunbook(opts = {}) {
  const rootDir = opts.rootDir || here
  const env = opts.env || process.env
  const dataDir = opts.dataDir || env.AIA_DATA_DIR || join(rootDir, 'data')
  const keyDir = opts.keyDir || env.AIA_KEY_DIR || join(dataDir, '.keys')
  const keyringPath = opts.keyringPath || env.AIA_KEYRING_PATH || join(keyDir, 'keyring.json')
  const ledgerPath = opts.ledgerPath || env.AIA_LEDGER_PATH || join(dataDir, 'ledger.ndjson')
  const queuePath = opts.queuePath || env.AIA_QUEUE_PATH || join(dataDir, 'active_queue.json')
  const spoolPath = opts.spoolPath || env.AIA_SPOOL_PATH || join(dataDir, 'spool.ndjson')
  const deadletterPath =
    opts.deadletterPath || env.AIA_DEADLETTER_PATH || join(dataDir, 'spool.deadletter.ndjson')
  const archiveDir =
    opts.archiveDir || env.AIA_LEDGER_ARCHIVE_DIR || join(dataDir, 'ledger-archives')
  const backupDir = opts.backupDir || env.AIA_BACKUP_DIR || join(rootDir, 'backups')
  const packsDir = opts.packsDir || env.AIA_PACKS_DIR || join(rootDir, '..', 'packs')
  const daemonUrl = opts.daemonUrl || env.AIA_DAEMON_URL || detectPort(env)
  const ingestUrl = opts.ingestUrl || env.AIA_INGEST_URL || daemonUrl
  const outPath = resolve(opts.outPath || env.AIA_RUNBOOK_PATH || join(rootDir, 'RUNBOOK.md'))
  const generatedAt = opts.generatedAt || new Date().toISOString()

  let keyring = { activeKeyId: null, keys: [] }
  try {
    keyring = loadKeyring(keyDir)
  } catch {
    keyring = readJsonSafe(keyringPath, { activeKeyId: null, keys: [] })
  }

  const queueRaw = readJsonSafe(queuePath, [])
  const cards = Array.isArray(queueRaw)
    ? queueRaw
    : queueRaw && Array.isArray(queueRaw.cards)
      ? queueRaw.cards
      : []

  const ledgerEntries = countLines(ledgerPath)
  const spoolPending = countLines(spoolPath)
  const deadletterCount = countLines(deadletterPath)
  const activeKeys = Array.isArray(keyring.keys)
    ? keyring.keys.filter((k) => k && k.status === 'ACTIVE').length
    : 0
  const retiredKeys = Array.isArray(keyring.keys)
    ? keyring.keys.filter((k) => k && k.status === 'RETIRED').length
    : 0

  const candidateScripts = [
    'server.js',
    'webhookIngest.js',
    'keygen.js',
    'rotateKey.js',
    'verifyLedger.js',
    'verifyAllIntegrity.js',
    'exportAudit.js',
    'verifyAuditBundle.js',
    'statusSummary.js',
    'archiveLedgerWindow.js',
    'verifyLedgerSlice.js',
    'reconcileQueue.js',
    'flushSpool.js',
    'requeueDeadletter.js',
    'watchdog.js',
    'generateRunbook.js',
    'doctor.js',
    'replayPacks.js',
    'backup.sh',
    'restore.sh',
    'maintain.sh',
    'installService.sh',
    'releaseCheck.sh',
    'smoke.sh',
    'start.sh',
  ]
  const presentScripts = candidateScripts.filter((name) => existsSync(join(rootDir, name)))

  const md = `# AIA (Automate It Away) — Operator Runbook

Generated: ${generatedAt}

Secret-safe handover reference. This file never includes \`.env\` values, \`ed25519.pem\`, or webhook secrets.

## Active Endpoints & Paths

* **Daemon / Desk URL:** \`${daemonUrl}\`
* **Webhook Ingress (same daemon):** \`${ingestUrl}\` (\`/webhook/ghl|smarthq|telemetry\`)
* **Health probes:** \`${daemonUrl}/healthz\` · \`${daemonUrl}/readyz\`
* **Data Directory:** \`${dataDir}\`
* **Key Directory:** \`${keyDir}\`
* **Keyring Path:** \`${keyringPath}\` (Active Key ID: \`${keyring.activeKeyId || 'none'}\`; ${activeKeys} active / ${retiredKeys} retired)
* **Packs Directory:** \`${packsDir}\`
* **Queue Path:** \`${queuePath}\` (\`${cards.length}\` card(s) currently tracked on disk)
* **Ledger Path:** \`${ledgerPath}\` (\`${ledgerEntries}\` entry line(s))
* **Spool / Dead-Letter:** \`${spoolPath}\` (\`${spoolPending}\` pending) / \`${deadletterPath}\` (\`${deadletterCount}\` quarantined)
* **Ledger Archives / Cold Backups:** \`${archiveDir}\` / \`${backupDir}\`

## Detected Workspace Scripts

${presentScripts.map((s) => `* \`${s}\``).join('\n')}

## Standard Operational Commands

* **Pre-release gate:** \`./releaseCheck.sh --strict-keyring\` (or \`make release RELEASE_FLAGS=--quick\`)
* **Status snapshot:** \`node statusSummary.js\` / \`make status\`
* **Full integrity check:** \`node verifyAllIntegrity.js\` / \`make verify-all\`
* **Drain spool & quarantine bad payloads:** \`node flushSpool.js --quarantine-invalid\`
* **Inspect / requeue dead-letter items:** \`node requeueDeadletter.js --inspect\` then \`node requeueDeadletter.js --limit 10\`
* **Reconcile queue with ledger:** \`node reconcileQueue.js --dry-run\` then \`node reconcileQueue.js\`
* **Archive old ledger entries:** \`node archiveLedgerWindow.js --keep-last 1000 --dry-run\` then \`node archiveLedgerWindow.js --keep-last 1000\`
* **Verify archived ledger slice:** \`node verifyLedgerSlice.js <slice.ndjson>\`
* **Export & verify audit bundle:** \`node exportAudit.js\` then \`node verifyAuditBundle.js <bundle.json>\`
* **Cold backup & restore:** \`./backup.sh\` and \`./restore.sh <archive.tar.gz>\`
* **Housekeeping & log trim:** \`./maintain.sh\` (\`--dry-run\` supported)
* **Service unit preview/install:** \`./installService.sh --dry-run\` then \`./installService.sh --enable\`
* **Health watchdog:** \`node watchdog.js --dry-run\`
* **Regenerate this runbook:** \`node generateRunbook.js\` / \`make runbook\`

## Security Note

Never commit or copy \`ed25519.pem\`, retired private key copies, or \`.env\` secrets into shared runbooks or audit bundles. Keep \`data/\` and \`data/.keys/\` at \`0700\` and sensitive state files at \`0600\`. HITL actions still require explicit human confirmation before signing.
`

  if (!opts.dryRun) {
    atomicWriteFile(outPath, md, 0o600)
  }

  return {
    written: !opts.dryRun,
    dryRun: Boolean(opts.dryRun),
    outputPath: outPath,
    markdown: opts.includeMarkdown ? md : undefined,
    detectedScripts: presentScripts.length,
    scripts: presentScripts,
    activeKeyId: keyring.activeKeyId || null,
    ledgerEntries,
    queueCards: cards.length,
    spoolPending,
    deadletterCount,
    daemonUrl,
    ingestUrl,
  }
}

function isMain() {
  const entry = process.argv[1]
  if (!entry) return false
  return fileURLToPath(import.meta.url) === resolve(entry)
}

if (isMain()) {
  try {
    const cli = parseArgs(process.argv.slice(2))
    const report = generateRunbook({ outPath: cli.outPath })
    console.log(
      JSON.stringify(
        {
          written: report.written,
          outputPath: report.outputPath,
          detectedScripts: report.detectedScripts,
          activeKeyId: report.activeKeyId,
          ledgerEntries: report.ledgerEntries,
          queueCards: report.queueCards,
        },
        null,
        2,
      ),
    )
  } catch (err) {
    console.error(err.message || err)
    process.exit(1)
  }
}
