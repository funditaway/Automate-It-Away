#!/usr/bin/env node
'use strict'
require("./_env-guard");

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.join(__dirname, '..')
const queue = path.join(root, 'queue')

let failed = 0
function fail(msg) {
  failed += 1
  console.error('FAIL ' + msg)
}
function pass(msg) {
  console.log('ok  ' + msg)
}

function mustExist(rel) {
  const p = path.join(queue, rel)
  if (!fs.existsSync(p)) fail('missing ' + rel)
}

;[
  'src/types.ts',
  'src/store/useQueueStore.ts',
  'src/components/QueueCockpit.tsx',
  'src/data/card_ui.json',
  'src/components/DiffViewer.tsx',
  'src/components/ActiveDecisionDetail.tsx',
  'src/components/QueueList.tsx',
  'src/components/RiskBadge.tsx',
].forEach(mustExist)

const types = fs.readFileSync(path.join(queue, 'src/types.ts'), 'utf8')
;[
  'export type RiskLevel',
  'export interface DecisionCardPayload',
  'export interface ActiveDecisionCard',
  'riskLevel: RiskLevel',
  'status: DecisionCardStatus',
].forEach((bit) => {
  if (types.indexOf(bit) < 0) fail('types.ts missing ' + bit)
})
if (/Record<string,\s*any>/.test(types)) fail('types.ts must not use any')

const store = fs.readFileSync(path.join(queue, 'src/store/useQueueStore.ts'), 'utf8')
;[
  'enqueueCard',
  'signCard',
  'rejectCard',
  'delegateCard',
  'compareRiskThenFifo',
  'generateMockSignature',
].forEach((bit) => {
  if (store.indexOf(bit) < 0) fail('useQueueStore missing ' + bit)
})

const cockpit = fs.readFileSync(path.join(queue, 'src/components/QueueCockpit.tsx'), 'utf8')
;['signCard', 'keydown', 'Enter', 'QueueList', 'ActiveDecisionDetail'].forEach((bit) => {
  if (cockpit.indexOf(bit) < 0) fail('QueueCockpit missing ' + bit)
})

const cardUi = JSON.parse(fs.readFileSync(path.join(queue, 'src/data/card_ui.json'), 'utf8'))
if (!cardUi.fields || !cardUi.actions || !cardUi.actions.primary) fail('card_ui.json shape invalid')

function unique(list) {
  const out = []
  list.forEach(function (item) { if (out.indexOf(item) < 0) out.push(item) })
  return out
}

// Never npm install from the registry. Use an existing node_modules or a
// require.resolve fallback, and only skip the build when the tools are
// not present.
function resolvePkg(name) {
  const local = path.join(queue, 'node_modules', name)
  if (fs.existsSync(local)) return local
  try {
    return path.dirname(require.resolve(name + '/package.json'))
  } catch (e) {
    return null
  }
}

function depsReady() {
  return !!(resolvePkg('vite') && resolvePkg('typescript'))
}

const SKIP_LINE = "SKIPPED queue build because there's no local vite/typescript"

function isNetworkInstallError(text) {
  const s = String(text || '')
  if (/ERESOLVE|ELIFECYCLE|EJSONPARSE|EUSAGE|EACCES|peer dep/i.test(s) && !/EAI_AGAIN|ENOTFOUND|ETIMEDOUT/.test(s)) {
    return false
  }
  return /EAI_AGAIN|ENOTFOUND|ETIMEDOUT|ECONNREFUSED|ENETUNREACH|ENETDOWN|EHOSTUNREACH|ECONNRESET|ERR_SOCKET|getaddrinfo|network is unreachable|socket timed out|unable to resolve(?:d)? (?:host|registry)/i.test(s)
}

function suiteDecision(ready, buildStatus, installStatus, installOut) {
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
  if (buildStatus !== 0) failKeys.push('build')
  else passMessages.push('queue build passed')
  return { skipLines: [], passMessages: passMessages, failKeys: failKeys }
}

function applyDecisionMutant(kind, decide) {
  return function (ready, buildStatus, installStatus, installOut) {
    const d = decide(ready, buildStatus, installStatus, installOut)
    if (kind === 'silent skip (no line)') {
      if (!ready && (installStatus == null || installStatus === 0 || isNetworkInstallError(installOut))) {
        return { skipLines: [], passMessages: [], failKeys: [] }
      }
    } else if (kind === 'skip counted as pass') {
      if (!ready && (installStatus == null || installStatus === 0 || isNetworkInstallError(installOut))) {
        return { skipLines: [], passMessages: ['queue build passed'], failKeys: [] }
      }
    } else if (kind === 'failing queue build swallowed when the deps are present') {
      if (ready && buildStatus !== 0) {
        return {
          skipLines: d.skipLines,
          passMessages: d.passMessages.concat(['queue build passed']),
          failKeys: (d.failKeys || []).filter(function (k) { return k !== 'build' }),
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
  if (skipText.indexOf('SKIPPED') < 0 || skipText.indexOf('queue build') < 0) {
    bad.push('silent skip (no line)')
  }
  if ((skip.skipLines || []).some(function (l) { return /^(?:ok\s+)+SKIPPED\b/.test(l) })) {
    bad.push('ok-prefixed SKIPPED line')
  }
  const skipPass = (skip.passMessages || []).some(function (m) {
    return /queue build passed/.test(m)
  })
  if (skipPass || /\bPASSED\b/.test(skipText) || /ok  queue build passed/.test(skipText)) {
    bad.push('skip counted as pass')
  }
  const failedBuild = decide(true, 1, null, null)
  if (!failedBuild.failKeys || failedBuild.failKeys.indexOf('build') < 0) {
    bad.push('failing queue build swallowed when the deps are present')
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
    !/check-queue-cockpit failed/.test(end)
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
    region.indexOf("fail('queue build failed:") >= 0 ||
    region.indexOf('fail("queue build failed:') >= 0 ||
    region.indexOf("failFn('queue build failed:") >= 0 ||
    region.indexOf('failFn("queue build failed:') >= 0
  )
  if (!hasFailCall || !/failKeys/.test(region) || !/\.forEach/.test(region) || !/key\s*===\s*['"]build['"]/.test(region)) {
    bad.push('failing queue build swallowed when the deps are present')
  }
  return unique(bad)
}

function reportSitePolicyFaults(reportFn) {
  const bad = []
  const fails = []
  const passes = []
  reportFn(
    { skipLines: [], passMessages: [], failKeys: ['build'] },
    'injected failing queue build',
    {
      log: function () {},
      pass: function (m) { passes.push(m) },
      fail: function (m) { fails.push(m) },
    }
  )
  const reported = fails.some(function (m) {
    return String(m).indexOf('queue build failed:') === 0
  })
  if (!reported) bad.push('failing queue build swallowed when the deps are present')
  if (passes.some(function (m) { return /queue build passed/.test(m) })) {
    bad.push('failing queue build swallowed when the deps are present')
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
  if (kind === 'failing queue build swallowed when the deps are present') {
    return function (d, buildOut, hooks) {
      const d2 = {
        skipLines: d.skipLines,
        passMessages: d.passMessages,
        failKeys: (d.failKeys || []).filter(function (k) { return k !== 'build' }),
      }
      return reportFn(d2, buildOut, hooks)
    }
  }
  if (kind === 'ok-prefixed SKIPPED line') {
    return function (d, buildOut, hooks) {
      const passFn = (hooks && hooks.pass) || function () {}
      const failFn = (hooks && hooks.fail) || function () {}
      ;(d.skipLines || []).forEach(function (line) { passFn(line) })
      ;(d.passMessages || []).forEach(function (msg) { passFn(msg) })
      ;(d.failKeys || []).forEach(function (key) {
        if (key === 'build') failFn('queue build failed:\n' + (buildOut || ''))
        else if (key === 'install') failFn('npm install failed: ' + (buildOut || ''))
        else failFn('queue ' + key + ' failed')
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
  if (kind === 'failing queue build swallowed when the deps are present') {
    const needle = "if (key === 'build') failFn('queue build failed:\\n' + (buildOut || ''))"
    if (src.indexOf(needle) < 0) return src
    return src.replace(needle, "if (key === 'build') { /* swallowed at the report site */ }")
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
  'failing queue build swallowed when the deps are present',
  'non-network install error treated as skip',
]
let decisionCaught = 0
if (suitePolicyFaults(suiteDecision).length) {
  fail('queue suite policy drifted: ' + suitePolicyFaults(suiteDecision).join('; '))
} else pass('queue suite skip is SKIPPED, not a pass, a present build still fails, and a non-network install error still fails')
decisionMutants.forEach(function (kind) {
  const faults = suitePolicyFaults(applyDecisionMutant(kind, suiteDecision))
  if (faults.indexOf(kind) < 0) fail('mutant missed: ' + kind + ' (got ' + JSON.stringify(faults) + ')')
  else { decisionCaught += 1; pass('mutant caught: ' + kind) }
})

function registryInstallSourceFaults(src) {
  const bad = []
  const kind = 'dead npm install call'
  const text = String(src || '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1')
  const runner = ['sp', 'awn'].join('') + '(?:Sync)?|' + ['ex', 'ec'].join('') + '(?:File(?:Sync)?|Sync)?'
  const bin = ['n', 'pm'].join('')
  const verbs = ['in', 'stall'].join('') + '|' + 'i' + '|ci'
  const one = new RegExp('(?:' + runner + ')\\s*\\(\\s*[\'"`]' + bin + '\\s+(?:' + verbs + ')\\b')
  const argv = new RegExp('(?:' + runner + ')\\s*\\(\\s*[\'"`]' + bin + '[\'"`]\\s*,\\s*\\[?\\s*[\'"`](?:' + verbs + ')\\b')
  if (one.test(text) || argv.test(text)) bad.push(kind)
  return unique(bad)
}

function applyRegistryInstallMutant(kind, src) {
  if (kind === 'dead npm install call') {
    const bin = ['n', 'pm'].join('')
    const verb = ['in', 'stall'].join('')
    const run = ['spawn', 'Sync'].join('')
    return src + '\nfunction unusedRegistryInstall(){ ' + run + '(\'' + bin + '\', [\'' + verb + '\']) }\n'
  }
  return src
}

const registryInstallMutants = [
  'dead npm install call',
]

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
    .concat(registryInstallSourceFaults(srcNow))
)
if (probeLive.length) fail('queue suite policy drifted: ' + probeLive.join('; '))
else pass('a skip still exits 1 when other asserts fail, SKIPPED is raw, and a failing build is still reported')

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

let registryInstallCaught = 0
registryInstallMutants.forEach(function (kind) {
  const faults = registryInstallSourceFaults(applyRegistryInstallMutant(kind, srcNow))
  if (faults.indexOf(kind) < 0) fail('mutant missed: ' + kind + ' (got ' + JSON.stringify(faults) + ')')
  else { registryInstallCaught += 1; pass('mutant caught: ' + kind) }
})

const mutantTotal = decisionMutants.length + sourceMutants.length + registryInstallMutants.length
const mutantCaught = decisionCaught + probeCaught + registryInstallCaught
if (mutantCaught !== mutantTotal) fail('mutants: ' + mutantCaught + '/' + mutantTotal + ' caught')
else pass('mutants: ' + mutantCaught + '/' + mutantTotal + ' caught')

function reportSuite(d, buildOut, hooks) {
  const logFn = (hooks && hooks.log) || function (line) { console.log(line) }
  const passFn = (hooks && hooks.pass) || pass
  const failFn = (hooks && hooks.fail) || fail
  ;(d.skipLines || []).forEach(function (line) { logFn(line) })
  ;(d.passMessages || []).forEach(function (msg) { passFn(msg) })
  ;(d.failKeys || []).forEach(function (key) {
    if (key === 'build') failFn('queue build failed:\n' + (buildOut || ''))
    else if (key === 'install') failFn('npm install failed: ' + (buildOut || ''))
    else failFn('queue ' + key + ' failed')
  })
}

if (probeLive.length) {
  console.error('check-queue-cockpit failed')
  process.exit(1)
}

if (depsReady()) {
  const env = Object.assign({}, process.env)
  let build
  if (fs.existsSync(path.join(queue, 'node_modules', 'vite'))) {
    build = spawnSync('npm', ['run', 'build'], { cwd: queue, encoding: 'utf8', env: env })
  } else {
    const resolved = resolvePkg('vite')
    if (resolved) {
      const modulesDir = path.dirname(resolved)
      const bin = path.join(modulesDir, '.bin')
      env.PATH = bin + path.delimiter + (env.PATH || '')
      env.NODE_PATH = modulesDir + (env.NODE_PATH ? path.delimiter + env.NODE_PATH : '')
    }
    const tsc = spawnSync('tsc', ['-b'], { cwd: queue, encoding: 'utf8', env: env })
    if (tsc.status !== 0) build = tsc
    else build = spawnSync('vite', ['build'], { cwd: queue, encoding: 'utf8', env: env })
  }
  const d = suiteDecision(true, build.status, null, null)
  reportSuite(d, (build.stderr || '') + (build.stdout || ''))
} else {
  const d = suiteDecision(false, null, null, null)
  reportSuite(d, '')
}

if (failed) {
  console.error('check-queue-cockpit failed')
  process.exit(1)
}
if (skipExitSourceFaults(fs.readFileSync(__filename, 'utf8')).length) {
  console.error('check-queue-cockpit failed')
  process.exit(1)
}
console.log('check-queue-cockpit: ok')
