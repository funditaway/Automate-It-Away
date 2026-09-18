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

export function formatClock(ts: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(ts))
  } catch {
    return new Date(ts).toISOString().slice(11, 19)
  }
}

export function relativeAge(ts: number, now = Date.now()): string {
  const sec = Math.max(0, Math.floor((now - ts) / 1000))
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  return `${Math.floor(min / 60)}h ago`
}

export function shortLedgerHash(seed = Date.now()): string {
  let h = seed >>> 0
  const out: string[] = []
  for (let i = 0; i < 4; i += 1) {
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0
    out.push((h & 0xffff).toString(16).padStart(4, '0'))
  }
  return `${out[0]}${out[1].slice(0, 2)}…${out[3]}`
}
