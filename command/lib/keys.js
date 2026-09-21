/**
 * Sovereign Ed25519 identity for one local node.
 * Private key stays on disk (mode 0600). Nothing here calls the network.
 */
import { generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { canonicalJson } from './canonical.js'

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

export function loadOrCreateKeypair(keyDir) {
  mkdirSync(keyDir, { recursive: true, mode: 0o700 })
  const pubPath = join(keyDir, 'ed25519.pub.pem')
  const privPath = join(keyDir, 'ed25519.pem')

  if (existsSync(pubPath) && existsSync(privPath)) {
    const publicKeyPem = readFileSync(pubPath, 'utf8')
    const privateKeyPem = readFileSync(privPath, 'utf8')
    return { publicKeyPem, privateKeyPem, publicKeyHex: pemToRawPublicHex(publicKeyPem) }
  }

  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  writeFileSync(pubPath, publicKeyPem, { mode: 0o600 })
  writeFileSync(privPath, privateKeyPem, { mode: 0o600 })
  return { publicKeyPem, privateKeyPem, publicKeyHex: pemToRawPublicHex(publicKeyPem) }
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
