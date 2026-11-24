#!/usr/bin/env node
'use strict'
require("./_env-guard");

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.join(__dirname, '..')
const command = path.join(root, 'command')

function fail(msg) {
  console.error('check-aia-command: ' + msg)
  process.exit(1)
}

function mustExist(rel) {
  if (!fs.existsSync(path.join(command, rel))) fail('missing ' + rel)
}

;[
  'package.json',
  'Makefile',
  'README.md',
  'server.js',
  'webhookIngest.js',
  'grokBotPrompt.js',
  'verifyLedger.js',
  'doctor.js',
  'keygen.js',
  'rotateKey.js',
  'exportAudit.js',
  'verifyAuditBundle.js',
  'statusSummary.js',
  'archiveLedgerWindow.js',
  'verifyLedgerSlice.js',
  'reconcileQueue.js',
  'flushSpool.js',
  'requeueDeadletter.js',
  'watchdog.js',
  'verifyAllIntegrity.js',
  'replayPacks.js',
  'deploySwarm.js',
  'bridgeModule.js',
  'ecosystem.config.cjs',
  'start.sh',
  'smoke.sh',
  'releaseCheck.sh',
  'backup.sh',
  'restore.sh',
  'maintain.sh',
  'installService.sh',
  '.env.example',
  'public/index.html',
  'lib/decisionCard.js',
  'lib/appliance.js',
].forEach(mustExist)

const server = fs.readFileSync(path.join(command, 'server.js'), 'utf8')
;['confirm', 'ed25519', 'ledger.ndjson', 'dry-run', 'createCommandCenter'].forEach((bit) => {
  if (server.indexOf(bit) < 0 && bit !== 'ed25519') {
    /* ed25519 lives in lib/keys.js; the router must still mention the ledger gate */
  }
  if (bit !== 'ed25519' && server.indexOf(bit) < 0) fail('server.js missing ' + bit)
})

const keys = fs.readFileSync(path.join(command, 'lib', 'keys.js'), 'utf8')
;['ed25519', 'signCanonical', 'verifyCanonical', 'rotateKeypair', 'keyring.json'].forEach((bit) => {
  if (keys.indexOf(bit) < 0) fail('lib/keys.js missing ' + bit)
})

const ledger = fs.readFileSync(path.join(command, 'lib', 'ledger.js'), 'utf8')
;[
  'ledger',
  'entryHash',
  'appendFileSync',
  'buildTrustedKeyMap',
  'trusted keyring',
  'ledger.anchor.json',
  'writeLedgerAnchor',
  'expectedNextSeq',
].forEach((bit) => {
  if (ledger.indexOf(bit) < 0) fail('lib/ledger.js missing ' + bit)
})
if (ledger.indexOf('sha256') < 0 && ledger.indexOf('payloadHash') < 0) fail('ledger missing hash proof')

const desk = fs.readFileSync(path.join(command, 'public', 'index.html'), 'utf8')
;[
  'bg-desk-900',
  'keydown',
  'enterSimulation',
  'localhost:3000',
  'YES: AUTHORIZE',
  'card-next',
  'nextRecommendation',
].forEach((bit) => {
  if (desk.indexOf(bit) < 0) fail('public/index.html missing ' + bit)
})

const decisionCard = fs.readFileSync(path.join(command, 'lib', 'decisionCard.js'), 'utf8')
;[
  'toUniversalDecisionCard',
  'normalizeDecisionPayload',
  'metaPromptToString',
  'nextRecommendation',
].forEach((bit) => {
  if (decisionCard.indexOf(bit) < 0) fail('lib/decisionCard.js missing ' + bit)
})

const webhook = fs.readFileSync(path.join(command, 'webhookIngest.js'), 'utf8')
;[
  'buildDecisionPayload',
  'normalizeDecisionPayload',
  'nextRecommendation',
  'normalizeApplianceTelemetry',
].forEach((bit) => {
  if (webhook.indexOf(bit) < 0) fail('webhookIngest.js missing ' + bit)
})

const bridge = fs.readFileSync(path.join(command, 'bridgeModule.js'), 'utf8')
;['adaptPackEvent', 'buildBridgePayload', 'normalizeDecisionPayload'].forEach((bit) => {
  if (bridge.indexOf(bit) < 0) fail('bridgeModule.js missing ' + bit)
})

const rules = fs.readFileSync(path.join(root, '.cursorrules'), 'utf8')
if (rules.indexOf('Standardized Decision Payload Format') < 0) {
  fail('.cursorrules missing Integration Pack & Webhook Standards')
}
if (rules.indexOf('Local IoT & Appliance Automation Standards') < 0) {
  fail('.cursorrules missing Local IoT & Appliance Automation Standards')
}
;[
  'Local-First & Offline Resilience',
  'Appliance Telemetry Normalization',
  'Human-in-the-Loop Oversight for Physical Actions',
  'normalizeApplianceTelemetry',
  'riskForPhysicalAction',
  'enqueueDeviceRetry',
].forEach((bit) => {
  if (rules.indexOf(bit) < 0) fail('.cursorrules appliance standards missing ' + bit)
})

const appliance = fs.readFileSync(path.join(command, 'lib', 'appliance.js'), 'utf8')
;[
  'normalizeApplianceTelemetry',
  'preferLocalEndpoint',
  'riskForPhysicalAction',
  'DeviceConnectionManager',
  'enqueueDeviceRetry',
  'energyRate',
  'savingsEstimated',
  'mountAppliance',
].forEach((bit) => {
  if (appliance.indexOf(bit) < 0) fail('lib/appliance.js missing ' + bit)
})

const start = fs.readFileSync(path.join(command, 'start.sh'), 'utf8')
if (start.indexOf('doctor.js') < 0 || start.indexOf('server.js') < 0) fail('start.sh must run doctor and the daemon')

const pkg = JSON.parse(fs.readFileSync(path.join(command, 'package.json'), 'utf8'))
if (!pkg.dependencies || !pkg.dependencies.express) fail('package.json missing express')
;[
  'keygen',
  'rotate',
  'doctor',
  'verify',
  'replay',
  'export',
  'verify-audit',
  'status',
  'archive',
  'verify-slice',
  'reconcile',
  'flush',
  'requeue',
  'watchdog',
  'verify-all',
  'smoke',
  'release',
  'start',
  'backup',
  'restore',
  'maintain',
  'install-service',
  'test',
].forEach((script) => {
  if (!pkg.scripts || !pkg.scripts[script]) fail('package.json missing script ' + script)
})
const depNames = Object.keys(Object.assign({}, pkg.dependencies, pkg.devDependencies))
;['ethers', 'viem', 'wagmi', 'react', 'vue', 'vite'].forEach((name) => {
  if (depNames.indexOf(name) >= 0) fail('unexpected dependency ' + name)
})

const makefile = fs.readFileSync(path.join(command, 'Makefile'), 'utf8')
;[
  'keygen:',
  'rotate:',
  'doctor:',
  'verify:',
  'replay:',
  'export:',
  'verify-audit:',
  'status:',
  'archive:',
  'verify-slice:',
  'reconcile:',
  'flush:',
  'requeue:',
  'watchdog:',
  'verify-all:',
  'smoke:',
  'release:',
  'start:',
  'backup:',
  'restore:',
  'maintain:',
  'install-service:',
].forEach((target) => {
  if (makefile.indexOf(target) < 0) fail('Makefile missing target ' + target)
})

const readme = fs.readFileSync(path.join(command, 'README.md'), 'utf8')
;[
  'HITL',
  'ledger.ndjson',
  'make keygen',
  'make rotate',
  'make export',
  'make verify-audit',
  'make status',
  'make archive',
  'make verify-slice',
  'make reconcile',
  'make flush',
  'make requeue',
  'make watchdog',
  'make verify-all',
  'make restore',
  'make backup',
  'make maintain',
  'make install-service',
  'AIA_LOG_MAX_LINES',
  'installService.sh',
  'make release',
  'make smoke',
  '127.0.0.1:3000',
  'Ed25519',
  'keyring.json',
  'exportAudit.js',
  'verifyAuditBundle.js',
  'statusSummary.js',
  'archiveLedgerWindow.js',
  'verifyLedgerSlice.js',
  'reconcileQueue.js',
  'flushSpool.js',
  'requeueDeadletter.js',
  'watchdog.js',
  'verifyAllIntegrity.js',
  'restore.sh',
  'aia-state-',
  'spool.deadletter.ndjson',
  '/healthz',
  '/readyz',
  'ledger.anchor.json',
].forEach((bit) => {
  if (readme.indexOf(bit) < 0) fail('README.md missing ' + bit)
})

const flushSpool = fs.readFileSync(path.join(command, 'flushSpool.js'), 'utf8')
;[
  'flushSpool',
  'spool.ndjson',
  'spool.deadletter.ndjson',
  '--dry-run',
  '--quarantine-invalid',
  'MALFORMED_JSON',
  'X-AIA-Signature',
].forEach((bit) => {
  if (flushSpool.indexOf(bit) < 0) fail('flushSpool.js missing ' + bit)
})

const requeueDeadletter = fs.readFileSync(path.join(command, 'requeueDeadletter.js'), 'utf8')
;[
  'requeueDeadletter',
  'extractRecoverablePayload',
  '--inspect',
  '--send',
  '--reason',
  '--limit',
  'spool.deadletter.ndjson',
].forEach((bit) => {
  if (requeueDeadletter.indexOf(bit) < 0) fail('requeueDeadletter.js missing ' + bit)
})

const watchdog = fs.readFileSync(path.join(command, 'watchdog.js'), 'utf8')
;[
  'runWatchdog',
  '/healthz',
  '/readyz',
  '--restart-cmd',
  '--dry-run',
  '--no-ingest',
  'AIA_WATCHDOG_RESTART_CMD',
].forEach((bit) => {
  if (watchdog.indexOf(bit) < 0) fail('watchdog.js missing ' + bit)
})
if (server.indexOf('/healthz') < 0 || server.indexOf('/readyz') < 0) {
  fail('server.js missing /healthz or /readyz probe routes')
}

const verifyAll = fs.readFileSync(path.join(command, 'verifyAllIntegrity.js'), 'utf8')
;[
  'verifyAllIntegrity',
  '--bundle',
  'reconcileQueue',
  'verifyLedgerFile',
  'verifyAuditBundleFile',
  'buildStatusSummary',
  'dryRun: true',
].forEach((bit) => {
  if (verifyAll.indexOf(bit) < 0) fail('verifyAllIntegrity.js missing ' + bit)
})

const exportAudit = fs.readFileSync(path.join(command, 'exportAudit.js'), 'utf8')
;[
  'bundleSha256',
  'buildAuditBundle',
  'publicKeyPem',
  '--card',
  'Never copies',
  'private material',
].forEach((bit) => {
  if (exportAudit.indexOf(bit) < 0) fail('exportAudit.js missing ' + bit)
})

const verifyAudit = fs.readFileSync(path.join(command, 'verifyAuditBundle.js'), 'utf8')
;['verifyAuditBundle', 'bundleSha256', 'entryHash', 'Ed25519', 'process.exit'].forEach((bit) => {
  if (verifyAudit.indexOf(bit) < 0) fail('verifyAuditBundle.js missing ' + bit)
})

;['smoke.sh', 'releaseCheck.sh', 'backup.sh', 'restore.sh', 'maintain.sh', 'installService.sh', 'start.sh'].forEach((name) => {
  try {
    fs.accessSync(path.join(command, name), fs.constants.X_OK)
  } catch {
    fail(name + ' must be executable')
  }
})

const backupSh = fs.readFileSync(path.join(command, 'backup.sh'), 'utf8')
;[
  'aia-state-',
  '.sha256',
  'AIA_BACKUP_DIR',
  'PACKS_DIR',
  'sha256sum',
].forEach((bit) => {
  if (backupSh.indexOf(bit) < 0) fail('backup.sh missing ' + bit)
})

const restoreSh = fs.readFileSync(path.join(command, 'restore.sh'), 'utf8')
;[
  '--dry-run',
  'pre-restore-',
  'verifyAllIntegrity.js',
  '.sha256',
  'Checksum verification failed',
].forEach((bit) => {
  if (restoreSh.indexOf(bit) < 0) fail('restore.sh missing ' + bit)
})

const maintainSh = fs.readFileSync(path.join(command, 'maintain.sh'), 'utf8')
;[
  '--dry-run',
  'AIA_TMP_MAX_AGE_MIN',
  'AIA_LOG_MAX_LINES',
  'verifyAllIntegrity.js',
  'chmod 700',
  'chmod 600',
  '*.tmp',
].forEach((bit) => {
  if (maintainSh.indexOf(bit) < 0) fail('maintain.sh missing ' + bit)
})

const installServiceSh = fs.readFileSync(path.join(command, 'installService.sh'), 'utf8')
;[
  '--dry-run',
  '--enable',
  '--ingest',
  'server.js',
  'systemd',
  'launchd',
  'Restart=on-failure',
].forEach((bit) => {
  if (installServiceSh.indexOf(bit) < 0) fail('installService.sh missing ' + bit)
})

if (!fs.existsSync(path.join(command, 'node_modules', 'express'))) {
  const install = spawnSync('npm', ['install'], { cwd: command, encoding: 'utf8' })
  if (install.status !== 0) fail('npm install failed: ' + (install.stderr || install.stdout))
}

const shortcuts = spawnSync('make', ['-n', 'help'], { cwd: command, encoding: 'utf8' })
if (shortcuts.status !== 0) fail('make help failed:\n' + (shortcuts.stderr || shortcuts.stdout))

const test = spawnSync('npm', ['test'], { cwd: command, encoding: 'utf8' })
if (test.status !== 0) fail('command tests failed:\n' + (test.stdout || '') + (test.stderr || ''))

console.log('check-aia-command: ok')
