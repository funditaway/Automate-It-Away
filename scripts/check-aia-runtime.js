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
  'src/sandboxManager.ts',
  'src/sandboxWorker.js',
  'src/server.ts',
  'src/ghl.ts',
  'src/types.ts',
  'src/data/card_ui.json',
  'agents/sample-ghl/logic.js',
  'test/runtime.test.ts',
].forEach(mustExist)

const db = fs.readFileSync(path.join(runtime, 'src/db.ts'), 'utf8')
;['vault', 'queue', 'provenance_ledger', 'aes-256-gcm', 'aia_vault.db'].forEach((bit) => {
  if (db.indexOf(bit) < 0) fail('db.ts missing ' + bit)
})

const cryptoSrc = fs.readFileSync(path.join(runtime, 'src/crypto.ts'), 'utf8')
;['ed25519', 'canonicalJson', 'signCanonical', 'verifyCanonical'].forEach((bit) => {
  if (cryptoSrc.indexOf(bit) < 0) fail('crypto.ts missing ' + bit)
})

const sandbox = fs.readFileSync(path.join(runtime, 'src/sandboxManager.ts'), 'utf8')
;['Worker', 'enqueueCard', 'waitForResolution', 'card_ui'].forEach((bit) => {
  if (sandbox.indexOf(bit) < 0) fail('sandboxManager.ts missing ' + bit)
})

const server = fs.readFileSync(path.join(runtime, 'src/server.ts'), 'utf8')
;['/webhook/ghl', '3847', 'authorize', 'leadconnectorhq', 'appendProvenance'].forEach((bit) => {
  if (server.indexOf(bit) < 0) fail('server.ts missing ' + bit)
})

if (!fs.existsSync(path.join(runtime, 'node_modules'))) {
  const install = spawnSync('npm', ['install'], { cwd: runtime, encoding: 'utf8' })
  if (install.status !== 0) fail('npm install failed: ' + (install.stderr || install.stdout))
}

const test = spawnSync('npm', ['test'], { cwd: runtime, encoding: 'utf8' })
if (test.status !== 0) fail('runtime tests failed:\n' + (test.stdout || '') + (test.stderr || ''))

const build = spawnSync('npm', ['run', 'build'], { cwd: runtime, encoding: 'utf8' })
if (build.status !== 0) fail('runtime build failed:\n' + (build.stderr || build.stdout))

if (!fs.existsSync(path.join(runtime, 'dist', 'sandboxWorker.js'))) {
  fail('build did not copy sandboxWorker.js')
}

console.log('check-aia-runtime: ok')
