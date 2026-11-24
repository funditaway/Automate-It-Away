/**
 * Sovereign Ed25519 identity for one local node.
 * Private key stays on disk (mode 0600). Nothing here calls the network.
 *
 * Rotations keep prior public keys in keyring.json so historical ledger
 * lines remain verifiable after cutover.
 */
import { createHash, createPublicKey, generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { canonicalJson } from './canonical.js'

function atomicWriteFile(targetPath, content, mode = 0o600) {
  mkdirSync(dirname(targetPath), { recursive: true, mode: 0o700 })
  const tmpPath = `${targetPath}.${process.pid}.tmp`
  writeFileSync(tmpPath, content, { mode })
  renameSync(tmpPath, targetPath)
}

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
  atomicWriteFile(path, JSON.stringify(keyring, null, 2) + '\n', 0o600)
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
  atomicWriteFile(join(keyDir, 'ed25519.pub.pem'), publicKeyPem, 0o600)
  atomicWriteFile(join(keyDir, 'ed25519.pem'), privateKeyPem, 0o600)
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
 * Pass `{ dryRun: true }` to preview the new keyId without mutating disk.
 */
export function rotateKeypair(keyDir, opts = {}) {
  mkdirSync(keyDir, { recursive: true, mode: 0o700 })
  const nowIso = opts.rotatedAt || new Date().toISOString()
  const dryRun = Boolean(opts.dryRun)
  const keyring = loadKeyring(keyDir)
  const previousActiveKeyId = keyring.activeKeyId || null
  const pubPath = join(keyDir, 'ed25519.pub.pem')
  const privPath = join(keyDir, 'ed25519.pem')

  if (existsSync(pubPath) && existsSync(privPath)) {
    upsertActiveKey(keyring, readFileSync(pubPath, 'utf8'))
  }

  const previousActive =
    keyring.keys.find((k) => k.keyId === keyring.activeKeyId) ||
    keyring.keys.find((k) => k.status === 'ACTIVE') ||
    null

  for (const item of keyring.keys) {
    if (item.status === 'ACTIVE') {
      item.status = 'RETIRED'
      item.retiredAt = item.retiredAt || nowIso
    }
  }

  const keys = mintKeypair()
  const previewFingerprint = publicKeyFingerprint(keys.publicKeyPem)
  const previewKeyId = keyIdFor(previewFingerprint, nowIso)

  if (dryRun) {
    return {
      dryRun: true,
      previousActiveKeyId: previousActive?.keyId || previousActiveKeyId,
      keyId: previewKeyId,
      fingerprint: previewFingerprint,
      publicKeyHex: keys.publicKeyHex,
      publicKeyPem: keys.publicKeyPem,
      privateKeyPem: null,
      keyring: loadKeyring(keyDir),
      rotatedAt: nowIso,
      keyDir,
      privateKeyPath: privPath,
      publicKeyPath: pubPath,
      keyringPath: join(keyDir, KEYRING_FILE),
    }
  }

  writeActiveKeypair(keyDir, keys.publicKeyPem, keys.privateKeyPem)
  const record = upsertActiveKey(keyring, keys.publicKeyPem, nowIso)
  saveKeyring(keyDir, keyring)

  return {
    dryRun: false,
    previousActiveKeyId: previousActive?.keyId || previousActiveKeyId,
    ...keys,
    keyId: record.keyId,
    fingerprint: record.fingerprint,
    keyring,
    rotatedAt: nowIso,
    keyDir,
    privateKeyPath: privPath,
    publicKeyPath: pubPath,
    keyringPath: join(keyDir, KEYRING_FILE),
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
