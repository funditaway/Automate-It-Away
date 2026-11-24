import { processQueueItem } from './processQueueItem.mjs'
import { loadPluginConfig } from './loadPluginConfig.mjs'
import { readBodyLimited } from './readBodyLimited.mjs'

const pluginConfig = loadPluginConfig()

export async function handleQueueRequest(req, res) {
  const { method, url } = req

  if (method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  const raw = await readBodyLimited(req)
  if (!raw.ok) {
    res.writeHead(raw.status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: raw.error }))
    return
  }

  let payload
  try {
    payload = JSON.parse(raw.body || '{}')
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Invalid JSON request body' }))
    return
  }

  if (url?.startsWith('/api/aia/queue/process')) {
    if (!payload.item?.item_id || !payload.item?.card_id) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'item.item_id and item.card_id are required' }))
      return
    }

    const updatedItem = await processQueueItem(payload.item, pluginConfig)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ item: updatedItem }))
    return
  }

  if (url?.startsWith('/api/aia/queue/approve')) {
    if (!payload.item?.item_id) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'item.item_id is required' }))
      return
    }

    // Human approval only marks draft ready — does not send.
    const approvedItem = {
      ...payload.item,
      status: 'ready',
      error: null,
      updated_at: new Date().toISOString(),
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ item: approvedItem, note: 'Draft ready. Human Yes still required to ship.' }))
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
}
