#!/usr/bin/env node
'use strict'
require("./_env-guard");

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.join(__dirname, '..')
const runtime = path.join(root, 'runtime')

let failed = 0
function fail(msg) {
  failed += 1
  console.error('FAIL ' + msg)
}
function pass(msg) {
  console.log('ok  ' + msg)
}
function mustExist(rel) {
  const p = path.join(runtime, rel)
  if (!fs.existsSync(p)) fail('missing ' + rel)
  else pass('exists ' + rel)
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
  'src/appliance.ts',
  'src/types.ts',
  'src/data/card_ui.json',
  'public/index.html',
  'agents/sample-ghl/logic.js',
  'test/runtime.test.ts',
  'verifyLedger.js',
  'doctor.js',
  'start.sh',
].forEach(mustExist)

function readRuntime(rel) {
  return fs.readFileSync(path.join(runtime, rel), 'utf8')
}

const terminal = readRuntime('public/index.html')
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
  else pass('public/index.html has ' + bit)
})

const db = readRuntime('src/db.ts')
;['vault', 'queue', 'provenance_ledger', 'aes-256-gcm', 'aia_vault.db'].forEach((bit) => {
  if (db.indexOf(bit) < 0) fail('db.ts missing ' + bit)
  else pass('db.ts has ' + bit)
})

const cryptoSrc = readRuntime('src/crypto.ts')
;['ed25519', 'canonicalJson', 'signCanonical', 'verifyCanonical', 'private_key.pem', 'public_key.pem'].forEach((bit) => {
  if (cryptoSrc.indexOf(bit) < 0) fail('crypto.ts missing ' + bit)
  else pass('crypto.ts has ' + bit)
})

const ledgerSrc = readRuntime('src/ledger.ts')
;['ledger.ndjson', 'appendLedgerEntry', 'signLedgerTransaction', 'verifyLedgerEntries', 'diffData'].forEach((bit) => {
  if (ledgerSrc.indexOf(bit) < 0) fail('ledger.ts missing ' + bit)
  else pass('ledger.ts has ' + bit)
})

const verifyLedger = readRuntime('verifyLedger.js')
;['[PASS]', '[FAIL]', 'createHash', 'cryptoVerify', 'public_key.pem'].forEach((bit) => {
  if (verifyLedger.indexOf(bit) < 0) fail('verifyLedger.js missing ' + bit)
  else pass('verifyLedger.js has ' + bit)
})

const doctor = readRuntime('doctor.js')
;['[PASS]', '[FAIL]', 'private_key.pem', 'ledger.ndjson', 'ed25519'].forEach((bit) => {
  if (doctor.indexOf(bit) < 0) fail('doctor.js missing ' + bit)
  else pass('doctor.js has ' + bit)
})

const synth = readRuntime('src/promptSynthesizer.ts')
;['synthesizeMetaPrompt', 'compileTemplate', 'PROMPT_TEMPLATES', 'selectTemplate'].forEach((bit) => {
  if (synth.indexOf(bit) < 0) fail('promptSynthesizer.ts missing ' + bit)
  else pass('promptSynthesizer.ts has ' + bit)
})

const rec = readRuntime('src/recommendationEngine.ts')
;['recommendNextActions', 'enqueueRecommendations', "source: 'recommendation'"].forEach((bit) => {
  if (rec.indexOf(bit) < 0) fail('recommendationEngine.ts missing ' + bit)
  else pass('recommendationEngine.ts has ' + bit)
})

const sandboxProto = readRuntime('src/sandboxWorker.ts')
;['requiresAuthorization', 'packageSensitiveRequest', 'isSensitiveUrl', 'Active Decision'].forEach((bit) => {
  if (sandboxProto.indexOf(bit) < 0) fail('sandboxWorker.ts missing ' + bit)
  else pass('sandboxWorker.ts has ' + bit)
})

const sandbox = readRuntime('src/sandboxManager.ts')
;['Worker', 'enqueueCard', 'waitForResolution', 'card_ui', 'buildWorkerContext'].forEach((bit) => {
  if (sandbox.indexOf(bit) < 0) fail('sandboxManager.ts missing ' + bit)
  else pass('sandboxManager.ts has ' + bit)
})

const server = readRuntime('src/server.ts')
;[
  '/webhook/ghl',
  '/webhook/smarthq',
  '/api/appliance/action',
  '/api/appliance/connection-drop',
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
  'cardFromApplianceEvent',
  'DeviceConnectionManager',
].forEach((bit) => {
  if (server.indexOf(bit) < 0) fail('server.ts missing ' + bit)
  else pass('server.ts has ' + bit)
})

const applianceSrc = readRuntime('src/appliance.ts')
;[
  'normalizeApplianceTelemetry',
  'preferLocalEndpoint',
  'riskForPhysicalAction',
  'DeviceConnectionManager',
  'enqueueDeviceRetry',
  'energyRate',
  'savingsEstimated',
].forEach((bit) => {
  if (applianceSrc.indexOf(bit) < 0) fail('appliance.ts missing ' + bit)
  else pass('appliance.ts has ' + bit)
})

const pkg = JSON.parse(readRuntime('package.json'))
if (!pkg.dependencies || !pkg.dependencies.ws) fail('package.json missing ws dependency')
else pass('package.json has ws')

function sliceBetween(hay, start, end) {
  const a = hay.indexOf(start)
  const b = hay.indexOf(end, a + 1)
  if (a < 0) return ''
  return b > a ? hay.slice(a, b) : hay.slice(a)
}

function unique(list) {
  const out = []
  list.forEach(function (item) { if (out.indexOf(item) < 0) out.push(item) })
  return out
}

function autoAuthorize(src) {
  return /authorizeCard\s*\(/.test(src) || /dispatchToGhl\s*\(/.test(src) || /\.signSelected\s*\(/.test(src)
}

function buildFaults(files) {
  const bad = []
  if (files.html.indexOf('YES: AUTHORIZE & SIGN') < 0 || files.html.indexOf('Active Decision Queue') < 0) {
    bad.push('Runtime queue YES copy gone')
  }
  if (
    files.html.indexOf('app.signSelected()') < 0 ||
    files.html.indexOf('/api/sign') < 0 ||
    files.server.indexOf("app.post('/api/sign'") < 0 ||
    files.server.indexOf("app.post('/queue/:cardId/authorize'") < 0
  ) {
    bad.push('Runtime authorize path gone')
  }
  const ghl = sliceBetween(files.server, "app.post('/webhook/ghl'", "app.post('/webhook/smarthq'")
  const smart = sliceBetween(files.server, "app.post('/webhook/smarthq'", "app.get('/api/appliance/devices'")
  const action = sliceBetween(files.server, "app.post('/api/appliance/action'", "app.post('/api/appliance/connection-drop'")
  // Enter on a selected card is the human Yes (the button label is YES: AUTHORIZE & SIGN [ENTER]).
  const htmlSansEnter = files.html.replace(/window\.addEventListener\(\s*['"]keydown['"][\s\S]*?\n\s*\}\);/, '')
  const init = sliceBetween(htmlSansEnter, 'init() {', 'applySimUi()')
  const connect = sliceBetween(htmlSansEnter, 'connectLive() {', 'async onRealtime')
  const boot = sliceBetween(htmlSansEnter, 'bootSimulation(fresh)', 'connectLive()')
  const ctor = sliceBetween(htmlSansEnter, 'constructor() {', 'init() {')
  if (
    autoAuthorize(ghl) ||
    autoAuthorize(smart) ||
    autoAuthorize(action) ||
    /\.signSelected\s*\(/.test(init) ||
    /\.signSelected\s*\(/.test(connect) ||
    /\.signSelected\s*\(/.test(boot) ||
    /\.signSelected\s*\(/.test(ctor) ||
    /app\.get\(\s*['"]\/api\/sign['"]/.test(files.server)
  ) {
    bad.push('sign or authorize without a human Yes')
  }
  if (
    /charged\s*:\s*true/.test(files.server) ||
    /charged\s*:\s*true/.test(files.html) ||
    /action\s*:\s*['"]payout['"]/.test(files.server) ||
    /action\s*:\s*['"]withdraw['"]/.test(files.server)
  ) {
    bad.push('charge or payout without Yes')
  }
  return unique(bad)
}

function applyMutant(kind, files) {
  const next = { html: files.html, server: files.server }
  if (kind === 'Runtime queue YES copy gone') {
    next.html = next.html
      .replace(/YES: AUTHORIZE & SIGN/g, 'RUN NOW')
      .replace(/Active Decision Queue/g, 'Silent queue')
  } else if (kind === 'Runtime authorize path gone') {
    next.html = next.html
      .replace(/app\.signSelected\(\)/g, 'app.refresh(false)')
      .replace(/\/api\/sign/g, '/api/gone-sign')
    next.server = next.server
      .replace(/app\.post\('\/api\/sign'/g, "app.post('/api/gone-sign'")
      .replace(/app\.post\('\/queue\/:cardId\/authorize'/g, "app.post('/queue/:cardId/gone-authorize'")
  } else if (kind === 'sign or authorize without a human Yes') {
    next.server = next.server.replace(
      "const card = vault.enqueueCard(synthesized.decisionPayload)",
      "const card = vault.enqueueCard(synthesized.decisionPayload); await authorizeCard(card.cardId, res)"
    )
    next.html = next.html.replace(
      'this.applySimUi();',
      'this.applySimUi(); this.signSelected();'
    )
  } else if (kind === 'charge or payout without Yes') {
    next.server = next.server + '\ncharged: true\n{ action: "payout" }\n'
  }
  return next
}

if (server.indexOf('Paused for human authorization in the local queue') < 0) {
  fail('GHL webhook must pause for human authorization')
} else pass('GHL webhook pauses for human authorization')
if (server.indexOf('Paused for human authorization — appliance bridge does not auto-actuate') < 0) {
  fail('SmartHQ webhook must not auto-actuate')
} else pass('SmartHQ webhook does not auto-actuate')
if (server.indexOf('executed: false') < 0 && server.indexOf('executed:false') < 0) {
  fail('appliance routes must leave executed false until Yes')
} else pass('appliance routes leave executed false until Yes')

const files = { html: terminal, server: server }
const live = buildFaults(files)
if (live.length) fail('runtime honesty drifted: ' + live.join('; '))
else pass('runtime queue YES, authorize path, and no silent sign/charge still hold')

const mutants = [
  'Runtime queue YES copy gone',
  'Runtime authorize path gone',
  'sign or authorize without a human Yes',
  'charge or payout without Yes',
]
let caught = 0
mutants.forEach(function (kind) {
  const faults = buildFaults(applyMutant(kind, files))
  if (faults.indexOf(kind) < 0) fail('mutant missed: ' + kind + ' (got ' + JSON.stringify(faults) + ')')
  else { caught += 1; pass('mutant caught: ' + kind) }
})
if (caught !== mutants.length) fail('honesty mutants: ' + caught + '/' + mutants.length + ' caught')
else pass('honesty mutants: ' + caught + '/' + mutants.length + ' caught')

function sqliteBindingReady() {
  const dir = path.join(runtime, 'node_modules', 'better-sqlite3')
  if (!fs.existsSync(dir)) return false
  function walk(d, n) {
    if (n > 8) return false
    let names
    try { names = fs.readdirSync(d) } catch (e) { return false }
    for (let i = 0; i < names.length; i++) {
      const pth = path.join(d, names[i])
      let st
      try { st = fs.statSync(pth) } catch (e) { continue }
      if (st.isDirectory() && walk(pth, n + 1)) return true
      if (/\.node$/.test(names[i])) return true
    }
    return false
  }
  return walk(dir, 0)
}

const SKIP_LINE = "SKIPPED runtime tests because there's no compiled better-sqlite3"

function runtimeSuiteDecision(bindingReady, testStatus, buildStatus) {
  if (!bindingReady) {
    return { skipLines: [SKIP_LINE], passMessages: [], failKeys: [] }
  }
  const passMessages = []
  const failKeys = []
  if (testStatus !== 0) failKeys.push('test')
  else passMessages.push('runtime unit tests passed')
  if (buildStatus !== 0) failKeys.push('build')
  else passMessages.push('runtime build passed')
  return { skipLines: [], passMessages: passMessages, failKeys: failKeys }
}

function applyRuntimeSuiteMutant(kind, decide) {
  return function (bindingReady, testStatus, buildStatus) {
    const d = decide(bindingReady, testStatus, buildStatus)
    if (kind === 'silent skip (no line)') {
      if (!bindingReady) return { skipLines: [], passMessages: [], failKeys: [] }
    } else if (kind === 'skip counted as pass') {
      if (!bindingReady) return { skipLines: [], passMessages: ['runtime unit tests passed'], failKeys: [] }
    } else if (kind === 'failing runtime test swallowed when the binding is present') {
      if (bindingReady && testStatus !== 0) {
        return {
          skipLines: d.skipLines,
          passMessages: d.passMessages.concat(['runtime unit tests passed']),
          failKeys: d.failKeys.filter(function (k) { return k !== 'test' }),
        }
      }
    }
    return d
  }
}

function runtimeSuitePolicyFaults(decide) {
  const bad = []
  const skip = decide(false, null, null)
  const skipText = (skip.skipLines || []).join('\n')
  if (skipText.indexOf('SKIPPED') < 0 || skipText.indexOf('runtime tests') < 0 || skipText.indexOf('no compiled better-sqlite3') < 0) {
    bad.push('silent skip (no line)')
  }
  const skipPass = (skip.passMessages || []).some(function (m) {
    return /runtime (unit tests|build) passed/.test(m)
  })
  if (skipPass || /\bPASSED\b/.test(skipText) || /ok  runtime (unit tests|build) passed/.test(skipText)) {
    bad.push('skip counted as pass')
  }
  const failedTest = decide(true, 1, 0)
  if (!failedTest.failKeys || failedTest.failKeys.indexOf('test') < 0) {
    bad.push('failing runtime test swallowed when the binding is present')
  }
  return unique(bad)
}

const policyMutants = [
  'silent skip (no line)',
  'skip counted as pass',
  'failing runtime test swallowed when the binding is present',
]
let policyCaught = 0
if (runtimeSuitePolicyFaults(runtimeSuiteDecision).length) {
  fail('runtime suite policy drifted: ' + runtimeSuitePolicyFaults(runtimeSuiteDecision).join('; '))
} else pass('runtime suite skip is SKIPPED, not a pass, and a present binding still fails a broken test')
policyMutants.forEach(function (kind) {
  const faults = runtimeSuitePolicyFaults(applyRuntimeSuiteMutant(kind, runtimeSuiteDecision))
  if (faults.indexOf(kind) < 0) fail('mutant missed: ' + kind + ' (got ' + JSON.stringify(faults) + ')')
  else { policyCaught += 1; pass('mutant caught: ' + kind) }
})
const mutantTotal = mutants.length + policyMutants.length
const mutantCaught = caught + policyCaught
if (mutantCaught !== mutantTotal) fail('mutants: ' + mutantCaught + '/' + mutantTotal + ' caught')
else pass('mutants: ' + mutantCaught + '/' + mutantTotal + ' caught')

if (sqliteBindingReady()) {
  const test = spawnSync('npm', ['test'], { cwd: runtime, encoding: 'utf8' })
  const build = spawnSync('npm', ['run', 'build'], { cwd: runtime, encoding: 'utf8' })
  const d = runtimeSuiteDecision(true, test.status, build.status)
  d.skipLines.forEach(function (line) { console.log(line) })
  d.passMessages.forEach(function (msg) { pass(msg) })
  d.failKeys.forEach(function (key) {
    if (key === 'test') fail('runtime tests failed:\n' + (test.stdout || '') + (test.stderr || ''))
    else if (key === 'build') fail('runtime build failed:\n' + (build.stderr || build.stdout))
    else fail('runtime ' + key + ' failed')
  })
  if (build.status === 0) {
    if (!fs.existsSync(path.join(runtime, 'dist', 'ledger.js'))) fail('build did not emit ledger.js')
    if (!fs.existsSync(path.join(runtime, 'dist', 'sandboxWorkerEntry.js'))) fail('build did not copy sandboxWorkerEntry.js')
    if (!fs.existsSync(path.join(runtime, 'dist', 'promptSynthesizer.js'))) fail('build did not emit promptSynthesizer.js')
    if (!fs.existsSync(path.join(runtime, 'dist', 'recommendationEngine.js'))) fail('build did not emit recommendationEngine.js')
    if (!fs.existsSync(path.join(runtime, 'dist', 'sandboxWorker.js'))) fail('build did not emit sandboxWorker.js')
  }
} else {
  const d = runtimeSuiteDecision(false, null, null)
  d.skipLines.forEach(function (line) { console.log(line) })
  d.passMessages.forEach(function (msg) { pass(msg) })
  d.failKeys.forEach(function (key) { fail('runtime ' + key + ' failed') })
}

if (failed) {
  console.error('check-aia-runtime failed')
  process.exit(1)
}
console.log('check-aia-runtime: ok')
