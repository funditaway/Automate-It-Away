/**
 * Next-Action Recommendation Generator
 *
 * After sandbox success or CRM webhook feedback, runs a lightweight local
 * analysis and queues recommendation Decision Cards for human approval.
 * Nothing executes externally until the cryptographic queue is signed.
 */

import type { VaultDb } from './db.js'
import { GHL_API_BASE } from './ghl.js'
import type {
  ActiveDecisionCard,
  DecisionCardPayload,
  RiskLevel,
} from './types.js'

export type RecommendationKind =
  | 'follow_up_outreach'
  | 'schedule_appointment'
  | 'generate_media'
  | 'pipeline_promotion'
  | 'tag_enrichment'
  | 'generic_next'

export interface CrmFeedback {
  event?: string
  contactReplied?: boolean
  stageUpdated?: boolean
  stage?: string
  contactId?: string
  messagePreview?: string
  mediaRequested?: boolean
  appointmentRequested?: boolean
  raw?: Record<string, unknown>
}

export interface RecommendationInput {
  completedCard: ActiveDecisionCard
  feedback?: CrmFeedback
  /** When true (default), skip if parent was already a recommendation (prevents loops) */
  preventCascade?: boolean
}

export interface RecommendationResult {
  kind: RecommendationKind
  payload: DecisionCardPayload
}

function endpoint(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${GHL_API_BASE}${path.startsWith('/') ? path : `/${path}`}`
}

function contactIdFrom(card: ActiveDecisionCard, feedback?: CrmFeedback): string {
  if (feedback?.contactId) return feedback.contactId
  const before = card.payload.diffData?.before
  const after = card.payload.diffData?.after
  const fromDiff = String(
    (before && before.contactId) || (after && after.contactId) || '',
  )
  if (fromDiff) return fromDiff
  const body = card.payload.body as Record<string, unknown> | undefined
  if (body && (body.contactId || body.id)) return String(body.contactId || body.id)
  const m = card.payload.targetEndpoint.match(/contacts\/([^/?]+)/i)
  return m?.[1] || 'unknown'
}

function basePayload(
  card: ActiveDecisionCard,
  partial: Omit<DecisionCardPayload, 'agentId' | 'packName' | 'timestamp' | 'source'> & {
    agentId?: string
    packName?: string
  },
): DecisionCardPayload {
  return {
    agentId: partial.agentId || card.payload.agentId,
    packName: partial.packName || card.payload.packName,
    actionType: partial.actionType,
    riskLevel: partial.riskLevel,
    targetEndpoint: partial.targetEndpoint,
    method: partial.method,
    body: partial.body,
    headers: partial.headers,
    summary: partial.summary,
    diffData: partial.diffData,
    resourceCost: partial.resourceCost,
    source: 'recommendation',
    webhookEvent: partial.webhookEvent,
    parentCardId: card.cardId,
    recommendationKind: partial.recommendationKind,
    timestamp: Date.now(),
  }
}

function analyzeKinds(input: RecommendationInput): RecommendationKind[] {
  const { completedCard, feedback } = input
  const kinds: RecommendationKind[] = []
  const event = String(
    feedback?.event || completedCard.payload.webhookEvent || completedCard.payload.actionType || '',
  ).toLowerCase()
  const action = completedCard.payload.actionType.toLowerCase()

  if (feedback?.contactReplied || /replied|inboundmessage|conversation|sms_reply|email_reply/.test(event)) {
    kinds.push('follow_up_outreach')
    kinds.push('schedule_appointment')
  }
  if (feedback?.stageUpdated || feedback?.stage || /stage|pipeline|opportunity/.test(event + action)) {
    kinds.push('pipeline_promotion')
  }
  if (feedback?.mediaRequested || /video|media|heygen|loom/.test(event + action)) {
    kinds.push('generate_media')
  }
  if (feedback?.appointmentRequested) {
    kinds.push('schedule_appointment')
  }
  if (/contactcreate|contact_create|inbound_lead|tag/.test(event + action)) {
    kinds.push('tag_enrichment')
    kinds.push('follow_up_outreach')
  }

  if (!kinds.length) {
    if (completedCard.status === 'dispatched' || completedCard.status === 'signed') {
      kinds.push('follow_up_outreach')
    } else {
      kinds.push('generic_next')
    }
  }

  return [...new Set(kinds)]
}

function buildRecommendation(
  kind: RecommendationKind,
  card: ActiveDecisionCard,
  feedback: CrmFeedback | undefined,
  contactId: string,
): RecommendationResult {
  const parentSummary = card.payload.summary
  const stage = feedback?.stage || 'qualified'

  const recipes: Record<
    RecommendationKind,
    { actionType: string; risk: RiskLevel; method: string; path: string; summary: string; body: unknown; after: Record<string, unknown> }
  > = {
    follow_up_outreach: {
      actionType: 'RECOMMEND_FOLLOW_UP_OUTREACH',
      risk: 'high',
      method: 'POST',
      path: '/conversations/messages',
      summary: `Recommended personalized outreach to contact ${contactId} after: ${parentSummary}`,
      body: {
        type: 'SMS',
        contactId,
        message:
          feedback?.messagePreview ||
          `Hi — following up on your recent activity. Want me to book a quick next step?`,
        source: 'aia-recommendation',
        parentCardId: card.cardId,
      },
      after: { contactId, channel: 'SMS', intent: 'personalized_outreach' },
    },
    schedule_appointment: {
      actionType: 'RECOMMEND_SCHEDULE_APPOINTMENT',
      risk: 'high',
      method: 'POST',
      path: '/calendars/events',
      summary: `Recommended scheduling flow for contact ${contactId}`,
      body: {
        contactId,
        title: 'AIA suggested follow-up',
        source: 'aia-recommendation',
        parentCardId: card.cardId,
      },
      after: { contactId, intent: 'schedule_appointment' },
    },
    generate_media: {
      actionType: 'RECOMMEND_GENERATE_MEDIA',
      risk: 'medium',
      method: 'POST',
      path: '/aia/local/media-generate',
      summary: `Recommended dynamic video / media generation for contact ${contactId}`,
      body: {
        contactId,
        template: 'personalized_followup_v1',
        source: 'aia-recommendation',
        parentCardId: card.cardId,
      },
      after: { contactId, intent: 'generate_media', template: 'personalized_followup_v1' },
    },
    pipeline_promotion: {
      actionType: 'RECOMMEND_PIPELINE_PROMOTION',
      risk: 'high',
      method: 'PUT',
      path: `/opportunities/${contactId}`,
      summary: `Recommended pipeline promotion to "${stage}" for contact ${contactId}`,
      body: {
        contactId,
        stage,
        source: 'aia-recommendation',
        parentCardId: card.cardId,
      },
      after: { contactId, stage, intent: 'pipeline_promotion' },
    },
    tag_enrichment: {
      actionType: 'RECOMMEND_TAG_ENRICHMENT',
      risk: 'medium',
      method: 'PUT',
      path: `/contacts/${contactId}`,
      summary: `Recommended tag enrichment for contact ${contactId}`,
      body: {
        contactId,
        tags: ['aia-next', 'follow-queue'],
        source: 'aia-recommendation',
        parentCardId: card.cardId,
      },
      after: { contactId, tags: ['aia-next', 'follow-queue'] },
    },
    generic_next: {
      actionType: 'RECOMMEND_GENERIC_NEXT',
      risk: 'medium',
      method: 'POST',
      path: `/contacts/${contactId}/notes`,
      summary: `Recommended desk note / next review for contact ${contactId}`,
      body: {
        contactId,
        body: `Next-action review queued from card ${card.cardId}`,
        source: 'aia-recommendation',
        parentCardId: card.cardId,
      },
      after: { contactId, intent: 'desk_review' },
    },
  }

  const r = recipes[kind]
  const payload = basePayload(card, {
    actionType: r.actionType,
    riskLevel: r.risk,
    targetEndpoint: endpoint(r.path),
    method: r.method,
    body: r.body,
    summary: r.summary,
    recommendationKind: kind,
    webhookEvent: feedback?.event || card.payload.webhookEvent,
    diffData: {
      before: {
        contactId,
        parentCardId: card.cardId,
        parentStatus: card.status,
        parentAction: card.payload.actionType,
      },
      after: r.after,
    },
  })

  return { kind, payload }
}

/**
 * Analyze a completed (or feedback-bearing) card and produce recommendation payloads.
 * Does not enqueue — call `enqueueRecommendations` to push into the sovereign queue.
 */
export function recommendNextActions(input: RecommendationInput): RecommendationResult[] {
  const preventCascade = input.preventCascade !== false
  if (preventCascade && input.completedCard.payload.source === 'recommendation') {
    return []
  }
  // Only recommend after successful completion unless explicit CRM feedback is provided
  const okStatus =
    input.completedCard.status === 'signed' ||
    input.completedCard.status === 'dispatched'
  if (!okStatus && !input.feedback) return []

  const contactId = contactIdFrom(input.completedCard, input.feedback)
  const kinds = analyzeKinds(input)
  // Cap fan-out: primary + optional secondary
  const limited = kinds.slice(0, 2)
  return limited.map((kind) =>
    buildRecommendation(kind, input.completedCard, input.feedback, contactId),
  )
}

/** Enqueue recommendation cards into the local SQLite queue (pending human YES). */
export function enqueueRecommendations(
  vault: VaultDb,
  input: RecommendationInput,
): ActiveDecisionCard[] {
  const recs = recommendNextActions(input)
  return recs.map((r) => vault.enqueueCard(r.payload))
}

/**
 * Convenience: CRM feedback webhook → recommendations anchored to a prior card
 * or a synthetic completed shell when no parent exists.
 */
export function recommendationsFromFeedback(
  vault: VaultDb,
  feedback: CrmFeedback,
  anchor?: ActiveDecisionCard,
): ActiveDecisionCard[] {
  const shell: ActiveDecisionCard =
    anchor ||
    ({
      cardId: `feedback-anchor-${Date.now()}`,
      status: 'dispatched',
      payload: {
        agentId: 'agent_ghl_inbound',
        packName: 'GoHighLevel Lead Nurture Pack',
        actionType: String(feedback.event || 'CRM_FEEDBACK'),
        riskLevel: 'medium',
        targetEndpoint: endpoint(`/contacts/${feedback.contactId || 'unknown'}`),
        summary: `CRM feedback: ${feedback.event || 'update'}`,
        source: 'ghl_webhook',
        webhookEvent: feedback.event,
        diffData: {
          before: { contactId: feedback.contactId },
          after: { contactId: feedback.contactId, feedback },
        },
        timestamp: Date.now(),
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } satisfies ActiveDecisionCard)

  return enqueueRecommendations(vault, {
    completedCard: shell,
    feedback,
    preventCascade: Boolean(anchor && anchor.payload.source === 'recommendation'),
  })
}
