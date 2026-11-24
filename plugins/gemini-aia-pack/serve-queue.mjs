#!/usr/bin/env node
import http from 'node:http'
import { handleQueueRequestV2 } from './queueApiHandlerV2.mjs'

const port = Number(process.env.PORT || 3080)

const server = http.createServer((req, res) => {
  handleQueueRequestV2(req, res).catch((err) => {
    console.error('Unhandled queue server error:', err)
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Internal server error' }))
    }
  })
})

server.listen(port, () => {
  console.log('Gemini AIA Pack queue server listening on http://localhost:' + port)
  console.log('POST /api/aia/queue/process · POST /api/aia/queue/approve')
  console.log('Drafts only. Human Yes / Stop still required. Collect stays HOLD.')
})
