import crypto from 'node:crypto'
import { runGeminiCard } from './deploy_gemini_aia_pack.mjs'
import { withRetry } from './withRetry.mjs'

function makeAuditEntry({
  itemId,
  cardId,
  modelUsed,
  eventType,
  confidence = null,
  actor = 'system',
  notes = null,
}) {
  return {
    event_id: 'aud_' + crypto.randomUUID(),
    item_id: itemId,
    card_id: cardId,
    model_used: modelUsed ?? null,
    event_type: eventType,
    confidence,
    actor,
    notes,
    timestamp: new Date().toISOString(),
  }
}

export async function processQueueItemV2(item, pluginConfig, onAudit) {
  const now = () => new Date().toISOString()
  const emitAudit = async (entry) => {
    if (typeof onAudit === 'function') await onAudit(entry)
  }

  let state = {
    ...item,
    status: 'processing',
    error: null,
    updated_at: now(),
  }

  await emitAudit(
    makeAuditEntry({
      itemId: state.item_id,
      cardId: state.card_id,
      modelUsed: state.model ?? null,
      eventType: 'card_executed',
      notes: 'Started queue item processing',
    })
  )

  try {
    const execution = await withRetry(() =>
      runGeminiCard(state.card_id, {
        input: item.payload ?? item.text ?? '',
      })
    )

    if (state.card_id === 'gemini-triage-card' || state.card_id === 'gemini-intake-card') {
      const parsed = JSON.parse(execution.output)
      const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0
      const threshold =
        pluginConfig?.hooks?.on_queue_item_created?.auto_advance_on_confidence ?? 0.85
      const autoAdvance = confidence >= threshold

      state = {
        ...state,
        priority: parsed.priority ?? state.priority ?? 'medium',
        routing: {
          queue_name: parsed.queue_name ?? null,
          next_card_id: parsed.next_card_id ?? 'gemini-draft-card',
          confidence,
        },
        extracted_entities: parsed.extracted_entities ?? {},
        status: autoAdvance ? 'ready' : 'needs_review',
        updated_at: now(),
      }

      await emitAudit(
        makeAuditEntry({
          itemId: state.item_id,
          cardId: state.card_id,
          modelUsed: execution.model_used,
          eventType: autoAdvance ? 'auto_advanced' : 'routed_to_review',
          confidence,
          notes: autoAdvance
            ? 'Confidence ' + confidence + ' met threshold ' + threshold + ' (route only; human Yes still required)'
            : 'Confidence ' + confidence + ' below threshold ' + threshold + '; routed to review',
        })
      )

      return state
    }

    state = {
      ...state,
      draft_output: execution.output,
      status: 'needs_review',
      updated_at: now(),
    }

    await emitAudit(
      makeAuditEntry({
        itemId: state.item_id,
        cardId: state.card_id,
        modelUsed: execution.model_used,
        eventType: 'routed_to_review',
        notes: 'Generated output requires human Yes before action',
      })
    )

    return state
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    state = {
      ...state,
      status: 'failed',
      error: message,
      updated_at: now(),
    }

    await emitAudit(
      makeAuditEntry({
        itemId: state.item_id,
        cardId: state.card_id,
        modelUsed: state.model ?? null,
        eventType: 'card_failed',
        notes: message,
      })
    )

    return state
  }
}
