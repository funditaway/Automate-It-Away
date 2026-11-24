#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const requiredFiles = [
  './gemini-aia-pack.json',
  './GEMINI_SYSTEM_PROMPT.md',
  './deploy_gemini_aia_pack.mjs',
  './queue-card-schema.json',
  './aia-gemini-plugin.yaml',
  './.cursor/rules/gemini-aia-pack.mdc',
  './eval-fixtures.json',
  './queue-ui-model.json',
  './processQueueItem.mjs',
  './run-evals.mjs',
  './QueueItemCard.jsx',
  './queueApiHandler.mjs',
  './intake-followup-cards.json',
  './QueuePage.jsx',
  './withRetry.mjs',
  './audit-log-schema.json',
  './processQueueItemV2.mjs',
  './intakeBatchHandler.mjs',
  './setup-pack.sh',
  './run-batch.mjs',
  './sample-batch.json',
  './queue-desk.css',
  './package.json',
  './validateState.mjs',
  './serve-queue.mjs',
  './queueApiHandlerV2.mjs',
  './chainCards.mjs',
  './.env.example',
  './README.md',
]

let issues = 0

for (const file of requiredFiles) {
  const p = path.join(__dirname, file)
  if (!fs.existsSync(p)) {
    console.error('MISSING  ' + file)
    issues += 1
  } else {
    console.log('OK       ' + file)
  }
}

try {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'gemini-aia-pack.json'), 'utf8'))
  const envVar = (manifest.provider && manifest.provider.auth_env) || 'GEMINI_API_KEY'
  if (!process.env[envVar]) {
    console.warn('WARN     Environment variable ' + envVar + ' is not set (dry-run will be used)')
  } else {
    console.log('OK       Environment variable ' + envVar + ' is set')
  }
  if (!manifest.rails || !manifest.rails.some((r) => /draft|HOLD|Yes/i.test(r))) {
    console.error('ERROR    Manifest missing HITL / Collect HOLD rails')
    issues += 1
  } else {
    console.log('OK       Manifest HITL rails present')
  }
} catch (err) {
  console.error('ERROR    Failed parsing gemini-aia-pack.json: ' + err.message)
  issues += 1
}

try {
  JSON.parse(fs.readFileSync(path.join(__dirname, 'queue-card-schema.json'), 'utf8'))
  console.log('OK       queue-card-schema.json parsed cleanly')
} catch (err) {
  console.error('ERROR    queue-card-schema.json: ' + err.message)
  issues += 1
}

try {
  const text = fs.readFileSync(path.join(__dirname, 'aia-gemini-plugin.yaml'), 'utf8')
  try {
    require('js-yaml').load(text)
    console.log('OK       aia-gemini-plugin.yaml parsed with js-yaml')
  } catch {
    if (!/auto_advance_on_confidence:\s*0\.85/.test(text)) {
      console.error('ERROR    aia-gemini-plugin.yaml missing expected confidence gate')
      issues += 1
    } else {
      console.log('OK       aia-gemini-plugin.yaml present (js-yaml optional)')
    }
  }
} catch (err) {
  console.error('ERROR    Failed reading aia-gemini-plugin.yaml: ' + err.message)
  issues += 1
}

if (issues > 0) {
  console.error(issues + ' issue(s)')
  process.exitCode = 1
} else {
  console.log('doctor: ok')
}
