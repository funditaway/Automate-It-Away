#!/usr/bin/env node
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleQueueRequestV2 } from './queueApiHandlerV2.mjs'
import { processQueueItemV2 } from './processQueueItemV2.mjs'
import { loadPluginConfig } from './loadPluginConfig.mjs'
import { readBodyLimited } from './readBodyLimited.mjs'
import {
  listQueueItems,
  getQueueItem,
  upsertQueueItem,
  appendAudit,
} from './queueStore.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const port = Number(process.env.PORT || 3080)
// Loopback only — matches workers/aia-meta-worker.js and command tests.
// Never bind 0.0.0.0: this handler has no auth and can spend GEMINI_API_KEY.
const host = process.env.AIA_GEMINI_BIND || '127.0.0.1'
const pluginConfig = loadPluginConfig()

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
}

function sendJson(res, status, body) {
  // Same-origin only — desk is served from this daemon. No CORS headers:
  // wildcard ACAO would let other browser origins hit this unauthenticated
  // loopback API (confused deputy / GEMINI_API_KEY spend).
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
  })
  res.end(JSON.stringify(body))
}

function serveStatic(req, res) {
  let urlPath = (req.url || '/').split('?')[0]
  if (urlPath === '/' || urlPath === '/desk') urlPath = '/gemini-aia-desk.html'
  const safe = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '')
  const filePath = path.join(__dirname, safe)
  if (!filePath.startsWith(__dirname)) {
    sendJson(res, 403, { error: 'Forbidden' })
    return true
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return false
  }
  const ext = path.extname(filePath)
  const type = MIME[ext] || 'application/octet-stream'
  res.writeHead(200, { 'Content-Type': type })
  fs.createReadStream(filePath).pipe(res)
  return true
}

async function readJsonBody(req) {
  const raw = await readBodyLimited(req)
  if (!raw.ok) return { ok: false, status: raw.status, error: raw.error }
  try {
    return { ok: true, body: JSON.parse(raw.body || '{}') }
  } catch {
    return { ok: false, status: 400, error: 'Invalid JSON request body' }
  }
}

async function handleDeskQueueApi(req, res) {
  const url = (req.url || '').split('?')[0]
  const method = req.method || 'GET'

  if (method === 'GET' && (url === '/api/queue/status' || url === '/api/aia/queue/status')) {
    sendJson(res, 200, { items: listQueueItems() })
    return true
  }

  if (method === 'POST' && (url === '/api/queue/process' || url === '/api/aia/queue/process-by-id')) {
    const parsed = await readJsonBody(req)
    if (!parsed.ok) {
      sendJson(res, parsed.status, { error: parsed.error })
      return true
    }
    const id = parsed.body.id || parsed.body.item_id || parsed.body.item?.item_id
    if (!id) {
      sendJson(res, 400, { error: 'id required' })
      return true
    }
    const existing = getQueueItem(id)
    if (!existing) {
      sendJson(res, 404, { error: 'Item not found', id })
      return true
    }
    const auditLog = []
    const updated = await processQueueItemV2(
      { ...existing, status: 'processing', updated_at: new Date().toISOString() },
      pluginConfig,
      (entry) => auditLog.push(entry)
    )
    const saved = upsertQueueItem({
      ...existing,
      ...updated,
      title: existing.title,
      ageMinutes: existing.ageMinutes,
      slaMinutes: existing.slaMinutes,
      audit: [
        ...(existing.audit || []),
        { ts: new Date().toTimeString().slice(0, 8), event: 'API_PROCESS_OK' },
      ],
    })
    sendJson(res, 200, { item: saved, audit_log: auditLog })
    return true
  }

  if (method === 'POST' && (url === '/api/queue/approve' || url === '/api/aia/queue/approve-by-id')) {
    const parsed = await readJsonBody(req)
    if (!parsed.ok) {
      sendJson(res, parsed.status, { error: parsed.error })
      return true
    }
    const id = parsed.body.id || parsed.body.item_id || parsed.body.item?.item_id
    if (!id) {
      sendJson(res, 400, { error: 'id required' })
      return true
    }
    const existing = getQueueItem(id)
    if (!existing) {
      sendJson(res, 404, { error: 'Item not found', id })
      return true
    }
    const saved = appendAudit(
      id,
      'API_APPROVE_OK (Draft Ready — human Yes still ships)'
    )
    const ready = upsertQueueItem({
      ...saved,
      status: 'ready',
      error: null,
      updated_at: new Date().toISOString(),
    })
    sendJson(res, 200, {
      item: ready,
      note: 'Draft ready. Human Yes still required to ship. Collect stays HOLD.',
    })
    return true
  }

  return false
}

const server = http.createServer(async (req, res) => {
  try {
    if (await handleDeskQueueApi(req, res)) return

    const url = (req.url || '').split('?')[0]
    if (
      url.startsWith('/api/aia/queue/process') ||
      url.startsWith('/api/aia/queue/approve')
    ) {
      await handleQueueRequestV2(req, res)
      return
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      if (serveStatic(req, res)) return
    }

    sendJson(res, 404, { error: 'Not found' })
  } catch (err) {
    console.error('Unhandled queue server error:', err)
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'Internal server error' })
    }
  }
})

server.listen(port, host, () => {
  console.log('Gemini AIA Pack queue server listening on http://' + host + ':' + port)
  console.log('Desk UI  http://' + host + ':' + port + '/gemini-aia-desk.html')
  console.log('GET  /api/queue/status')
  console.log('POST /api/queue/process · POST /api/queue/approve  ({ id })')
  console.log('POST /api/aia/queue/process · POST /api/aia/queue/approve  ({ item })')
  console.log('Loopback only. No auth. Drafts only. Human Yes / Stop still required.')
})
