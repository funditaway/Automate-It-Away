/**
 * Meta-Prompt Synthesis Engine
 *
 * Compiles dynamic system prompts and agent payloads from inbound webhooks
 * (e.g. GoHighLevel) plus local vault context. Prompt text is assembled from
 * named templates with path slots — never from hardcoded strings in the
 * webhook handler.
 */

import { GHL_API_BASE, riskForGhlEvent } from './ghl.js'
import type { DecisionCardPayload, RiskLevel } from './types.js'

export interface VaultContext {
  credentials?: Array<{ label: string; provider: string; last4?: string }>
  packName?: string
  agentId?: string
  deskRules?: string[]
  /** Extra free-form vault / desk metadata available to templates */
  meta?: Record<string, unknown>
}

export interface PromptTemplate {
  id: string
  /** Matches webhook type/event via substring (case-insensitive) */
  match: string[]
  system: string
  instructions: string
  constraints: string[]
  /** JSON Schema–like expected agent output */
  outputSchema: Record<string, unknown>
  defaultAction: {
    method: string
    endpointTemplate: string
    bodyTemplate: Record<string, unknown>
  }
  riskHint?: RiskLevel
}

export interface MetaPromptBundle {
  templateId: string
  systemPrompt: string
  agentInstructions: string
  constraints: string[]
  outputSchema: Record<string, unknown>
  sandboxContext: Record<string, unknown>
  decisionPayload: DecisionCardPayload
}

/** Slot grammar: {{path.to.value}} with optional {{path|fallback}} */
const SLOT_RE = /\{\{\s*([a-zA-Z0-9_.]+)(?:\|([^}]*))?\s*\}\}/g

function getPath(obj: unknown, path: string): unknown {
  const parts = path.split('.')
  let cur: unknown = obj
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

/** Compile a template string against a variable bag. */
export function compileTemplate(template: string, vars: Record<string, unknown>): string {
  return template.replace(SLOT_RE, (_m, path: string, fallback?: string) => {
    const val = getPath(vars, path)
    if (val === undefined || val === null || val === '') {
      return fallback !== undefined ? String(fallback) : ''
    }
    if (typeof val === 'object') return JSON.stringify(val)
    return String(val)
  })
}

function compileDeep<T>(value: T, vars: Record<string, unknown>): T {
  if (typeof value === 'string') return compileTemplate(value, vars) as T
  if (Array.isArray(value)) return value.map((v) => compileDeep(v, vars)) as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = compileDeep(v, vars)
    }
    return out as T
  }
  return value
}

function normalizeEndpoint(target: string): string {
  if (/^https?:\/\//i.test(target)) return target
  const path = target.startsWith('/') ? target : `/${target}`
  return `${GHL_API_BASE}${path}`
}

/**
 * Built-in prompt fragment library. Handlers select + compile these;
 * they do not embed finished prompt prose themselves.
 */
export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'ghl.contact.created',
    match: ['contactcreate', 'contact.created', 'contact_create', 'inbound_lead'],
    system:
      'You are the {{agentId|agent_ghl}} desk agent for pack "{{packName}}". ' +
      'Operate local-first: draft only. Never send, pay, or bind without human YES on the cryptographic queue.',
    instructions:
      'Inbound lead {{contact.fullName|contact.name|unknown}} ({{contact.id|contactId}}) arrived via {{event}}. ' +
      'Qualify the lead using vault providers [{{vault.providers|none}}], then propose a CRM write-back that tags and stages the contact. ' +
      'Emit a JSON diff (before/after) matching the output schema.',
    constraints: [
      'No autonomous outbound HTTP — all writes pause as Active Decision Cards',
      'Secrets stay in the local vault; never echo credential material',
      'Collect / money actions remain HOLD until human sign-off',
      '{{deskRules|Follow desk When → If → Then rules}}',
    ],
    outputSchema: {
      type: 'object',
      required: ['diffData', 'suggestedAction'],
      properties: {
        diffData: {
          type: 'object',
          properties: {
            before: { type: 'object' },
            after: { type: 'object' },
          },
        },
        suggestedAction: {
          type: 'object',
          properties: {
            method: { type: 'string' },
            endpoint: { type: 'string' },
            body: { type: 'object' },
          },
        },
      },
    },
    defaultAction: {
      method: 'PUT',
      endpointTemplate: '/contacts/{{contact.id|contactId}}',
      bodyTemplate: {
        tags: ['aia-reviewed', 'nurture'],
        source: 'aia-meta-prompt',
        customFields: { aiaEvent: '{{event}}' },
      },
    },
    riskHint: 'high',
  },
  {
    id: 'ghl.opportunity.stage',
    match: ['opportunitystage', 'opportunity.stage', 'pipeline', 'stageupdate'],
    system:
      'You are {{agentId|agent_ghl}} promoting pipeline state for "{{packName}}". ' +
      'Stage changes are high-risk; queue a Decision Card before CRM mutation.',
    instructions:
      'Stage update for contact {{contact.id|contactId}}: event {{event}}. ' +
      'Compare prior pipeline state to the requested after-state and propose the minimal authorized write.',
    constraints: [
      'Do not skip human authorization for pipeline writes',
      'Preserve provenance: before/after must be explicit JSON diffs',
      'Vault providers in scope: {{vault.providers|none}}',
    ],
    outputSchema: {
      type: 'object',
      required: ['diffData'],
      properties: {
        diffData: { type: 'object' },
        nextStage: { type: 'string' },
      },
    },
    defaultAction: {
      method: 'PUT',
      endpointTemplate: '/opportunities/{{opportunity.id|opportunityId|contact.id|contactId}}',
      bodyTemplate: {
        stage: '{{opportunity.stage|pipeline.stage|qualified}}',
        source: 'aia-meta-prompt',
      },
    },
    riskHint: 'high',
  },
  {
    id: 'ghl.contact.replied',
    match: ['inboundmessage', 'contact.replied', 'sms_reply', 'email_reply', 'conversation'],
    system:
      'You are {{agentId|agent_ghl}} drafting a reply plan for "{{packName}}". ' +
      'Outreach is recommendation-only until the local queue is signed.',
    instructions:
      'Contact {{contact.id|contactId}} replied (event {{event}}). ' +
      'Draft a personalized follow-up action and any scheduling or media-generation requests for human review.',
    constraints: [
      'Never send messages without YES on the desk queue',
      'Prefer short, personalized drafts over bulk blasts',
      'Desk rules: {{deskRules|standard nurture}}',
    ],
    outputSchema: {
      type: 'object',
      required: ['diffData', 'suggestedAction'],
      properties: {
        replyDraft: { type: 'string' },
        suggestedAction: { type: 'object' },
        diffData: { type: 'object' },
      },
    },
    defaultAction: {
      method: 'POST',
      endpointTemplate: '/conversations/messages',
      bodyTemplate: {
        type: 'SMS',
        contactId: '{{contact.id|contactId}}',
        message: 'Thanks for getting back — locking a next step for human review.',
        source: 'aia-meta-prompt',
      },
    },
    riskHint: 'high',
  },
  {
    id: 'ghl.generic',
    match: ['*'],
    system:
      'You are the sovereign AIA desk agent {{agentId|agent_ghl}} for pack "{{packName}}". ' +
      'Compile a Decision Card from the inbound webhook; execute nothing externally without queue sign-off.',
    instructions:
      'Process webhook event {{event}} for contact {{contact.id|contactId|unknown}}. ' +
      'Produce agent instructions, constraints, and a JSON before/after diff for human authorization.',
    constraints: [
      'Sovereign boundary: local cryptographic queue gates all external side effects',
      'Use vault context only as non-secret metadata (providers: {{vault.providers|none}})',
      'Output must satisfy the declared schema',
    ],
    outputSchema: {
      type: 'object',
      required: ['diffData', 'suggestedAction'],
      properties: {
        diffData: { type: 'object' },
        suggestedAction: { type: 'object' },
      },
    },
    defaultAction: {
      method: 'PUT',
      endpointTemplate: '/contacts/{{contact.id|contactId|unknown}}',
      bodyTemplate: {
        tags: ['aia-reviewed'],
        source: 'aia-meta-prompt',
      },
    },
  },
]

export function selectTemplate(
  event: string,
  templates: PromptTemplate[] = PROMPT_TEMPLATES,
): PromptTemplate {
  const needle = event.toLowerCase().replace(/[^a-z0-9._]/g, '')
  for (const t of templates) {
    if (t.match.includes('*')) continue
    if (t.match.some((m) => needle.includes(m.replace(/[^a-z0-9._]/g, '')))) return t
  }
  return templates.find((t) => t.match.includes('*')) || templates[templates.length - 1]
}

function buildVars(
  body: Record<string, unknown>,
  vault: VaultContext,
  event: string,
): Record<string, unknown> {
  const contact = (body.contact || body.data || body) as Record<string, unknown>
  const opportunity = (body.opportunity || body.opportunityData || {}) as Record<string, unknown>
  const providers = (vault.credentials || [])
    .map((c) => c.provider)
    .filter(Boolean)
    .join(', ')
  return {
    event,
    agentId: vault.agentId || body.agentId || 'agent_ghl_inbound',
    packName: vault.packName || body.packName || 'GoHighLevel Lead Nurture Pack',
    contact,
    contactId: contact.id || contact.contactId || body.contactId || 'unknown',
    opportunity,
    opportunityId: opportunity.id || body.opportunityId,
    pipeline: body.pipeline || {},
    locationId: body.locationId || contact.locationId || '',
    deskRules: (vault.deskRules || []).join('; ') || undefined,
    vault: {
      providers: providers || undefined,
      credentialCount: (vault.credentials || []).length,
      meta: vault.meta || {},
    },
    webhook: body,
  }
}

/**
 * Synthesize a meta-prompt bundle + Decision Card payload from a raw webhook.
 */
export function synthesizeMetaPrompt(
  body: Record<string, unknown>,
  vault: VaultContext = {},
  templates: PromptTemplate[] = PROMPT_TEMPLATES,
): MetaPromptBundle {
  const event = String(body.type || body.event || body.webhookId || 'ghl.contact.created')
  const template = selectTemplate(event, templates)
  const vars = buildVars(body, vault, event)

  const systemPrompt = compileTemplate(template.system, vars)
  const agentInstructions = compileTemplate(template.instructions, vars)
  const constraints = template.constraints.map((c) => compileTemplate(c, vars))

  const contact = vars.contact as Record<string, unknown>
  const contactId = String(vars.contactId)

  const suggestedFromBody =
    typeof body.suggestedAction === 'object' && body.suggestedAction
      ? (body.suggestedAction as { method?: string; endpoint?: string; body?: unknown })
      : null

  const compiledAction = {
    method: suggestedFromBody?.method || template.defaultAction.method,
    endpoint: suggestedFromBody?.endpoint
      ? String(suggestedFromBody.endpoint)
      : compileTemplate(template.defaultAction.endpointTemplate, vars),
    body:
      suggestedFromBody?.body ??
      compileDeep(template.defaultAction.bodyTemplate, vars),
  }

  const riskLevel: RiskLevel =
    template.riskHint || riskForGhlEvent(event)

  const agentId = String(vars.agentId)
  const packName = String(vars.packName)

  const decisionPayload: DecisionCardPayload = {
    agentId,
    packName,
    actionType: String(
      body.actionType || `GHL_${event}`.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase(),
    ),
    riskLevel,
    targetEndpoint: normalizeEndpoint(compiledAction.endpoint),
    method: compiledAction.method.toUpperCase(),
    body: compiledAction.body,
    summary: compileTemplate(
      'Meta-prompt {{templateId}}: {{event}} → authorize {{method}} for contact {{contactId}}',
      {
        templateId: template.id,
        event,
        method: compiledAction.method.toUpperCase(),
        contactId,
      },
    ),
    diffData: {
      before: {
        contactId,
        status: contact.status || 'inbound',
        tags: contact.tags || [],
        stage: (vars.opportunity as Record<string, unknown>).stage || null,
      },
      after: {
        contactId,
        status: 'authorized_writeback',
        action: compiledAction,
        metaPromptId: template.id,
      },
    },
    source: 'ghl_webhook',
    webhookEvent: event,
    metaPrompt: {
      templateId: template.id,
      systemPrompt,
      agentInstructions,
      constraints,
      outputSchema: template.outputSchema,
    },
    timestamp: Date.now(),
  }

  return {
    templateId: template.id,
    systemPrompt,
    agentInstructions,
    constraints,
    outputSchema: template.outputSchema,
    sandboxContext: {
      event,
      contactId,
      contact,
      metaPrompt: {
        templateId: template.id,
        systemPrompt,
        agentInstructions,
        constraints,
        outputSchema: template.outputSchema,
      },
      suggestedAction: compiledAction,
      vaultProviders: (vault.credentials || []).map((c) => c.provider),
    },
    decisionPayload,
  }
}
