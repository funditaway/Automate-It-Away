import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

function fallbackConfig(text) {
  const conf = /auto_advance_on_confidence:\s*([0-9.]+)/.exec(text || '')
  return {
    plugin: {
      id: 'gemini-aia-pack',
      name: 'Gemini AIA Pack',
      version: '1.0.0',
      enabled: true,
      aia_pack: 'meta-gemini',
    },
    runtime: {
      entry: './deploy_gemini_aia_pack.mjs',
      schema: './queue-card-schema.json',
      system_prompt: './GEMINI_SYSTEM_PROMPT.md',
      worker: './processQueueItemV2.mjs',
    },
    hooks: {
      on_queue_item_created: {
        card_id: 'gemini-triage-card',
        auto_advance_on_confidence: conf ? Number(conf[1]) : 0.85,
        fallback_status: 'needs_review',
      },
      on_draft_requested: {
        card_id: 'gemini-draft-card',
        require_human_approval: true,
      },
      on_workflow_build_requested: {
        card_id: 'gemini-deep-card',
        require_human_approval: true,
      },
    },
  }
}

export function loadPluginConfig(rel = './aia-gemini-plugin.yaml') {
  const file = path.resolve(__dirname, rel)
  const text = fs.readFileSync(file, 'utf8')
  try {
    const yaml = require('js-yaml')
    return yaml.load(text)
  } catch {
    return fallbackConfig(text)
  }
}
