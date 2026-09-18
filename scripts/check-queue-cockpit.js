#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.join(__dirname, '..')
const queue = path.join(root, 'queue')

function fail(msg) {
  console.error('check-queue-cockpit: ' + msg)
  process.exit(1)
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

if (!fs.existsSync(path.join(queue, 'node_modules'))) {
  const install = spawnSync('npm', ['install'], { cwd: queue, encoding: 'utf8' })
  if (install.status !== 0) fail('npm install failed: ' + (install.stderr || install.stdout))
}

const build = spawnSync('npm', ['run', 'build'], { cwd: queue, encoding: 'utf8' })
if (build.status !== 0) fail('queue build failed:\n' + (build.stderr || build.stdout))

console.log('check-queue-cockpit: ok')
