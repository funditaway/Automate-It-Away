#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runGeminiCard } from './deploy_gemini_aia_pack.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const { fixtures } = JSON.parse(fs.readFileSync(path.join(__dirname, 'eval-fixtures.json'), 'utf8'))

let failures = 0

for (const fx of fixtures) {
  try {
    const res = await runGeminiCard(fx.card_id, { input: fx.input, dry_run: true })
    const raw = (res.output || '').trim()
    const exp = fx.expect || {}
    const reasons = []

    let parsedJson = null
    if (exp.valid_json) {
      try {
        parsedJson = JSON.parse(raw)
      } catch {
        reasons.push('Expected valid JSON, got invalid JSON')
      }
    }

    if (parsedJson && Array.isArray(exp.required_keys)) {
      for (const key of exp.required_keys) {
        if (!(key in parsedJson)) reasons.push('Missing key: ' + key)
      }
    }

    if (parsedJson && exp.priority && parsedJson.priority !== exp.priority) {
      reasons.push('Expected priority "' + exp.priority + '", got "' + parsedJson.priority + '"')
    }

    if (parsedJson && exp.next_card_id && parsedJson.next_card_id !== exp.next_card_id) {
      reasons.push(
        'Expected next_card_id "' + exp.next_card_id + '", got "' + parsedJson.next_card_id + '"'
      )
    }

    const lower = raw.toLowerCase()
    if (Array.isArray(exp.contains_any) && exp.contains_any.length > 0) {
      const matched = exp.contains_any.some((term) => lower.includes(String(term).toLowerCase()))
      if (!matched) reasons.push('Missing expected phrase from: ' + exp.contains_any.join(', '))
    }

    if (Array.isArray(exp.avoids_any)) {
      for (const forbidden of exp.avoids_any) {
        if (lower.includes(String(forbidden).toLowerCase())) {
          reasons.push('Contained forbidden phrase: "' + forbidden + '"')
        }
      }
    }

    if (reasons.length === 0) {
      console.log('PASS  ' + fx.id + ' (' + fx.card_id + ')')
    } else {
      failures += 1
      console.error('FAIL  ' + fx.id + ' (' + fx.card_id + '): ' + reasons.join(' | '))
    }
  } catch (err) {
    failures += 1
    console.error(
      'ERROR ' + fx.id + ' (' + fx.card_id + '): ' + (err instanceof Error ? err.message : String(err))
    )
  }
}

if (failures > 0) {
  console.error(failures + ' failure(s)')
  process.exitCode = 1
} else {
  console.log('run-evals: ok')
}
