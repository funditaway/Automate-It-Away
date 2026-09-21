/**
 * Pack swarm registry.
 *
 * Reads the repo's packs/*.json files and exposes them as agents.
 * A pack is not armed until a human signs a SWARM_ARM card.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export function loadPacks(packsDir) {
  if (!packsDir || !existsSync(packsDir)) return []
  const files = readdirSync(packsDir).filter((name) => name.endsWith('.json')).sort()
  const packs = []
  for (const file of files) {
    try {
      const raw = JSON.parse(readFileSync(join(packsDir, file), 'utf8'))
      const id = String(raw.id || file.replace(/\.json$/, ''))
      packs.push({
        id,
        name: String(raw.name || id),
        family: raw.family ? String(raw.family) : '',
        pipes: Array.isArray(raw.pipes) ? raw.pipes.map(String) : [],
        rails: Array.isArray(raw.rails) ? raw.rails.map(String) : [],
        taps: Array.isArray(raw.taps) ? raw.taps.map(String) : [],
        agentId: `agent_${id.replace(/[^a-z0-9_-]+/gi, '_')}`,
      })
    } catch {
      /* skip a broken pack file; doctor reports an empty registry */
    }
  }
  return packs
}

export function createSwarm(packsDir) {
  const packs = loadPacks(packsDir)
  const armed = new Set()

  return {
    packs,
    list() {
      return packs.map((pack) => ({ ...pack, armed: armed.has(pack.id) }))
    },
    get(id) {
      return packs.find((pack) => pack.id === id) || null
    },
    /**
     * Match an inbound event to a pack only when the caller named it.
     * A webhook must not silently attach itself to a random pack.
     */
    match(inbound) {
      if (!inbound) return null
      if (inbound.packId) {
        const byId = packs.find((pack) => pack.id === inbound.packId)
        if (byId) return byId
      }
      const label = String(inbound.packName || '').trim().toLowerCase()
      if (!label) return null
      return (
        packs.find((pack) => pack.id.toLowerCase() === label || pack.name.toLowerCase() === label) || null
      )
    },
    markArmed(id) {
      if (!packs.some((pack) => pack.id === id)) return false
      armed.add(id)
      return true
    },
    armPayload(id) {
      const pack = packs.find((item) => item.id === id)
      if (!pack) return null
      return {
        agentId: pack.agentId,
        packName: pack.name,
        packId: pack.id,
        actionType: 'SWARM_ARM',
        riskLevel: 'high',
        targetEndpoint: `swarm://packs/${pack.id}`,
        method: 'POST',
        summary: `Arm pack "${pack.name}" on this node. Nothing in the pack runs until you authorize.`,
        diffData: {
          before: { armed: false, rails: pack.rails },
          after: { armed: true, packId: pack.id },
        },
        source: 'swarm',
        timestamp: Date.now(),
      }
    },
  }
}

export function mountSwarm(ctx) {
  ctx.app.get('/api/swarm', (_req, res) => {
    res.json({ ok: true, packs: ctx.swarm.list() })
  })

  ctx.app.post('/api/swarm/:packId/arm', (req, res) => {
    const payload = ctx.swarm.armPayload(req.params.packId)
    if (!payload) return res.status(404).json({ ok: false, error: 'Unknown pack' })
    const card = ctx.queue.add({ ...payload, timestamp: ctx.now() })
    res.status(202).json({ ok: true, cardId: card.cardId, status: 'pending', executed: false })
  })
}
