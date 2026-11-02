/**
 * Local appliance / SmartHQ / sensor-network adapters.
 *
 * Enforces Local IoT & Appliance Automation Standards:
 *  1. Local-first endpoints + graceful retry on connection drop
 *  2. Raw telemetry → AIA before/after state diffs
 *  3. Physical actuators ≥ medium/high risk (HITL [ENTER] before bridge)
 *
 * Never auto-executes. Never enqueues a raw channel body.
 */
import { randomUUID } from 'node:crypto'
import { clampRisk, normalizeDecisionPayload, toUniversalDecisionCard } from './decisionCard.js'

/** Physical actions that change hardware state (never telemetry-only). */
export const PHYSICAL_ACTION_PATTERNS = Object.freeze([
  /\bstart(_|\s)?cycle\b/i,
  /\bunlock\b/i,
  /\block\b/i,
  /\bopen(_|\s)?door\b/i,
  /\bclose(_|\s)?door\b/i,
  /\badjust(_|\s)?flow\b/i,
  /\bset(_|\s)?(temp|temperature|spin|soil|flow)\b/i,
  /\barm\b/i,
  /\bdisarm\b/i,
  /\bpower(_|\s)?(on|off)\b/i,
  /\brelay(_|\s)?(on|off)\b/i,
  /\bactuate\b/i,
  /\bcommand\b/i,
  /\bwrite(_|\s)?state\b/i,
])

const HIGH_PHYSICAL = Object.freeze([
  /\bunlock\b/i,
  /\bopen(_|\s)?door\b/i,
  /\barm\b/i,
  /\bdisarm\b/i,
  /\bpower(_|\s)?off\b/i,
])

const ENERGY_HIGH = Object.freeze([/\bhigh\b/i, /\bpeak\b/i, /\bheavy\b/i, /\brunning\b/i])
const ENERGY_LOW = Object.freeze([
  /\blow\b/i,
  /\bidle\b/i,
  /\boff\b/i,
  /\bpaused?\b/i,
  /\bstandby\b/i,
  /\bcomplete\b/i,
  /\bfinished\b/i,
  /\bcycle[_ ]?complete\b/i,
])

/**
 * Prefer MQTT / LAN / smarthq:// over cloud HTTPS when both are offered.
 * Local-first: discovery and broker paths win over cloud webhooks.
 */
export function preferLocalEndpoint(...candidates) {
  const cleaned = candidates
    .flat()
    .map((c) => (c == null ? '' : String(c).trim()))
    .filter(Boolean)
  if (!cleaned.length) return ''

  const score = (url) => {
    const u = url.toLowerCase()
    if (/^mqtts?:\/\//.test(u) || u.startsWith('mqtt://') || u.includes('mqtt://')) return 0
    if (/^smarthq:\/\//.test(u) || /^lan:\/\//.test(u) || /^mdns:\/\//.test(u)) return 1
    if (/^http:\/\/(localhost|127\.0\.0\.1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(url))
      return 2
    if (/^https?:\/\/[^/]+(\.local)([/:?]|$)/i.test(url)) return 2
    if (/^pack:\/\//.test(u) || /^telemetry:\/\//.test(u)) return 3
    if (/^https?:\/\//.test(u)) return 9
    // bare MQTT topic (home/laundry/dryer)
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u) && u.includes('/')) return 1
    return 5
  }

  return [...cleaned].sort((a, b) => score(a) - score(b) || a.length - b.length)[0]
}

export function isPhysicalAction(text) {
  const t = String(text || '')
  return PHYSICAL_ACTION_PATTERNS.some((re) => re.test(t))
}

/**
 * Physical actions that alter hardware must be at least medium, often high.
 * Telemetry-only events stay low unless a fallback risk is supplied.
 */
export function riskForPhysicalAction(actionOrEvent, fallback) {
  const text = String(actionOrEvent || '')
  if (!isPhysicalAction(text)) {
    return clampRisk(fallback, 'low')
  }
  if (HIGH_PHYSICAL.some((re) => re.test(text))) return 'high'
  const floored = clampRisk(fallback, 'medium')
  return floored === 'low' ? 'medium' : floored
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function inferEnergyRate(raw) {
  const state = asRecord(raw)
  if (state.energyRate) return String(state.energyRate).toLowerCase()
  if (typeof state.watts === 'number') {
    if (state.watts >= 800) return 'high'
    if (state.watts <= 50) return 'low'
    return 'medium'
  }
  const blob = `${state.status || ''} ${state.mode || ''} ${state.event || ''} ${raw?.event || ''}`
  if (ENERGY_HIGH.some((re) => re.test(blob))) return 'high'
  if (ENERGY_LOW.some((re) => re.test(blob))) return 'low'
  return 'medium'
}

function inferStatus(event, state) {
  const e = String(event || '').toLowerCase()
  const s = String(state?.status || state?.state || '').toLowerCase()
  if (s) return s
  if (/cycle[_ ]?complete|finished|done/.test(e)) return 'complete'
  if (/error|fault|fail/.test(e)) return 'error'
  if (/pause/.test(e)) return 'paused'
  if (/start|running|active/.test(e)) return 'running'
  if (/idle|standby|off/.test(e)) return 'idle'
  return 'reported'
}

function estimateSavings(beforeEnergy, afterEnergy, wattsBefore, wattsAfter) {
  if (typeof wattsBefore === 'number' && typeof wattsAfter === 'number' && wattsBefore > wattsAfter) {
    const kwh = ((wattsBefore - wattsAfter) / 1000) * 0.25
    const dollars = kwh * 0.14
    return `$${dollars.toFixed(2)}`
  }
  if (beforeEnergy === 'high' && afterEnergy === 'low') return '$0.12'
  if (beforeEnergy === 'high' && afterEnergy === 'medium') return '$0.05'
  if (beforeEnergy === 'medium' && afterEnergy === 'low') return '$0.03'
  return undefined
}

/**
 * Translate raw appliance / sensor event strings into AIA state diffs.
 * Example: cycle complete → before { status: running, energyRate: high }
 *          after { status: complete, energyRate: low, savingsEstimated: $0.12 }
 */
export function normalizeApplianceTelemetry(raw = {}) {
  const input = asRecord(raw)
  const deviceId = String(input.deviceId || input.applianceId || input.id || 'device')
  const event = String(input.event || input.type || input.action || 'telemetry')
  const prior = asRecord(input.before || input.previous || input.prior)
  const reported = asRecord(input.after || input.state || input.telemetry || input)

  const beforeStatus =
    prior.status || prior.state || ( /cycle|complete|pause|error/.test(event.toLowerCase()) ? 'running' : 'idle')
  const afterStatus = inferStatus(event, reported)

  const beforeEnergy = inferEnergyRate({ ...prior, status: beforeStatus, event: 'running' })
  const afterEnergy = inferEnergyRate({
    ...reported,
    status: afterStatus,
    event,
    watts: reported.watts ?? input.watts,
  })

  const before = {
    deviceId,
    status: String(beforeStatus).toLowerCase(),
    energyRate: beforeEnergy,
  }
  if (prior.errorCode || input.priorErrorCode) {
    before.errorCode = String(prior.errorCode || input.priorErrorCode)
  }
  if (typeof prior.watts === 'number') before.watts = prior.watts

  const after = {
    deviceId,
    status: String(afterStatus).toLowerCase(),
    energyRate: afterEnergy,
  }
  const errCode = reported.errorCode || input.errorCode || (/error|fault/i.test(event) ? event : null)
  if (errCode) after.errorCode = String(errCode)
  if (typeof reported.watts === 'number') after.watts = reported.watts
  else if (typeof input.watts === 'number') after.watts = input.watts

  const savings = estimateSavings(beforeEnergy, afterEnergy, before.watts, after.watts)
  if (savings) after.savingsEstimated = savings

  const localEndpoint = preferLocalEndpoint(
    input.mqttTopic,
    input.localUrl,
    input.lanEndpoint,
    input.targetEndpoint,
    input.cloudUrl,
    input.webhookUrl,
  )
  const topic =
    localEndpoint ||
    `smarthq://devices/${encodeURIComponent(deviceId)}`

  const physical = isPhysicalAction(`${event} ${input.actionType || ''} ${input.summary || ''}`)
  const riskLevel = physical
    ? riskForPhysicalAction(`${event} ${input.actionType || ''}`, 'medium')
    : clampRisk(input.riskLevel, /error|fault/i.test(event) ? 'medium' : 'low')

  return {
    deviceId,
    event,
    physical,
    riskLevel,
    targetEndpoint: topic,
    diffData: { before, after },
    summary:
      input.summary ||
      (physical
        ? `Physical action "${event}" on ${deviceId}. Requires [ENTER] before the device bridge.`
        : `Appliance ${event} on ${deviceId}. Normalized telemetry — review before any hardware change.`),
  }
}

/**
 * Build a universal pending Decision Card from appliance telemetry or a
 * proposed physical action. Never auto-executes.
 */
export function buildApplianceDecisionPayload(raw = {}, extras = {}) {
  const normalized = normalizeApplianceTelemetry(raw)
  const input = asRecord(raw)
  const packName = String(extras.packName || input.packName || 'Home & family')
  const packId = extras.packId || input.packId || 'home'
  const actionType =
    input.actionType ||
    `APPLIANCE_${String(normalized.event)
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .toUpperCase()}`

  return normalizeDecisionPayload({
    agentId: String(extras.agentId || input.agentId || 'agent_appliance'),
    packName,
    packId,
    actionType,
    riskLevel: normalized.riskLevel,
    targetEndpoint: normalized.targetEndpoint,
    method: String(input.method || (normalized.physical ? 'POST' : 'GET')).toUpperCase(),
    summary: normalized.summary,
    metaPrompt:
      input.metaPrompt ||
      'Local appliance desk agent. Prefer MQTT / LAN. Draft only. Physical actions need [ENTER] before the device bridge. Never auto-actuate.',
    diffData: input.diffData && input.diffData.before && input.diffData.after ? input.diffData : normalized.diffData,
    resourceCost: input.resourceCost || { amount: '0', token: 'none' },
    source: input.source || 'appliance',
    webhookEvent: normalized.event,
    nextRecommendation:
      input.nextRecommendation ||
      (normalized.physical
        ? `Press [ENTER] to authorize "${normalized.event}" on ${normalized.deviceId}, or Stop to abort. Nothing reaches the device bridge until then.`
        : `Review the telemetry diff for ${normalized.deviceId}. Propose a physical action only with a new medium/high card.`),
    timestamp: input.timestamp || Date.now(),
  })
}

export function cardFromApplianceEvent(raw = {}, extras = {}) {
  return toUniversalDecisionCard(buildApplianceDecisionPayload(raw, extras))
}

/** In-memory graceful retry queue for dropped appliance links. */
export class DeviceConnectionManager {
  constructor(opts = {}) {
    this.devices = new Map()
    this.retries = []
    this.maxAttempts = opts.maxAttempts ?? 8
    this.baseDelayMs = opts.baseDelayMs ?? 1_000
    this.now = opts.now || (() => Date.now())
  }

  /**
   * Register or refresh a locally discovered device.
   * transport: 'mqtt' | 'lan' | 'mdns' | 'cloud'
   */
  discover(device) {
    const id = String(device?.deviceId || device?.id || '')
    if (!id) throw new Error('deviceId is required for discovery')
    const endpoint = preferLocalEndpoint(
      device.mqttTopic,
      device.localUrl,
      device.lanEndpoint,
      device.endpoint,
      device.cloudUrl,
    )
    const record = {
      deviceId: id,
      name: String(device.name || id),
      transport: String(device.transport || inferTransport(endpoint)),
      endpoint,
      online: device.online !== false,
      lastSeenAt: this.now(),
      retryState: null,
    }
    this.devices.set(id, record)
    return record
  }

  listDevices() {
    return [...this.devices.values()].sort((a, b) => a.deviceId.localeCompare(b.deviceId))
  }

  getDevice(deviceId) {
    return this.devices.get(String(deviceId)) || null
  }

  /**
   * Mark a device offline and enqueue a graceful retry instead of failing
   * silently or blocking the HITL UI queue.
   */
  markDropped(deviceId, reason = 'connection_dropped') {
    const id = String(deviceId)
    const device = this.devices.get(id) || this.discover({ deviceId: id, online: false })
    device.online = false
    device.retryState = {
      status: 'retry_scheduled',
      reason: String(reason),
      attempt: 0,
      nextAttemptAt: this.now() + this.baseDelayMs,
      updatedAt: this.now(),
    }
    const entry = {
      id: `retry-${randomUUID()}`,
      deviceId: id,
      status: 'retry_scheduled',
      reason: String(reason),
      attempt: 0,
      maxAttempts: this.maxAttempts,
      nextAttemptAt: device.retryState.nextAttemptAt,
      createdAt: this.now(),
      updatedAt: this.now(),
      lastError: String(reason),
    }
    this.retries.push(entry)
    return entry
  }

  enqueueDeviceRetry(deviceId, meta = {}) {
    return this.markDropped(deviceId, meta.reason || 'connection_dropped')
  }

  /** Due retries ready to attempt without locking the decision-card UI. */
  listDueRetries(at = this.now()) {
    return this.retries.filter((r) => r.status === 'retry_scheduled' && r.nextAttemptAt <= at)
  }

  listRetries(status) {
    return status ? this.retries.filter((r) => r.status === status) : [...this.retries]
  }

  /**
   * Record a retry attempt. Does not throw into the HITL queue — returns
   * a state object the pack / bridge can surface as a non-blocking card.
   */
  recordRetryAttempt(retryId, { ok, error } = {}) {
    const entry = this.retries.find((r) => r.id === retryId)
    if (!entry) return null
    entry.attempt += 1
    entry.updatedAt = this.now()
    if (ok) {
      entry.status = 'recovered'
      entry.lastError = null
      const device = this.devices.get(entry.deviceId)
      if (device) {
        device.online = true
        device.lastSeenAt = this.now()
        device.retryState = { status: 'online', reason: null, attempt: entry.attempt, updatedAt: this.now() }
      }
      return entry
    }
    entry.lastError = error ? String(error) : 'retry_failed'
    if (entry.attempt >= entry.maxAttempts) {
      entry.status = 'exhausted'
      const device = this.devices.get(entry.deviceId)
      if (device) {
        device.retryState = {
          status: 'exhausted',
          reason: entry.lastError,
          attempt: entry.attempt,
          updatedAt: this.now(),
        }
      }
    } else {
      entry.status = 'retry_scheduled'
      entry.nextAttemptAt = this.now() + this.baseDelayMs * Math.pow(2, Math.min(entry.attempt, 5))
      const device = this.devices.get(entry.deviceId)
      if (device) {
        device.retryState = {
          status: 'retry_scheduled',
          reason: entry.lastError,
          attempt: entry.attempt,
          nextAttemptAt: entry.nextAttemptAt,
          updatedAt: this.now(),
        }
      }
    }
    return entry
  }

  /** Non-blocking notice payload if a bridge drop should surface on the desk. */
  retryNoticeCard(retryEntry) {
    const device = this.getDevice(retryEntry.deviceId)
    return buildApplianceDecisionPayload({
      deviceId: retryEntry.deviceId,
      event: 'connection_retry',
      actionType: 'APPLIANCE_CONNECTION_RETRY',
      riskLevel: 'low',
      summary: `Appliance ${retryEntry.deviceId} link dropped — graceful retry ${retryEntry.attempt}/${retryEntry.maxAttempts} queued. UI queue stays free.`,
      mqttTopic: device?.endpoint,
      before: { status: 'online', energyRate: 'medium' },
      after: {
        status: retryEntry.status,
        energyRate: 'low',
        retryAttempt: retryEntry.attempt,
        reason: retryEntry.reason,
      },
      nextRecommendation:
        'No hardware change. Wait for local reconnect, or Stop if this device should stay offline.',
    })
  }
}

function inferTransport(endpoint) {
  const u = String(endpoint || '').toLowerCase()
  if (u.startsWith('mqtt')) return 'mqtt'
  if (u.startsWith('smarthq') || u.startsWith('lan') || u.startsWith('mdns')) return 'lan'
  if (/^https?:\/\/(localhost|127\.|10\.|192\.168\.)/i.test(endpoint || '')) return 'lan'
  if (/^https?:\/\//i.test(endpoint || '')) return 'cloud'
  if (u.includes('/')) return 'mqtt'
  return 'unknown'
}

export function mountAppliance(ctx) {
  const manager = ctx.appliance || new DeviceConnectionManager()
  ctx.appliance = manager

  ctx.app.get('/api/appliance/devices', (_req, res) => {
    res.json({ ok: true, devices: manager.listDevices(), localFirst: true })
  })

  ctx.app.post('/api/appliance/discover', (req, res) => {
    try {
      const record = manager.discover(req.body || {})
      res.status(201).json({ ok: true, device: record })
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message || 'discover failed' })
    }
  })

  ctx.app.post('/api/appliance/telemetry', (req, res) => {
    ctx.lock(async () => {
      try {
        const payload = buildApplianceDecisionPayload(req.body || {}, {
          packId: req.body?.packId || 'home',
          packName: req.body?.packName || 'Home & family',
        })
        const card = ctx.queue.add(payload)
        res.status(202).json({
          ok: true,
          cardId: card.cardId,
          status: card.status,
          executed: false,
          schema: 'active-decision-card',
          physical: isPhysicalAction(payload.actionType + ' ' + (req.body?.event || '')),
          riskLevel: payload.riskLevel,
        })
      } catch (err) {
        if (!res.headersSent) res.status(400).json({ ok: false, error: err.message || 'telemetry failed' })
      }
    }).catch((err) => {
      if (!res.headersSent) res.status(500).json({ ok: false, error: err.message || 'telemetry failed' })
    })
  })

  ctx.app.post('/api/appliance/action', (req, res) => {
    ctx.lock(async () => {
      try {
        const body = {
          ...(req.body || {}),
          event: req.body?.event || req.body?.action || 'command',
          // Ensure actuator path is always treated as a physical action
          actionType:
            req.body?.actionType ||
            `APPLIANCE_${String(req.body?.event || req.body?.action || 'COMMAND')
              .replace(/[^A-Za-z0-9]+/g, '_')
              .toUpperCase()}_COMMAND`,
          summary:
            req.body?.summary ||
            `Physical command "${req.body?.event || req.body?.action || 'command'}" on ${
              req.body?.deviceId || 'device'
            }. Requires [ENTER].`,
        }
        const payload = buildApplianceDecisionPayload(body, {
          packId: body.packId || 'home',
          packName: body.packName || 'Home & family',
        })
        // Actuator floor: never below medium, even if caller passed low
        const floored = riskForPhysicalAction(
          `${payload.actionType} ${body.event} actuate`,
          payload.riskLevel,
        )
        payload.riskLevel = floored === 'low' ? 'medium' : floored
        const card = ctx.queue.add(payload)
        res.status(202).json({
          ok: true,
          cardId: card.cardId,
          status: 'pending',
          executed: false,
          requiresEnter: true,
          riskLevel: card.payload.riskLevel,
          schema: 'active-decision-card',
          message: 'Paused for human [ENTER] before device bridge transmission',
        })
      } catch (err) {
        if (!res.headersSent) res.status(400).json({ ok: false, error: err.message || 'action failed' })
      }
    }).catch((err) => {
      if (!res.headersSent) res.status(500).json({ ok: false, error: err.message || 'action failed' })
    })
  })

  ctx.app.post('/api/appliance/connection-drop', (req, res) => {
    const deviceId = String(req.body?.deviceId || '')
    if (!deviceId) return res.status(400).json({ ok: false, error: 'deviceId required' })
    const retry = manager.enqueueDeviceRetry(deviceId, { reason: req.body?.reason || 'connection_dropped' })
    let notice = null
    if (req.body?.notifyQueue === true) {
      const payload = manager.retryNoticeCard(retry)
      notice = ctx.queue.add(payload)
    }
    res.status(202).json({
      ok: true,
      retry,
      queuedNotice: notice
        ? { cardId: notice.cardId, status: notice.status }
        : null,
      uiLocked: false,
      message: 'Graceful retry scheduled — decision queue remains usable',
    })
  })

  ctx.app.get('/api/appliance/retries', (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    res.json({
      ok: true,
      retries: manager.listRetries(status),
      due: manager.listDueRetries(),
    })
  })
}
