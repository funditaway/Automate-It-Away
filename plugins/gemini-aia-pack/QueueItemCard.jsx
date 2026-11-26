import React from 'react'
import uiModel from './queue-ui-model.json'

/**
 * Reference desk queue card for the Gemini AIA Pack.
 * Drafts only — Approve marks Draft Ready; human Yes / Stop still required to ship.
 */
export function QueueItemCard({ item, onTriggerAction, onApproveDraft }) {
  const view = uiModel.queue_view
  const badge = view.status_badges[item.status] || { label: item.status, tone: 'neutral' }
  const confidence = item.routing?.confidence
  const showConfidence =
    typeof confidence === 'number' && confidence < view.display_rules.show_confidence_below

  return (
    <div data-status={item.status} data-tone={badge.tone} className="aia-queue-card">
      <div className="aia-queue-card__header">
        <strong>{item.item_id}</strong>
        <span className={`badge badge--${badge.tone}`}>{badge.label}</span>
        {item.priority && <span className="priority-tag">{item.priority}</span>}
        {showConfidence && (
          <span className="confidence-warn">
            Confidence: {Math.round(confidence * 100)}% (Review)
          </span>
        )}
      </div>

      {item.routing?.queue_name && (
        <p className="aia-queue-card__meta">
          Route: <strong>{item.routing.queue_name}</strong>
          {item.routing.next_card_id ? ` -> ${item.routing.next_card_id}` : ''}
        </p>
      )}

      {item.draft_output && <pre className="aia-queue-card__draft">{item.draft_output}</pre>}

      {item.error && <p className="aia-queue-card__error">{item.error}</p>}

      <div className="aia-queue-card__actions">
        {view.card_actions.map((act) => (
          <button key={act.action_id} type="button" onClick={() => onTriggerAction?.(item, act)}>
            {act.label}
          </button>
        ))}

        {item.draft_output && item.status === 'needs_review' && (
          <button type="button" onClick={() => onApproveDraft?.(item)}>
            Mark Draft Ready
          </button>
        )}
      </div>
      <p className="aia-queue-card__meta">Human Yes / Stop / Kill still required. Collect stays HOLD.</p>
    </div>
  )
}
