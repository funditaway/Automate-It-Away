#!/usr/bin/env node
'use strict'

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
;['buildDecisionPayload', 'normalizeDecisionPayload', 'nextRecommendation'].forEach((bit) => {
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

const start = fs.readFileSync(path.join(command, 'start.sh'), 'utf8')
if (start.indexOf('doctor.js') < 0 || start.indexOf('server.js') < 0) fail('start.sh must run doctor and the daemon')

const pkg = JSON.parse(fs.readFileSync(path.join(command, 'package.json'), 'utf8'))
if (!pkg.dependencies || !pkg.dependencies.express) fail('package.json missing express')
const depNames = Object.keys(Object.assign({}, pkg.dependencies, pkg.devDependencies))
;['ethers', 'viem', 'wagmi', 'react', 'vue', 'vite'].forEach((name) => {
  if (depNames.indexOf(name) >= 0) fail('unexpected dependency ' + name)
})

if (!fs.existsSync(path.join(command, 'node_modules', 'express'))) {
  const install = spawnSync('npm', ['install'], { cwd: command, encoding: 'utf8' })
  if (install.status !== 0) fail('npm install failed: ' + (install.stderr || install.stdout))
}

const test = spawnSync('npm', ['test'], { cwd: command, encoding: 'utf8' })
if (test.status !== 0) fail('command tests failed:\n' + (test.stdout || '') + (test.stderr || ''))

console.log('check-aia-command: ok')
