import { processQueueItemV2 } from './processQueueItemV2.mjs'
import { validateQueueItemState, validateAuditLogEntry } from './validateState.mjs'
import { loadPluginConfig } from './loadPluginConfig.mjs'

const pluginConfig = loadPluginConfig()

export async function handleQueueRequestV2(req, res) {
  const { method, url } = req

  if (method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  let body = ''
  for await (const chunk of req) body += chunk

  let payload
  try {
    payload = JSON.parse(body || '{}')
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Invalid JSON request body' }))
    return
  }

  if (url?.startsWith('/api/aia/queue/process')) {
    const check = validateQueueItemState(payload.item)
    if (!check.valid) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid queue item state', details: check.errors }))
      return
    }

    const auditLog = []
    const updatedItem = await processQueueItemV2(payload.item, pluginConfig, (entry) => {
      const auditCheck = validateAuditLogEntry(entry)
      if (!auditCheck.valid) console.warn('Invalid audit entry:', auditCheck.errors)
      auditLog.push(entry)
    })

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ item: updatedItem, audit_log: auditLog }))
    return
  }

  if (url?.startsWith('/api/aia/queue/approve')) {
    const candidate = {
      ...payload.item,
      status: 'ready',
      error: null,
      updated_at: new Date().toISOString(),
    }
    const check = validateQueueItemState(candidate)
    if (!check.valid) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Cannot approve invalid item', details: check.errors }))
      return
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        item: candidate,
        note: 'Draft ready. Human Yes still required to ship. Collect stays HOLD.',
      })
    )
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
}
