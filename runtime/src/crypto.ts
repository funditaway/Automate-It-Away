import { createHash, generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface LocalKeypair {
  publicKeyPem: string
  privateKeyPem: string
  publicKeyHex: string
}

function pemToRawPublicHex(publicKeyPem: string): string {
  // SPKI for Ed25519: 12-byte ASN.1 prefix + 32-byte raw key
  const der = Buffer.from(
    publicKeyPem
      .replace(/-----BEGIN PUBLIC KEY-----/, '')
      .replace(/-----END PUBLIC KEY-----/, '')
      .replace(/\s+/g, ''),
    'base64',
  )
  return der.subarray(der.length - 32).toString('hex')
}

/** Deterministic JSON: sorted object keys, stable arrays, no whitespace. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value))
}

function sortValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(sortValue)
  const obj = value as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(obj).sort()) {
    out[key] = sortValue(obj[key])
  }
  return out
}

export function payloadHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')
}

export function defaultKeyDir(baseDir: string): string {
  return join(baseDir, '.keys')
}

export function loadOrCreateKeypair(keyDir: string): LocalKeypair {
  mkdirSync(keyDir, { recursive: true })
  const pubPath = join(keyDir, 'ed25519.pub.pem')
  const privPath = join(keyDir, 'ed25519.pem')

  if (existsSync(pubPath) && existsSync(privPath)) {
    const publicKeyPem = readFileSync(pubPath, 'utf8')
    const privateKeyPem = readFileSync(privPath, 'utf8')
    return {
      publicKeyPem,
      privateKeyPem,
      publicKeyHex: pemToRawPublicHex(publicKeyPem),
    }
  }

  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  writeFileSync(pubPath, publicKeyPem, { mode: 0o600 })
  writeFileSync(privPath, privateKeyPem, { mode: 0o600 })
  // Ensure parent dir is restrictive when possible
  try {
    mkdirSync(dirname(privPath), { recursive: true, mode: 0o700 })
  } catch {
    /* ignore */
  }

  return {
    publicKeyPem,
    privateKeyPem,
    publicKeyHex: pemToRawPublicHex(publicKeyPem),
  }
}

/** Sign a decision card (or any payload) with the local Ed25519 key. Returns hex signature. */
export function signCanonical(privateKeyPem: string, payload: unknown): string {
  const message = Buffer.from(canonicalJson(payload), 'utf8')
  const signature = cryptoSign(null, message, privateKeyPem)
  return signature.toString('hex')
}

export function verifyCanonical(publicKeyPem: string, payload: unknown, signatureHex: string): boolean {
  try {
    const message = Buffer.from(canonicalJson(payload), 'utf8')
    const signature = Buffer.from(signatureHex, 'hex')
    return cryptoVerify(null, message, publicKeyPem, signature)
  } catch {
    return false
  }
}

export function shortPublicKey(publicKeyHex: string): string {
  if (publicKeyHex.length < 12) return publicKeyHex
  return `${publicKeyHex.slice(0, 6)}…${publicKeyHex.slice(-4)}`
}
