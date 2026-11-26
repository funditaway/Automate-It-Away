import React, { useMemo, useState } from 'react'
import { QueueItemCard } from './QueueItemCard.jsx'

/**
 * Reference desk queue workspace for the Gemini AIA Pack.
 * Calls /api/aia/queue/process and /api/aia/queue/approve. Never auto-sends.
 */
export function QueuePage({ initialItems = [], apiBaseUrl = '' }) {
  const [items, setItems] = useState(initialItems)
  const [statusFilter, setStatusFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState(null)

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((item) => {
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter
      const matchesQuery =
        !q ||
        item.item_id?.toLowerCase().includes(q) ||
        item.routing?.queue_name?.toLowerCase().includes(q)
      return matchesStatus && matchesQuery
    })
  }, [items, statusFilter, query])

  async function handleTriggerAction(item, action) {
    setBusyId(item.item_id)
    try {
      const nextItem = {
        ...item,
        card_id: action.target_card || item.card_id,
        status: 'processing',
        updated_at: new Date().toISOString(),
      }
      const res = await fetch(`${apiBaseUrl}/api/aia/queue/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: nextItem }),
      })
      const data = await res.json()
      if (data?.item) {
        setItems((prev) => prev.map((row) => (row.item_id === item.item_id ? data.item : row)))
      }
    } finally {
      setBusyId(null)
    }
  }

  async function handleApproveDraft(item) {
    setBusyId(item.item_id)
    try {
      const res = await fetch(`${apiBaseUrl}/api/aia/queue/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item }),
      })
      const data = await res.json()
      if (data?.item) {
        setItems((prev) => prev.map((row) => (row.item_id === item.item_id ? data.item : row)))
      }
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="aia-queue-page">
      <header className="aia-queue-page__toolbar">
        <h2>AIA Desk Queue ({visibleItems.length})</h2>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by item ID or queue..."
          aria-label="Filter queue items"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="all">All Statuses</option>
          <option value="needs_review">Needs Review</option>
          <option value="ready">Draft Ready</option>
          <option value="failed">Failed</option>
          <option value="completed">Done</option>
        </select>
      </header>

      <div className="aia-queue-page__list">
        {visibleItems.map((item) => (
          <div key={item.item_id} className={busyId === item.item_id ? 'is-busy' : ''}>
            <QueueItemCard
              item={item}
              onTriggerAction={handleTriggerAction}
              onApproveDraft={handleApproveDraft}
            />
          </div>
        ))}
        {visibleItems.length === 0 && (
          <p className="aia-queue-page__empty">No queue items match the current filter.</p>
        )}
      </div>
    </section>
  )
}
