#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.join(__dirname, '..')
const runtime = path.join(root, 'runtime')

function fail(msg) {
  console.error('check-aia-runtime: ' + msg)
  process.exit(1)
}

function mustExist(rel) {
  const p = path.join(runtime, rel)
  if (!fs.existsSync(p)) fail('missing ' + rel)
}

;[
  'package.json',
  'src/db.ts',
  'src/crypto.ts',
  'src/ledger.ts',
  'src/promptSynthesizer.ts',
  'src/recommendationEngine.ts',
  'src/sandboxManager.ts',
  'src/sandboxWorker.ts',
  'src/sandboxWorkerEntry.js',
  'src/server.ts',
  'src/ghl.ts',
  'src/types.ts',
  'src/data/card_ui.json',
  'public/index.html',
  'agents/sample-ghl/logic.js',
  'test/runtime.test.ts',
  'verifyLedger.js',
  'doctor.js',
  'start.sh',
].forEach(mustExist)

const terminal = fs.readFileSync(path.join(runtime, 'public/index.html'), 'utf8')
;[
  'SIMULATE GHL WEBHOOK',
  '/webhook/ghl',
  '/queue/',
  '/api/sign',
  'AUTHORIZE & SIGN',
  'Active Decision Queue',
  'LEDGER',
  'Visual Audit Receipt',
  'Meta-Prompt Synthesis',
  'toggleSimulation',
  'EventSource',
  'WebSocket',
  'critical-glow',
].forEach((bit) => {
  if (terminal.indexOf(bit) < 0) fail('public/index.html missing ' + bit)
})

const db = fs.readFileSync(path.join(runtime, 'src/db.ts'), 'utf8')
;['vault', 'queue', 'provenance_ledger', 'aes-256-gcm', 'aia_vault.db'].forEach((bit) => {
  if (db.indexOf(bit) < 0) fail('db.ts missing ' + bit)
})

const cryptoSrc = fs.readFileSync(path.join(runtime, 'src/crypto.ts'), 'utf8')
;['ed25519', 'canonicalJson', 'signCanonical', 'verifyCanonical', 'private_key.pem', 'public_key.pem'].forEach((bit) => {
  if (cryptoSrc.indexOf(bit) < 0) fail('crypto.ts missing ' + bit)
})

const ledgerSrc = fs.readFileSync(path.join(runtime, 'src/ledger.ts'), 'utf8')
;['ledger.ndjson', 'appendLedgerEntry', 'signLedgerTransaction', 'verifyLedgerEntries', 'diffData'].forEach((bit) => {
  if (ledgerSrc.indexOf(bit) < 0) fail('ledger.ts missing ' + bit)
})

const verifyLedger = fs.readFileSync(path.join(runtime, 'verifyLedger.js'), 'utf8')
;['[PASS]', '[FAIL]', 'createHash', 'cryptoVerify', 'public_key.pem'].forEach((bit) => {
  if (verifyLedger.indexOf(bit) < 0) fail('verifyLedger.js missing ' + bit)
})

const doctor = fs.readFileSync(path.join(runtime, 'doctor.js'), 'utf8')
;['[PASS]', '[FAIL]', 'private_key.pem', 'ledger.ndjson', 'ed25519'].forEach((bit) => {
  if (doctor.indexOf(bit) < 0) fail('doctor.js missing ' + bit)
})

const synth = fs.readFileSync(path.join(runtime, 'src/promptSynthesizer.ts'), 'utf8')
;['synthesizeMetaPrompt', 'compileTemplate', 'PROMPT_TEMPLATES', 'selectTemplate'].forEach((bit) => {
  if (synth.indexOf(bit) < 0) fail('promptSynthesizer.ts missing ' + bit)
})

const rec = fs.readFileSync(path.join(runtime, 'src/recommendationEngine.ts'), 'utf8')
;['recommendNextActions', 'enqueueRecommendations', 'source: \'recommendation\''].forEach((bit) => {
  if (rec.indexOf(bit) < 0) fail('recommendationEngine.ts missing ' + bit)
})

const sandboxProto = fs.readFileSync(path.join(runtime, 'src/sandboxWorker.ts'), 'utf8')
;['requiresAuthorization', 'packageSensitiveRequest', 'isSensitiveUrl', 'Active Decision'].forEach((bit) => {
  if (sandboxProto.indexOf(bit) < 0) fail('sandboxWorker.ts missing ' + bit)
})

const sandbox = fs.readFileSync(path.join(runtime, 'src/sandboxManager.ts'), 'utf8')
;['Worker', 'enqueueCard', 'waitForResolution', 'card_ui', 'buildWorkerContext'].forEach((bit) => {
  if (sandbox.indexOf(bit) < 0) fail('sandboxManager.ts missing ' + bit)
})

const server = fs.readFileSync(path.join(runtime, 'src/server.ts'), 'utf8')
;[
  '/webhook/ghl',
  '3847',
  'authorize',
  'leadconnectorhq',
  'appendProvenance',
  'appendLedgerEntry',
  'synthesizeMetaPrompt',
  'enqueueRecommendations',
  '/api/sign',
  '/api/stream',
  '/ws',
  'WebSocketServer',
  'broadcast',
].forEach((bit) => {
  if (server.indexOf(bit) < 0) fail('server.ts missing ' + bit)
})

const pkg = JSON.parse(fs.readFileSync(path.join(runtime, 'package.json'), 'utf8'))
if (!pkg.dependencies || !pkg.dependencies.ws) fail('package.json missing ws dependency')

if (!fs.existsSync(path.join(runtime, 'node_modules'))) {
  const install = spawnSync('npm', ['install'], { cwd: runtime, encoding: 'utf8' })
  if (install.status !== 0) fail('npm install failed: ' + (install.stderr || install.stdout))
}

const test = spawnSync('npm', ['test'], { cwd: runtime, encoding: 'utf8' })
if (test.status !== 0) fail('runtime tests failed:\n' + (test.stdout || '') + (test.stderr || ''))

const build = spawnSync('npm', ['run', 'build'], { cwd: runtime, encoding: 'utf8' })
if (build.status !== 0) fail('runtime build failed:\n' + (build.stderr || build.stdout))

if (!fs.existsSync(path.join(runtime, 'dist', 'ledger.js'))) {
  fail('build did not emit ledger.js')
}
if (!fs.existsSync(path.join(runtime, 'dist', 'sandboxWorkerEntry.js'))) {
  fail('build did not copy sandboxWorkerEntry.js')
}
if (!fs.existsSync(path.join(runtime, 'dist', 'promptSynthesizer.js'))) {
  fail('build did not emit promptSynthesizer.js')
}
if (!fs.existsSync(path.join(runtime, 'dist', 'recommendationEngine.js'))) {
  fail('build did not emit recommendationEngine.js')
}
if (!fs.existsSync(path.join(runtime, 'dist', 'sandboxWorker.js'))) {
  fail('build did not emit sandboxWorker.js')
}

console.log('check-aia-runtime: ok')
