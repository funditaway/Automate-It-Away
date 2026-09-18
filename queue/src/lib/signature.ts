/** Mock cryptographic signature: 64-byte hex digest shaped like an Ed25519/HMAC seal. */
export function generateMockSignature(cardId: string, digest: string): string {
  const seed = `${cardId}:${digest}:${Date.now()}:${Math.random().toString(36)}`
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < seed.length; i += 1) {
    const c = seed.charCodeAt(i)
    h1 ^= c
    h1 = Math.imul(h1, 0x01000193)
    h2 = Math.imul(h2 ^ (c << (i % 7)), 0x85ebca6b) >>> 0
  }
  const bytes: string[] = []
  let a = h1 >>> 0
  let b = h2 >>> 0
  for (let i = 0; i < 32; i += 1) {
    a = Math.imul(a ^ (a >>> 13), 0x5bd1e995) >>> 0
    b = Math.imul(b ^ (b >>> 16), 0x27d4eb2d) >>> 0
    const byte = (a ^ b ^ (i * 0x9e3779b9)) & 0xff
    bytes.push(byte.toString(16).padStart(2, '0'))
    a = (a + 0x9e3779b9 + (b << 3)) >>> 0
    b = (b + 0x6c078965 + (a >>> 5)) >>> 0
  }
  return `0x${bytes.join('')}`
}

export function payloadDigest(payload: unknown): string {
  return JSON.stringify(payload)
}
