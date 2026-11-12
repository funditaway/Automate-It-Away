#!/usr/bin/env node
'use strict'
require("./_env-guard");

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.join(__dirname, '..')
const command = path.join(root, 'command')

let failed = 0
function fail(msg) {
  failed += 1
  console.error('FAIL ' + msg)
}
function pass(msg) {
  console.log('ok  ' + msg)
}

function mustExist(rel) {
  if (!fs.existsSync(path.join(command, rel))) fail('missing ' + rel)
}

;[
  'package.json',
  'server.js',
  'webhookIngest.js',
  'grokBotPrompt.js',
  'verifyLedger.js',
  'doctor.js',
  'deploySwarm.js',
  'bridgeModule.js',
  'ecosystem.config.cjs',
  'start.sh',
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
;['ed25519', 'signCanonical', 'verifyCanonical'].forEach((bit) => {
  if (keys.indexOf(bit) < 0) fail('lib/keys.js missing ' + bit)
})

const ledger = fs.readFileSync(path.join(command, 'lib', 'ledger.js'), 'utf8')
;['ledger', 'entryHash', 'appendFileSync'].forEach((bit) => {
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
const depNames = Object.keys(Object.assign({}, pkg.dependencies, pkg.devDependencies))
;['ethers', 'viem', 'wagmi', 'react', 'vue', 'vite'].forEach((name) => {
  if (depNames.indexOf(name) >= 0) fail('unexpected dependency ' + name)
})

function unique(list) {
  const out = []
  list.forEach(function (item) { if (out.indexOf(item) < 0) out.push(item) })
  return out
}

// Never npm install from the registry. Use an existing node_modules or a
// require.resolve fallback, and only skip the tests when express is not present.
function resolveExpress() {
  const local = path.join(command, 'node_modules', 'express')
  if (fs.existsSync(local)) return local
  try {
    return path.dirname(require.resolve('express/package.json'))
  } catch (e) {
    return null
  }
}

function depsReady() {
  return !!resolveExpress()
}

const SKIP_LINE = "SKIPPED command tests because there's no local express"

function isNetworkInstallError(text) {
  const s = String(text || '')
  if (/ERESOLVE|ELIFECYCLE|EJSONPARSE|EUSAGE|EACCES|peer dep/i.test(s) && !/EAI_AGAIN|ENOTFOUND|ETIMEDOUT/.test(s)) {
    return false
  }
  return /EAI_AGAIN|ENOTFOUND|ETIMEDOUT|ECONNREFUSED|ENETUNREACH|ENETDOWN|EHOSTUNREACH|ECONNRESET|ERR_SOCKET|getaddrinfo|network is unreachable|socket timed out|unable to resolve(?:d)? (?:host|registry)/i.test(s)
}

function suiteDecision(ready, testStatus, installStatus, installOut) {
  if (installStatus != null && installStatus !== 0) {
    if (isNetworkInstallError(installOut)) {
      return { skipLines: [SKIP_LINE], passMessages: [], failKeys: [] }
    }
    return { skipLines: [], passMessages: [], failKeys: ['install'] }
  }
  if (!ready) {
    return { skipLines: [SKIP_LINE], passMessages: [], failKeys: [] }
  }
  const passMessages = []
  const failKeys = []
  if (testStatus !== 0) failKeys.push('test')
  else passMessages.push('command tests passed')
  return { skipLines: [], passMessages: passMessages, failKeys: failKeys }
}

function applyDecisionMutant(kind, decide) {
  return function (ready, testStatus, installStatus, installOut) {
    const d = decide(ready, testStatus, installStatus, installOut)
    if (kind === 'silent skip (no line)') {
      if (!ready && (installStatus == null || installStatus === 0 || isNetworkInstallError(installOut))) {
        return { skipLines: [], passMessages: [], failKeys: [] }
      }
    } else if (kind === 'skip counted as pass') {
      if (!ready && (installStatus == null || installStatus === 0 || isNetworkInstallError(installOut))) {
        return { skipLines: [], passMessages: ['command tests passed'], failKeys: [] }
      }
    } else if (kind === 'failing command tests swallowed when express is present') {
      if (ready && testStatus !== 0) {
        return {
          skipLines: d.skipLines,
          passMessages: d.passMessages.concat(['command tests passed']),
          failKeys: (d.failKeys || []).filter(function (k) { return k !== 'test' }),
        }
      }
    } else if (kind === 'non-network install error treated as skip') {
      if (installStatus != null && installStatus !== 0 && !isNetworkInstallError(installOut)) {
        return { skipLines: [SKIP_LINE], passMessages: [], failKeys: [] }
      }
    }
    return d
  }
}

function suitePolicyFaults(decide) {
  const bad = []
  const skip = decide(false, null, null, null)
  const skipText = (skip.skipLines || []).join('\n')
  if (skipText.indexOf('SKIPPED') < 0 || skipText.indexOf('command tests') < 0) {
    bad.push('silent skip (no line)')
  }
  if ((skip.skipLines || []).some(function (l) { return /^(?:ok\s+)+SKIPPED\b/.test(l) })) {
    bad.push('ok-prefixed SKIPPED line')
  }
  const skipPass = (skip.passMessages || []).some(function (m) {
    return /command tests passed/.test(m)
  })
  if (skipPass || /\bPASSED\b/.test(skipText) || /ok  command tests passed/.test(skipText)) {
    bad.push('skip counted as pass')
  }
  const failedTest = decide(true, 1, null, null)
  if (!failedTest.failKeys || failedTest.failKeys.indexOf('test') < 0) {
    bad.push('failing command tests swallowed when express is present')
  }
  const resolveFail = decide(false, null, 1, 'npm ERR! code ERESOLVE\nnpm ERR! ERESOLVE could not resolve\npeer dependency conflict')
  if (
    !resolveFail.failKeys ||
    resolveFail.failKeys.indexOf('install') < 0 ||
    (resolveFail.skipLines || []).some(function (l) { return /SKIPPED/.test(l) })
  ) {
    bad.push('non-network install error treated as skip')
  }
  const net = decide(false, null, 1, 'npm ERR! code EAI_AGAIN\nnpm ERR! syscall getaddrinfo\nnpm ERR! network')
  const netText = (net.skipLines || []).join('\n')
  if (netText.indexOf('SKIPPED') < 0 || (net.failKeys || []).indexOf('install') >= 0) {
    bad.push('silent skip (no line)')
  }
  return unique(bad)
}

function checkSource() {
  return fs.readFileSync(__filename, 'utf8')
}

function liveSuiteRegion(src) {
  const fnAt = src.lastIndexOf('function reportSuite')
  const ifAt = src.lastIndexOf('if (depsReady())')
  const at = fnAt >= 0 && (ifAt < 0 || fnAt < ifAt) ? fnAt : ifAt
  return at >= 0 ? src.slice(at) : ''
}

function skipExitSourceFaults(src) {
  const bad = []
  const region = liveSuiteRegion(src)
  if (/failed\s*=\s*0\b/.test(region) || /failed\s*=\s*false\b/.test(region)) {
    bad.push('skip exits 0 when other asserts fail')
  }
  const endAt = region.search(/if\s*\(\s*failed/)
  const end = endAt >= 0 ? region.slice(endAt) : ''
  if (
    !/if\s*\(\s*failed\s*\)/.test(end) ||
    /if\s*\(\s*failed\s*&&/.test(end) ||
    !/process\.exit\(\s*1\s*\)/.test(end) ||
    !/check-aia-command failed/.test(end)
  ) {
    bad.push('skip exits 0 when other asserts fail')
  }
  const elseAt = region.lastIndexOf('} else {')
  const elseBranch = elseAt >= 0 && endAt > elseAt ? region.slice(elseAt, endAt) : ''
  if (/process\.exit\(\s*0\s*\)/.test(elseBranch)) {
    bad.push('skip exits 0 when other asserts fail')
  }
  return unique(bad)
}

function reportSiteSourceFaults(src) {
  const bad = []
  const region = liveSuiteRegion(src)
  const hasFailCall = (
    region.indexOf("fail('command tests failed:") >= 0 ||
    region.indexOf('fail("command tests failed:') >= 0 ||
    region.indexOf("failFn('command tests failed:") >= 0 ||
    region.indexOf('failFn("command tests failed:') >= 0
  )
  if (!hasFailCall || !/failKeys/.test(region) || !/\.forEach/.test(region) || !/key\s*===\s*['"]test['"]/.test(region)) {
    bad.push('failing command tests swallowed when express is present')
  }
  return unique(bad)
}

function reportSitePolicyFaults(reportFn) {
  const bad = []
  const fails = []
  const passes = []
  reportFn(
    { skipLines: [], passMessages: [], failKeys: ['test'] },
    'injected failing command tests',
    {
      log: function () {},
      pass: function (m) { passes.push(m) },
      fail: function (m) { fails.push(m) },
    }
  )
  const reported = fails.some(function (m) {
    return String(m).indexOf('command tests failed:') === 0
  })
  if (!reported) bad.push('failing command tests swallowed when express is present')
  if (passes.some(function (m) { return /command tests passed/.test(m) })) {
    bad.push('failing command tests swallowed when express is present')
  }
  return unique(bad)
}


function silentSkipSourceFaults(src) {
  const bad = []
  const region = liveSuiteRegion(src)
  const forEachRe = /skipLines\s*\|\|\s*\[\s*\]\s*\)\s*\.forEach\s*\(\s*function\s*\(\s*(\w+)\s*\)\s*\{([\s\S]*?)\}\s*\)/
  const m = region.match(forEachRe)
  if (!m || !(/logFn\s*\(/.test(m[2]) || /console\.log\s*\(/.test(m[2]))) {
    bad.push('silent skip (no line)')
  }
  return unique(bad)
}

function okSkippedSourceFaults(src) {
  const bad = []
  const region = liveSuiteRegion(src)
  if (/console\.log\(\s*['"]ok\s/.test(region) || /console\.log\(\s*['"]ok['"]\s*\+/.test(region)) {
    bad.push('ok-prefixed SKIPPED line')
  }
  const forEachRe = /skipLines\s*\|\|\s*\[\s*\]\s*\)\s*\.forEach\s*\(\s*function\s*\(\s*(\w+)\s*\)\s*\{([\s\S]*?)\}\s*\)/
  const m = region.match(forEachRe)
  if (!m) {
    bad.push('ok-prefixed SKIPPED line')
  } else if (/\bpass(?:Fn)?\s*\(/.test(m[2]) || /['"]ok\s/.test(m[2]) || /\bok\s*\+/.test(m[2])) {
    bad.push('ok-prefixed SKIPPED line')
  }
  if (/\bpass(?:Fn)?\s*\(\s*SKIP_LINE\b/.test(region)) {
    bad.push('ok-prefixed SKIPPED line')
  }
  return unique(bad)
}

function okSkippedOutputFaults(reportFn) {
  const bad = []
  const logs = []
  const passes = []
  reportFn(
    { skipLines: [SKIP_LINE], passMessages: [], failKeys: [] },
    '',
    {
      log: function (m) { logs.push(String(m)) },
      pass: function (m) { passes.push(String(m)) },
      fail: function () {},
    }
  )
  function okForm(m) {
    return /^(?:ok\s+)+SKIPPED\b/.test(m)
  }
  if (logs.some(okForm) || passes.some(okForm) || passes.some(function (m) { return m.indexOf('SKIPPED') >= 0 })) {
    bad.push('ok-prefixed SKIPPED line')
  }
  if (!logs.some(function (m) { return m.indexOf('SKIPPED') === 0 })) {
    bad.push('ok-prefixed SKIPPED line')
  }
  return unique(bad)
}

function applyReportSiteMutant(kind, reportFn) {
  if (kind === 'failing command tests swallowed when express is present') {
    return function (d, testOut, hooks) {
      const d2 = {
        skipLines: d.skipLines,
        passMessages: d.passMessages,
        failKeys: (d.failKeys || []).filter(function (k) { return k !== 'test' }),
      }
      return reportFn(d2, testOut, hooks)
    }
  }
  if (kind === 'ok-prefixed SKIPPED line') {
    return function (d, testOut, hooks) {
      const passFn = (hooks && hooks.pass) || function () {}
      const failFn = (hooks && hooks.fail) || function () {}
      ;(d.skipLines || []).forEach(function (line) { passFn(line) })
      ;(d.passMessages || []).forEach(function (msg) { passFn(msg) })
      ;(d.failKeys || []).forEach(function (key) {
        if (key === 'test') failFn('command tests failed:\n' + (testOut || ''))
        else if (key === 'install') failFn('npm install failed: ' + (testOut || ''))
        else failFn('command ' + key + ' failed')
      })
    }
  }
  return reportFn
}

function applySourceMutant(kind, src) {
  if (kind === 'skip exits 0 when other asserts fail') {
    const regionStart = src.lastIndexOf('if (depsReady())')
    const elseAt = src.indexOf('} else {', regionStart)
    const endIf = src.indexOf('\nif (failed)', elseAt)
    if (regionStart < 0 || elseAt < 0 || endIf < 0) return src
    return src.slice(0, endIf) + '\nfailed = 0' + src.slice(endIf)
  }
  if (kind === 'failing command tests swallowed when express is present') {
    const needle = "if (key === 'test') failFn('command tests failed:\\n' + (testOut || ''))"
    if (src.indexOf(needle) < 0) return src
    return src.replace(needle, "if (key === 'test') { /* swallowed at the report site */ }")
  }
  if (kind === 'ok-prefixed SKIPPED line') {
    const needle = "(d.skipLines || []).forEach(function (line) { logFn(line) })"
    const at = src.lastIndexOf(needle)
    if (at < 0) return src
    return src.slice(0, at) + "(d.skipLines || []).forEach(function (line) { passFn(line) })" + src.slice(at + needle.length)
  }
  return src
}

const decisionMutants = [
  'silent skip (no line)',
  'skip counted as pass',
  'failing command tests swallowed when express is present',
  'non-network install error treated as skip',
]
let decisionCaught = 0
if (suitePolicyFaults(suiteDecision).length) {
  fail('command suite policy drifted: ' + suitePolicyFaults(suiteDecision).join('; '))
} else pass('command suite skip is SKIPPED, not a pass, present express still fails a broken test, and a non-network install error still fails')
decisionMutants.forEach(function (kind) {
  const faults = suitePolicyFaults(applyDecisionMutant(kind, suiteDecision))
  if (faults.indexOf(kind) < 0) fail('mutant missed: ' + kind + ' (got ' + JSON.stringify(faults) + ')')
  else { decisionCaught += 1; pass('mutant caught: ' + kind) }
})

const srcNow = checkSource()
const sourceMutants = [
  'skip exits 0 when other asserts fail',
  'ok-prefixed SKIPPED line',
]
const probeLive = unique(
  skipExitSourceFaults(srcNow)
    .concat(okSkippedSourceFaults(srcNow))
    .concat(okSkippedOutputFaults(reportSuite))
    .concat(silentSkipSourceFaults(srcNow))
    .concat(reportSiteSourceFaults(srcNow))
    .concat(reportSitePolicyFaults(reportSuite))
)
if (probeLive.length) fail('command suite policy drifted: ' + probeLive.join('; '))
else pass('a skip still exits 1 when other asserts fail, SKIPPED is raw, and a failing test is still reported')

let probeCaught = 0
sourceMutants.forEach(function (kind) {
  let faults = []
  if (kind === 'skip exits 0 when other asserts fail') {
    faults = skipExitSourceFaults(applySourceMutant(kind, srcNow))
  } else {
    faults = unique(
      okSkippedSourceFaults(applySourceMutant(kind, srcNow))
        .concat(okSkippedOutputFaults(applyReportSiteMutant(kind, reportSuite)))
    )
  }
  if (faults.indexOf(kind) < 0) fail('mutant missed: ' + kind + ' (got ' + JSON.stringify(faults) + ')')
  else { probeCaught += 1; pass('mutant caught: ' + kind) }
})

const mutantTotal = decisionMutants.length + sourceMutants.length
const mutantCaught = decisionCaught + probeCaught
if (mutantCaught !== mutantTotal) fail('mutants: ' + mutantCaught + '/' + mutantTotal + ' caught')
else pass('mutants: ' + mutantCaught + '/' + mutantTotal + ' caught')

function reportSuite(d, testOut, hooks) {
  const logFn = (hooks && hooks.log) || function (line) { console.log(line) }
  const passFn = (hooks && hooks.pass) || pass
  const failFn = (hooks && hooks.fail) || fail
  ;(d.skipLines || []).forEach(function (line) { logFn(line) })
  ;(d.passMessages || []).forEach(function (msg) { passFn(msg) })
  ;(d.failKeys || []).forEach(function (key) {
    if (key === 'test') failFn('command tests failed:\n' + (testOut || ''))
    else if (key === 'install') failFn('npm install failed: ' + (testOut || ''))
    else failFn('command ' + key + ' failed')
  })
}

if (probeLive.length) {
  console.error('check-aia-command failed')
  process.exit(1)
}

if (depsReady()) {
  const env = Object.assign({}, process.env)
  if (!fs.existsSync(path.join(command, 'node_modules', 'express'))) {
    const resolved = resolveExpress()
    if (resolved) {
      const modulesDir = path.dirname(resolved)
      env.NODE_PATH = modulesDir + (env.NODE_PATH ? path.delimiter + env.NODE_PATH : '')
    }
  }
  const test = spawnSync('npm', ['test'], { cwd: command, encoding: 'utf8', env: env })
  const d = suiteDecision(true, test.status, null, null)
  reportSuite(d, (test.stdout || '') + (test.stderr || ''))
} else {
  const d = suiteDecision(false, null, null, null)
  reportSuite(d, '')
}

if (failed) {
  console.error('check-aia-command failed')
  process.exit(1)
}
if (skipExitSourceFaults(fs.readFileSync(__filename, 'utf8')).length) {
  console.error('check-aia-command failed')
  process.exit(1)
}
console.log('check-aia-command: ok')
