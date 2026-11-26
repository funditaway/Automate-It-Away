#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeBatch } from './intakeBatchHandler.mjs'
import { processQueueItemV2 } from './processQueueItemV2.mjs'
import { loadPluginConfig } from './loadPluginConfig.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const inputPath = path.resolve(process.argv[2] || path.join(__dirname, 'sample-batch.json'))
const rawRecords = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
const pluginConfig = loadPluginConfig()

process.env.AIA_GEMINI_DRY_RUN = process.env.AIA_GEMINI_DRY_RUN || '1'

const queueItems = normalizeBatch(rawRecords)
const auditLog = []
const processedItems = []

for (const item of queueItems) {
  const result = await processQueueItemV2(item, pluginConfig, (entry) => {
    auditLog.push(entry)
  })
  processedItems.push(result)
}

console.log(
  JSON.stringify(
    {
      processed_count: processedItems.length,
      items: processedItems,
      audit_log: auditLog,
      note: 'Drafts only. Human Yes / Stop still required. Collect stays HOLD.',
    },
    null,
    2
  )
)
