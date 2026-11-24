#!/usr/bin/env node
import http from 'node:http'
import { handleQueueRequestV2 } from './queueApiHandlerV2.mjs'

const port = Number(process.env.PORT || 3080)
// Loopback only — matches workers/aia-meta-worker.js and command tests.
// Never bind 0.0.0.0: this handler has no auth and can spend GEMINI_API_KEY.
const host = process.env.AIA_GEMINI_BIND || '127.0.0.1'

const server = http.createServer((req, res) => {
  handleQueueRequestV2(req, res).catch((err) => {
    console.error('Unhandled queue server error:', err)
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Internal server error' }))
    }
  })
})

server.listen(port, host, () => {
  console.log('Gemini AIA Pack queue server listening on http://' + host + ':' + port)
  console.log('POST /api/aia/queue/process · POST /api/aia/queue/approve')
  console.log('Loopback only. No auth. Drafts only. Human Yes / Stop still required.')
})
