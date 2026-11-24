import { processQueueItemV2 } from './processQueueItemV2.mjs'

export async function runCardChain(initialItem, cardIds, pluginConfig, onAudit) {
  let current = { ...initialItem }
  const steps = []

  for (const cardId of cardIds) {
    if (current.status === 'failed') break

    const stepItem = {
      ...current,
      card_id: cardId,
      payload: {
        previous_state: current,
        text: current.payload?.text ?? current.text ?? '',
        extracted_entities: current.extracted_entities ?? {},
        routing: current.routing ?? null,
      },
    }

    current = await processQueueItemV2(stepItem, pluginConfig, onAudit)
    steps.push({ card_id: cardId, status: current.status })

    if (current.status === 'failed') break
    // Stop chain on needs_review so a human can Yes / Stop before the next card.
    if (current.status === 'needs_review') break
  }

  return { final_item: current, steps }
}
