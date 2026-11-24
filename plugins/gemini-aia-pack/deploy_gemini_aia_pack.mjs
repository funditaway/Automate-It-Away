#!/usr/bin/env node
/**
 * Gemini AIA Pack card runner.
 * Uses Generative Language API via fetch. Optional @google/genai if installed.
 * Desk AIs draft only. Never Yes / Stop / pay / send.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = __dirname

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'))
}

function loadSystemPrompt() {
  return fs.readFileSync(path.join(ROOT, 'GEMINI_SYSTEM_PROMPT.md'), 'utf8')
}

function loadManifest() {
  return readJson('gemini-aia-pack.json')
}

function cardOf(cardId) {
  const manifest = loadManifest()
  const card = (manifest.cards || []).find((c) => c.card_id === cardId)
  if (!card) {
    try {
      const extra = readJson('intake-followup-cards.json')
      const hit = (extra.cards || []).find((c) => c.card_id === cardId)
      if (hit) return hit
    } catch {
      /* optional */
    }
    throw new Error('Unknown card_id: ' + cardId)
  }
  return card
}

function inputText(input) {
  if (input == null) return ''
  if (typeof input === 'string') return input
  if (typeof input.input === 'string') return input.input
  if (typeof input.text === 'string') return input.text
  if (typeof input.goal === 'string') return input.goal
  if (typeof input.context === 'string') return input.context
  return JSON.stringify(input)
}

function dryRunOutput(cardId, input) {
  const text = inputText(input).toLowerCase()
  if (cardId === 'gemini-triage-card' || cardId === 'gemini-intake-card') {
    const urgent = /urgent|failed|auto-pay|billing/.test(text)
    return JSON.stringify({
      priority: urgent ? 'urgent' : 'medium',
      queue_name: urgent ? 'billing-support' : 'general',
      next_card_id: 'gemini-draft-card',
      confidence: urgent ? 0.91 : 0.72,
      extracted_entities: {},
      missing_fields: [],
    })
  }
  if (cardId === 'gemini-draft-card' || cardId === 'gemini-followup-card') {
    return [
      'Confirming we received the address update request.',
      'We will send a short summary once the billing profile is updated.',
      'No specific time promised until verified.',
      'Nothing leaves until a human taps Yes.',
    ].join('\n')
  }
  return [
    '## Workflow spec',
    '1. Classify document type.',
    '2. Check missing fields.',
    '3. If confidence is below 0.85, flag needs_review for human Yes / Stop.',
    'Never auto-send. Collect stays HOLD.',
  ].join('\n')
}

async function callGeminiGenerate({ model, system, user, temperature, apiKey }) {
  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(model) +
    ':generateContent?key=' +
    encodeURIComponent(apiKey)
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        temperature: temperature ?? 0.2,
        maxOutputTokens: 700,
      },
    }),
    signal:
      typeof AbortSignal !== 'undefined' && AbortSignal.timeout
        ? AbortSignal.timeout(20000)
        : undefined,
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) {
    const msg = (data.error && data.error.message) || 'http-' + r.status
    throw new Error(String(msg))
  }
  const parts =
    data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    data.candidates[0].content.parts
  const text = Array.isArray(parts)
    ? parts.map((p) => p && p.text).filter(Boolean).join('\n')
    : ''
  return text
}

/**
 * Run one Gemini card. Returns { ok, output, model_used, dry_run }.
 */
export async function runGeminiCard(cardId, opts = {}) {
  const card = cardOf(cardId)
  const manifest = loadManifest()
  const model = card.model || manifest.provider.default_model || 'gemini-2.0-flash'
  const system = loadSystemPrompt()
  const focus = Array.isArray(card.prompt_focus) ? card.prompt_focus.join('\n') : ''
  const user = [
    'Card: ' + cardId,
    'Title: ' + (card.title || cardId),
    'Output format: ' + (card.output_format || 'text'),
    focus ? 'Focus:\n' + focus : '',
    'Input:\n' + inputText(opts),
  ]
    .filter(Boolean)
    .join('\n\n')

  const envName = (manifest.provider && manifest.provider.auth_env) || 'GEMINI_API_KEY'
  const apiKey = process.env[envName] || process.env.GOOGLE_API_KEY || ''
  const forceDry = opts.dry_run === true || process.env.AIA_GEMINI_DRY_RUN === '1'

  if (!apiKey || forceDry) {
    return {
      ok: true,
      output: dryRunOutput(cardId, opts),
      model_used: model,
      dry_run: true,
      note: apiKey ? 'dry_run forced' : 'missing ' + envName + '; dry-run fixture used',
    }
  }

  const output = await callGeminiGenerate({
    model,
    system,
    user,
    temperature: card.temperature,
    apiKey,
  })
  return { ok: true, output, model_used: model, dry_run: false }
}

async function smoke() {
  const res = await runGeminiCard('gemini-triage-card', {
    input: {
      item_id: 'Q-smoke',
      channel: 'email',
      text: 'Urgent: Client says their policy billing address is wrong and their auto-pay failed this morning.',
    },
  })
  console.log(JSON.stringify({ smoke: 'gemini-triage-card', ...res }, null, 2))
  if (!res.output) process.exitCode = 1
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  smoke().catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
}
