/**
 * Worker entry (plain JS): executes agent logic.js with an intercepted network bridge.
 * Kept as .js so Worker threads load without a TypeScript loader.
 */
import { parentPort, workerData } from 'node:worker_threads'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { randomUUID } from 'node:crypto'

if (!parentPort) {
  throw new Error('sandboxWorker must run as a worker_thread')
}

const port = parentPort
const { scriptSource, context, scriptPath } = workerData

const pending = new Map()

port.on('message', (msg) => {
  if (msg.type !== 'auth_result' || !msg.requestId) return
  const waiter = pending.get(msg.requestId)
  if (!waiter) return
  pending.delete(msg.requestId)
  if (msg.authorized) {
    waiter.resolve({
      authorized: true,
      cardId: msg.cardId,
      signature: msg.signature,
    })
  } else {
    waiter.reject(new Error(msg.reason || 'Human rejected or authorization timed out'))
  }
})

function isSensitiveUrl(url) {
  const u = String(url || '').toLowerCase()
  return (
    /leadconnectorhq\.com|gohighlevel|googleapis|api\.|webhook|smtp|rpc|0x[a-f0-9]{6}/i.test(u) ||
    u.startsWith('http://') ||
    u.startsWith('https://')
  )
}

function requestAuthorization(req) {
  const requestId = randomUUID()
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject })
    port.postMessage({ type: 'sensitive_request', requestId, request: req })
  })
}

const bridge = {
  async http(req) {
    const method = (req.method || 'POST').toUpperCase()
    if (!isSensitiveUrl(req.url) && method === 'GET') {
      return { authorized: true, skipped: true, note: 'non-sensitive GET allowed' }
    }
    return requestAuthorization({
      method,
      url: req.url,
      headers: req.headers,
      body: req.body,
      actionType: req.actionType,
      summary: req.summary,
      riskLevel: req.riskLevel,
    })
  },
  async fetch(url, init = {}) {
    return bridge.http({
      method: init.method || 'GET',
      url,
      headers: init.headers,
      body: init.body,
    })
  },
}

async function main() {
  const require = createRequire(scriptPath || import.meta.url)
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Buffer,
    aia: bridge,
    fetch: (...args) => bridge.fetch(...args),
    require,
    module: { exports: {} },
    exports: {},
    context: context || {},
    ...context,
  }
  sandbox.global = sandbox
  sandbox.globalThis = sandbox

  const wrapped = `
    (async () => {
      ${scriptSource}
      if (typeof run === 'function') return await run(context, aia);
      if (typeof main === 'function') return await main(context, aia);
      return module.exports;
    })()
  `
  const script = new vm.Script(wrapped, { filename: scriptPath || 'logic.js' })
  const result = await script.runInNewContext(sandbox, { timeout: 60_000 })
  port.postMessage({ type: 'done', result })
}

main().catch((err) => {
  port.postMessage({
    type: 'error',
    error: err instanceof Error ? err.message : String(err),
  })
})
