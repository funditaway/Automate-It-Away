/**
 * Canonical JSON + SHA-256 payload proofs.
 * Object keys are sorted so the same card always hashes the same way.
 * Arrays keep their order (order is meaningful for diffs and constraints).
 */
import { createHash } from 'node:crypto'

function sortValue(value) {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(sortValue)
  const out = {}
  for (const key of Object.keys(value).sort()) {
    const child = value[key]
    if (child === undefined) continue
    out[key] = sortValue(child)
  }
  return out
}

/** Deterministic JSON: sorted keys, no whitespace. */
export function canonicalJson(value) {
  return JSON.stringify(sortValue(value))
}

/** SHA-256 hex digest of the canonical form. This is the ledger payload proof. */
export function payloadHash(value) {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')
}

export function sha256Text(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex')
}
