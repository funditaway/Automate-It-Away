import { runGeminiCard } from './deploy_gemini_aia_pack.mjs'

export async function processQueueItem(item, pluginConfig) {
  const now = () => new Date().toISOString()

  let state = {
    ...item,
    status: 'processing',
    error: null,
    updated_at: now(),
  }

  try {
    const execution = await runGeminiCard(state.card_id, {
      input: item.payload ?? item.text ?? '',
    })

    if (state.card_id === 'gemini-triage-card' || state.card_id === 'gemini-intake-card') {
      const parsed = JSON.parse(execution.output)
      const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0
      const threshold =
        pluginConfig?.hooks?.on_queue_item_created?.auto_advance_on_confidence ?? 0.85

      state = {
        ...state,
        priority: parsed.priority ?? state.priority ?? 'medium',
        routing: {
          queue_name: parsed.queue_name ?? null,
          next_card_id: parsed.next_card_id ?? 'gemini-draft-card',
          confidence,
        },
        extracted_entities: parsed.extracted_entities ?? {},
        // ready = draft/route ready for human Yes — never auto-send
        status: confidence >= threshold ? 'ready' : 'needs_review',
        updated_at: now(),
      }
      return state
    }

    state = {
      ...state,
      draft_output: execution.output,
      status: 'needs_review',
      updated_at: now(),
    }
    return state
  } catch (err) {
    return {
      ...state,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
      updated_at: now(),
    }
  }
}
