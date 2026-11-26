/** Max JSON body for local queue API (bytes). Prevents unbounded memory use. */
export const MAX_BODY_BYTES = 256 * 1024

/**
 * Read request body with a hard size cap.
 * @returns {{ ok: true, body: string } | { ok: false, error: string, status: number }}
 */
export async function readBodyLimited(req, maxBytes = MAX_BODY_BYTES) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buf.length
    if (total > maxBytes) {
      try {
        req.destroy()
      } catch {
        /* ignore */
      }
      return {
        ok: false,
        status: 413,
        error: 'Request body too large (max ' + maxBytes + ' bytes)',
      }
    }
    chunks.push(buf)
  }
  return { ok: true, body: Buffer.concat(chunks).toString('utf8') }
}
