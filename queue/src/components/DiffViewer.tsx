import { useMemo } from 'react'

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[]
interface JsonObject {
  [key: string]: JsonValue
}

function isObject(v: unknown): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function flatten(
  value: unknown,
  prefix = '',
  out: Map<string, string> = new Map(),
): Map<string, string> {
  if (value === undefined) return out
  if (Array.isArray(value)) {
    value.forEach((item, i) => flatten(item, `${prefix}[${i}]`, out))
    return out
  }
  if (isObject(value)) {
    const keys = Object.keys(value)
    if (keys.length === 0) {
      out.set(prefix || '(object)', '{}')
      return out
    }
    keys.forEach((key) => {
      const next = prefix ? `${prefix}.${key}` : key
      flatten(value[key], next, out)
    })
    return out
  }
  out.set(prefix || '(value)', JSON.stringify(value as JsonValue))
  return out
}

interface DiffRow {
  key: string
  before?: string
  after?: string
  kind: 'same' | 'added' | 'removed' | 'changed'
}

function buildRows(
  before?: Record<string, unknown>,
  after?: Record<string, unknown>,
): DiffRow[] {
  const left = flatten(before ?? {})
  const right = flatten(after ?? {})
  const keys = Array.from(new Set([...left.keys(), ...right.keys()])).sort()
  return keys.map((key) => {
    const b = left.get(key)
    const a = right.get(key)
    if (b === undefined && a !== undefined) return { key, after: a, kind: 'added' as const }
    if (a === undefined && b !== undefined) return { key, before: b, kind: 'removed' as const }
    if (a === b) return { key, before: b, after: a, kind: 'same' as const }
    return { key, before: b, after: a, kind: 'changed' as const }
  })
}

interface DiffViewerProps {
  before?: Record<string, unknown>
  after?: Record<string, unknown>
}

export function DiffViewer({ before, after }: DiffViewerProps) {
  const rows = useMemo(() => buildRows(before, after), [before, after])

  if (!before && !after) {
    return (
      <p className="font-mono text-sm text-[var(--muted)]">No diff attached to this card.</p>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel-deep)]">
      <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-0 border-b border-[var(--line)] bg-black/25 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
        <span>Field</span>
        <span>Before</span>
        <span>After</span>
      </div>
      <ul className="max-h-64 overflow-y-auto">
        {rows.map((row) => (
          <li
            key={row.key}
            className={`grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 border-b border-[var(--line)]/60 px-3 py-2 font-mono text-[12px] last:border-b-0 ${
              row.kind === 'changed'
                ? 'bg-amber-500/5'
                : row.kind === 'added'
                  ? 'bg-teal-500/5'
                  : row.kind === 'removed'
                    ? 'bg-rose-500/5'
                    : ''
            }`}
          >
            <span className="truncate text-[var(--heading)]">{row.key}</span>
            <span
              className={`truncate ${row.kind === 'removed' || row.kind === 'changed' ? 'text-rose-300/90' : 'text-[var(--muted)]'}`}
            >
              {row.before ?? '—'}
            </span>
            <span
              className={`truncate ${row.kind === 'added' || row.kind === 'changed' ? 'text-teal-300' : 'text-[var(--muted)]'}`}
            >
              {row.after ?? '—'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
