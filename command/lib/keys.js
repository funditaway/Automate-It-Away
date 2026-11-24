/**
 * Sovereign Ed25519 identity for one local node.
 * Private key stays on disk (mode 0600). Nothing here calls the network.
 *
 * Rotations keep prior public keys in keyring.json so historical ledger
 * lines remain verifiable after cutover.
 */
import { createHash, createPublicKey, generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { canonicalJson } from './canonical.js'

export const KEYRING_FILE = 'keyring.json'

/** SPKI Ed25519 DER is a 12-byte prefix plus the 32-byte raw public key. */
export function pemToRawPublicHex(publicKeyPem) {
  const der = Buffer.from(
    String(publicKeyPem)
      .replace(/-----BEGIN PUBLIC KEY-----/, '')
      .replace(/-----END PUBLIC KEY-----/, '')
      .replace(/\s+/g, ''),
    'base64',
  )
  return der.subarray(der.length - 32).toString('hex')
}

export function shortPublicKey(publicKeyHex) {
  if (!publicKeyHex || publicKeyHex.length < 12) return publicKeyHex || ''
  return `${publicKeyHex.slice(0, 6)}…${publicKeyHex.slice(-4)}`
}

export function publicKeyFingerprint(publicKeyPem) {
  const der = createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' })
  return `sha256:${createHash('sha256').update(der).digest('hex')}`
}

function keyIdFor(fingerprint, createdAt) {
  const stamp = String(createdAt || new Date().toISOString()).replace(/[-:]/g, '').replace(/\..+/, 'Z')
  return `ed25519-${stamp}-${fingerprint.slice(7, 13)}`
}

export function loadKeyring(keyDir) {
  const path = join(keyDir, KEYRING_FILE)
  if (!existsSync(path)) return { activeKeyId: null, keys: [] }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'))
    return {
      activeKeyId: raw.activeKeyId || null,
      keys: Array.isArray(raw.keys) ? raw.keys : [],
    }
  } catch {
    return { activeKeyId: null, keys: [] }
  }
}

export function saveKeyring(keyDir, keyring) {
  mkdirSync(keyDir, { recursive: true, mode: 0o700 })
  const path = join(keyDir, KEYRING_FILE)
  writeFileSync(path, JSON.stringify(keyring, null, 2) + '\n', { mode: 0o600 })
}

function upsertActiveKey(keyring, publicKeyPem, createdAt = new Date().toISOString()) {
  const publicKeyHex = pemToRawPublicHex(publicKeyPem)
  const fingerprint = publicKeyFingerprint(publicKeyPem)
  let record = keyring.keys.find((k) => k.publicKeyHex === publicKeyHex || k.fingerprint === fingerprint)
  if (!record) {
    record = {
      keyId: keyIdFor(fingerprint, createdAt),
      algorithm: 'Ed25519',
      status: 'ACTIVE',
      fingerprint,
      publicKeyHex,
      publicKeyPem,
      createdAt,
    }
    keyring.keys.push(record)
  } else {
    record.status = 'ACTIVE'
    record.fingerprint = fingerprint
    record.publicKeyHex = publicKeyHex
    record.publicKeyPem = publicKeyPem
    delete record.retiredAt
  }
  keyring.activeKeyId = record.keyId
  return record
}

/** Sync the on-disk active keypair into keyring.json without rotating. */
export function ensureKeyringForKeypair(keyDir, keys) {
  const keyring = loadKeyring(keyDir)
  const record = upsertActiveKey(keyring, keys.publicKeyPem)
  for (const item of keyring.keys) {
    if (item.keyId !== record.keyId && item.status === 'ACTIVE') {
      item.status = 'RETIRED'
      item.retiredAt = item.retiredAt || new Date().toISOString()
    }
  }
  saveKeyring(keyDir, keyring)
  return { keyring, record }
}

/** Trusted public keys for ledger verification (active + retired). */
export function loadTrustedPublicKeys(keyDir) {
  const trust = new Map()
  const keyring = loadKeyring(keyDir)
  for (const item of keyring.keys) {
    if (!item.publicKeyPem) continue
    const hex = item.publicKeyHex || pemToRawPublicHex(item.publicKeyPem)
    trust.set(hex, item.publicKeyPem)
  }
  const pubPath = join(keyDir, 'ed25519.pub.pem')
  if (existsSync(pubPath)) {
    const publicKeyPem = readFileSync(pubPath, 'utf8')
    trust.set(pemToRawPublicHex(publicKeyPem), publicKeyPem)
  }
  return trust
}

function writeActiveKeypair(keyDir, publicKeyPem, privateKeyPem) {
  mkdirSync(keyDir, { recursive: true, mode: 0o700 })
  writeFileSync(join(keyDir, 'ed25519.pub.pem'), publicKeyPem, { mode: 0o600 })
  writeFileSync(join(keyDir, 'ed25519.pem'), privateKeyPem, { mode: 0o600 })
}

function mintKeypair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  return {
    publicKeyPem,
    privateKeyPem,
    publicKeyHex: pemToRawPublicHex(publicKeyPem),
  }
}

export function loadOrCreateKeypair(keyDir) {
  mkdirSync(keyDir, { recursive: true, mode: 0o700 })
  const pubPath = join(keyDir, 'ed25519.pub.pem')
  const privPath = join(keyDir, 'ed25519.pem')

  if (existsSync(pubPath) && existsSync(privPath)) {
    const publicKeyPem = readFileSync(pubPath, 'utf8')
    const privateKeyPem = readFileSync(privPath, 'utf8')
    const keys = { publicKeyPem, privateKeyPem, publicKeyHex: pemToRawPublicHex(publicKeyPem) }
    ensureKeyringForKeypair(keyDir, keys)
    return keys
  }

  const keys = mintKeypair()
  writeActiveKeypair(keyDir, keys.publicKeyPem, keys.privateKeyPem)
  ensureKeyringForKeypair(keyDir, keys)
  return keys
}

/**
 * Non-destructive rotation: retire the active key in keyring.json (keeping
 * publicKeyPem), mint a new Ed25519 pair, and rewrite the active PEM files.
 */
export function rotateKeypair(keyDir) {
  mkdirSync(keyDir, { recursive: true, mode: 0o700 })
  const nowIso = new Date().toISOString()
  const keyring = loadKeyring(keyDir)
  const pubPath = join(keyDir, 'ed25519.pub.pem')
  const privPath = join(keyDir, 'ed25519.pem')

  if (existsSync(pubPath) && existsSync(privPath)) {
    upsertActiveKey(keyring, readFileSync(pubPath, 'utf8'))
  }

  for (const item of keyring.keys) {
    if (item.status === 'ACTIVE') {
      item.status = 'RETIRED'
      item.retiredAt = nowIso
    }
  }

  const keys = mintKeypair()
  writeActiveKeypair(keyDir, keys.publicKeyPem, keys.privateKeyPem)
  const record = upsertActiveKey(keyring, keys.publicKeyPem, nowIso)
  saveKeyring(keyDir, keyring)

  return {
    ...keys,
    keyId: record.keyId,
    fingerprint: record.fingerprint,
    keyring,
    rotatedAt: nowIso,
  }
}

export function signCanonical(privateKeyPem, payload) {
  const message = Buffer.from(canonicalJson(payload), 'utf8')
  return cryptoSign(null, message, privateKeyPem).toString('hex')
}

export function verifyCanonical(publicKeyPem, payload, signatureHex) {
  try {
    const message = Buffer.from(canonicalJson(payload), 'utf8')
    const signature = Buffer.from(String(signatureHex || ''), 'hex')
    if (!signature.length) return false
    return cryptoVerify(null, message, publicKeyPem, signature)
  } catch {
    return false
  }
}
