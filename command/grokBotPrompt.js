/**
 * Grok (SpaceXAI / xAI) meta-prompt synthesizer.
 *
 * Asks the model for a structured decision card. If the key is missing, the
 * call fails, or the payload is not usable JSON, a local template compiles
 * the same shape so ingest never blocks on the network.
 *
 * Nothing in this module executes a side effect. It only drafts a card.
 */
import { DEFAULT_CARD_UI } from './lib/cardUi.js'

const RISK_LEVELS = new Set(['low', 'medium', 'high', 'critical'])

export { DEFAULT_CARD_UI }

/** SpaceXAI is the xAI Grok chat-completions endpoint. Override with env. */
export function grokConfig(overrides = {}) {
  return {
    apiKey:
      overrides.apiKey ??
      process.env.AIA_SPACEXAI_API_KEY ??
      process.env.AIA_GROK_API_KEY ??
      process.env.XAI_API_KEY ??
      '',
    apiUrl:
      overrides.apiUrl ??
      process.env.AIA_SPACEXAI_URL ??
      process.env.AIA_GROK_URL ??
      'https://api.x.ai/v1/chat/completions',
    model: overrides.model ?? process.env.AIA_GROK_MODEL ?? 'grok-3',
  }
}

export function inferRisk(text) {
  const e = String(text || '').toLowerCase()
  if (/delete|purge|destroy|broadcast|transfer|drain|pay|wire|kill/.test(e)) return 'critical'
  if (/contact|opportunity|sms|domain|unlock|arm|stage|appointment|register/.test(e)) return 'high'
  if (/tag|note|telemetry|cycle|task|status/.test(e)) return 'medium'
  return 'low'
}

function eventToAction(event) {
  const cleaned = String(event || 'inbound')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .toUpperCase()
  return cleaned || 'INBOUND_REVIEW'
}

/** Drop credential-shaped fields before they can reach a model prompt. */
export function publicView(value) {
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(publicView)
  const out = {}
  for (const [key, child] of Object.entries(value)) {
    if (/secret|token|password|apikey|authorization|private/i.test(key)) continue
    out[key] = publicView(child)
  }
  return out
}

function clampRisk(level, fallback) {
  const value = String(level || '').toLowerCase()
  return RISK_LEVELS.has(value) ? value : fallback
}

export function localSynthesis({ inbound, pack }) {
  const event = inbound?.event || 'inbound'
  const packName = pack?.name || inbound?.packName || 'Unassigned Pack'
  const risk = clampRisk(inbound?.riskLevel, inferRisk(`${event} ${inbound?.summary || ''} ${inbound?.actionType || ''}`))
  const summary =
    inbound?.summary ||
    `${event}: review this ${packName} event before any side effect.`
  const rails = Array.isArray(pack?.rails) ? pack.rails.slice(0, 6).map(String) : []

  return {
    source: 'local',
    metaPrompt: {
      templateId: 'local.fallback',
      source: 'local',
      systemPrompt:
        `You are the ${packName} desk agent. Draft only. ` +
        'Never send, pay, arm, or broadcast without an explicit human YES.',
      agentInstructions: summary,
      constraints: [
        'No silent background mutations',
        'Authorize, reject, and delegate must be signed into ledger.ndjson',
        ...rails,
      ],
    },
    cardUi: null,
    decision: {
      summary,
      riskLevel: risk,
      actionType: inbound?.actionType || eventToAction(event),
      diffData: inbound?.diffData || {
        before: { status: 'inbound', event },
        after: { status: 'pending_human_yes' },
      },
      targetEndpoint: inbound?.targetEndpoint || '',
      method: inbound?.method || 'POST',
    },
  }
}

function parseModelJson(content) {
  const text = String(content || '').trim()
  if (!text) return null
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1] : text
  const parsed = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  return parsed
}

function fromModel(parsed, inbound, pack) {
  const fallback = localSynthesis({ inbound, pack })
  const riskLevel = clampRisk(parsed.riskLevel, fallback.decision.riskLevel)
  const summary = String(parsed.summary || fallback.decision.summary)
  const constraints = Array.isArray(parsed.constraints)
    ? parsed.constraints.map(String).slice(0, 12)
    : fallback.metaPrompt.constraints
  const cardUi = parsed.card_ui && typeof parsed.card_ui === 'object' ? parsed.card_ui : null

  return {
    source: 'grok',
    metaPrompt: {
      templateId: 'grok.spacexai',
      source: 'grok',
      systemPrompt: String(parsed.systemPrompt || fallback.metaPrompt.systemPrompt),
      agentInstructions: String(parsed.agentInstructions || summary),
      constraints,
    },
    cardUi,
    decision: {
      summary,
      riskLevel,
      actionType: String(parsed.actionType || fallback.decision.actionType),
      diffData:
        parsed.diffData && typeof parsed.diffData === 'object'
          ? parsed.diffData
          : fallback.decision.diffData,
      targetEndpoint: String(parsed.targetEndpoint || fallback.decision.targetEndpoint || ''),
      method: String(parsed.method || fallback.decision.method || 'POST').toUpperCase(),
    },
  }
}

async function callGrok({ inbound, pack, fetchImpl, apiKey, apiUrl, model }) {
  const safe = publicView({ inbound, pack: pack ? { id: pack.id, name: pack.name, rails: pack.rails } : null })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetchImpl(apiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You draft AIA decision cards. Reply with JSON only. ' +
              'Fields: summary, riskLevel (low|medium|high|critical), actionType, ' +
              'systemPrompt, agentInstructions, constraints (array of strings), ' +
              'diffData {before, after}, card_ui {title, subtitle}. ' +
              'Never include secrets. Never claim an action already ran.',
          },
          { role: 'user', content: JSON.stringify(safe) },
        ],
      }),
      signal: controller.signal,
    })
    if (!res.ok) return null
    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content
    const parsed = parseModelJson(content)
    if (!parsed) return null
    return fromModel(parsed, inbound, pack)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Produce a decision draft. Network failure falls back to the local template.
 */
export async function synthesizeDecision(input) {
  const cfg = grokConfig(input || {})
  if (cfg.apiKey) {
    try {
      const remote = await callGrok({
        inbound: input.inbound,
        pack: input.pack,
        fetchImpl: input.fetchImpl || fetch,
        ...cfg,
      })
      if (remote) return remote
    } catch {
      /* keep the queue moving */
    }
  }
  return localSynthesis(input || {})
}
