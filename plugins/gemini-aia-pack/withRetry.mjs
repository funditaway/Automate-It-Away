function isRetryableError(err) {
  const msg = err instanceof Error ? err.message : String(err)
  return /\b(429|500|502|503|504)\b|rate limit|temporarily unavailable|timeout|ECONNRESET|ETIMEDOUT/i.test(
    msg
  )
}

export async function withRetry(fn, options = {}) {
  const maxRetries = options.maxRetries ?? 3
  const baseDelayMs = options.baseDelayMs ?? 400

  let attempt = 0
  while (true) {
    try {
      return await fn()
    } catch (err) {
      if (attempt >= maxRetries || !isRetryableError(err)) {
        throw err
      }
      const jitter = Math.floor(Math.random() * 150)
      const delay = baseDelayMs * 2 ** attempt + jitter
      attempt += 1
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}
