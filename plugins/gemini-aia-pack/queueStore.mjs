/**
 * In-memory queue store for the Gemini AIA Desk live API.
 * Used by GET /api/queue/status and id-based process/approve routes.
 * Desk AIs draft only — ready means Draft Ready, never auto-send.
 */

const nowIso = () => new Date().toISOString()

/** @type {Map<string, object>} */
const items = new Map()

function seedDefaults() {
  if (items.size > 0) return
  const seeds = [
    {
      item_id: 'AIA-101',
      status: 'queued',
      card_id: 'gemini-intake-card',
      priority: 'high',
      updated_at: nowIso(),
      title: 'Inbound Policy Quote Intake — Commercial Auto',
      routing: { queue_name: 'intake', next_card_id: 'gemini-draft-card', confidence: null },
      extracted_entities: {
        source: 'web-form',
        applicant: 'Apex Logistics LLC',
        fleetSize: 6,
        requestedEffectiveDate: '2026-12-01',
      },
      draft_output: null,
      ageMinutes: 14,
      slaMinutes: 30,
      audit: [
        { ts: '14:46:10', event: 'INGESTED_FROM_WEBHOOK' },
        { ts: '14:46:11', event: 'SCHEMA_VALIDATED (queue-card-schema.json)' },
      ],
    },
    {
      item_id: 'AIA-102',
      status: 'needs_review',
      card_id: 'gemini-followup-card',
      priority: 'urgent',
      updated_at: nowIso(),
      title: 'Broker of Record (BOR) Verification & Follow-Up',
      routing: { queue_name: 'compliance', next_card_id: null, confidence: 0.96 },
      extracted_entities: {
        carrier: 'Travelers',
        policyNumber: 'TRV-884120',
        actionRequired: 'Human sign-off on outbound carrier notice',
      },
      draft_output: JSON.stringify(
        {
          recommendation: 'APPROVE_DISPATCH',
          confidence: 0.96,
          summary: 'Signature and effective date verified against state producer license.',
          hitl: 'Draft Ready — human Yes required before send',
        },
        null,
        2
      ),
      ageMinutes: 42,
      slaMinutes: 45,
      audit: [
        { ts: '14:18:02', event: 'INGESTED_FROM_DESK' },
        { ts: '14:19:05', event: 'GEMINI_DRAFT_READY (Awaiting human gate)' },
      ],
    },
    {
      item_id: 'AIA-103',
      status: 'completed',
      card_id: 'gemini-followup-card',
      priority: 'medium',
      updated_at: nowIso(),
      title: 'Renewal Retention Outreach — Home & Umbrella Bundle',
      routing: { queue_name: 'retention', next_card_id: null, confidence: 0.91 },
      extracted_entities: {
        accountId: 'ACCT-4490',
        renewalDeltaPct: '+6.2%',
        channel: 'email',
      },
      draft_output: JSON.stringify(
        {
          subject: 'Your Upcoming Policy Renewal Review',
          status: 'DRAFT_READY_IN_OUTBOX',
          note: 'Human Yes still required — desk never auto-sends',
        },
        null,
        2
      ),
      ageMinutes: 110,
      slaMinutes: 120,
      audit: [
        { ts: '13:10:00', event: 'INGESTED_FROM_BATCH' },
        { ts: '13:10:04', event: 'GEMINI_EXECUTED (gemini-2.5-flash)' },
        { ts: '13:12:30', event: 'HUMAN_MARKED_DRAFT_READY' },
      ],
    },
  ]
  for (const item of seeds) items.set(item.item_id, item)
}

export function listQueueItems() {
  seedDefaults()
  return Array.from(items.values()).map((item) => ({ ...item }))
}

export function getQueueItem(id) {
  seedDefaults()
  const item = items.get(String(id))
  return item ? { ...item } : null
}

export function upsertQueueItem(item) {
  if (!item?.item_id) throw new Error('item_id required')
  items.set(item.item_id, { ...item, updated_at: item.updated_at || nowIso() })
  return getQueueItem(item.item_id)
}

export function appendAudit(id, event) {
  const item = getQueueItem(id)
  if (!item) return null
  const audit = Array.isArray(item.audit) ? [...item.audit] : []
  audit.push({
    ts: new Date().toTimeString().slice(0, 8),
    event: String(event),
  })
  return upsertQueueItem({ ...item, audit })
}

export function resetQueueStore() {
  items.clear()
  seedDefaults()
  return listQueueItems()
}
