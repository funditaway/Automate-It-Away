export function formatTimestamp(ts: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      month: 'short',
      day: 'numeric',
    }).format(new Date(ts))
  } catch {
    return new Date(ts).toISOString()
  }
}

export function relativeAge(ts: number, now = Date.now()): string {
  const sec = Math.max(0, Math.floor((now - ts) / 1000))
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  return `${hr}h ago`
}

export function agentDisplayName(agentId: string): string {
  return agentId.replace(/^agent[_-]/i, '').replace(/[_-]+/g, ' ')
}
