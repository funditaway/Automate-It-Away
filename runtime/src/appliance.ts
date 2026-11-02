/**
 * Local appliance / SmartHQ / sensor-network adapters (runtime).
 *
 * Enforces Local IoT & Appliance Automation Standards:
 *  1. Local-first endpoints + graceful retry on connection drop
 *  2. Raw telemetry → AIA before/after state diffs
 *  3. Physical actuators ≥ medium/high risk (HITL [ENTER] before bridge)
 */
import { randomUUID } from 'node:crypto'
import type { DecisionCardPayload, RiskLevel } from './types.js'
import type { VaultDb } from './db.js'

const RISK_SET = new Set<RiskLevel>(['low', 'medium', 'high', 'critical'])

export const PHYSICAL_ACTION_PATTERNS: readonly RegExp[] = Object.freeze([
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

const HIGH_PHYSICAL: readonly RegExp[] = Object.freeze([
  /\bunlock\b/i,
  /\bopen(_|\s)?door\b/i,
  /\barm\b/i,
  /\bdisarm\b/i,
  /\bpower(_|\s)?off\b/i,
])

function clampRisk(level: unknown, fallback: RiskLevel = 'medium'): RiskLevel {
  const value = String(level || '').toLowerCase()
  return RISK_SET.has(value as RiskLevel) ? (value as RiskLevel) : fallback
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/** Prefer MQTT / LAN / smarthq:// over cloud HTTPS. */
export function preferLocalEndpoint(...candidates: Array<unknown>): string {
  const cleaned = candidates
    .flat()
    .map((c) => (c == null ? '' : String(c).trim()))
    .filter(Boolean)
  if (!cleaned.length) return ''

  const score = (url: string) => {
    const u = url.toLowerCase()
    if (/^mqtts?:\/\//.test(u)) return 0
    if (/^smarthq:\/\//.test(u) || /^lan:\/\//.test(u) || /^mdns:\/\//.test(u)) return 1
    if (/^http:\/\/(localhost|127\.0\.0\.1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(url))
      return 2
    if (/^https?:\/\/[^/]+(\.local)([/:?]|$)/i.test(url)) return 2
    if (/^pack:\/\//.test(u) || /^telemetry:\/\//.test(u)) return 3
    if (/^https?:\/\//.test(u)) return 9
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u) && u.includes('/')) return 1
    return 5
  }

  return [...cleaned].sort((a, b) => score(a) - score(b) || a.length - b.length)[0]
}

export function isPhysicalAction(text: unknown): boolean {
  const t = String(text || '')
  return PHYSICAL_ACTION_PATTERNS.some((re) => re.test(t))
}

export function riskForPhysicalAction(actionOrEvent: unknown, fallback?: RiskLevel): RiskLevel {
  const text = String(actionOrEvent || '')
  if (!isPhysicalAction(text)) return clampRisk(fallback, 'low')
  if (HIGH_PHYSICAL.some((re) => re.test(text))) return 'high'
  const floored = clampRisk(fallback, 'medium')
  return floored === 'low' ? 'medium' : floored
}

function inferEnergyRate(raw: Record<string, unknown>, eventHint = ''): string {
  if (raw.energyRate) return String(raw.energyRate).toLowerCase()
  if (typeof raw.watts === 'number') {
    if (raw.watts >= 800) return 'high'
    if (raw.watts <= 50) return 'low'
    return 'medium'
  }
  const blob = `${raw.status || ''} ${raw.mode || ''} ${raw.event || ''} ${eventHint}`
  if (/\b(high|peak|heavy|running)\b/i.test(blob)) return 'high'
  if (/\b(low|idle|off|paused?|standby|complete|finished|cycle[_ ]?complete)\b/i.test(blob))
    return 'low'
  return 'medium'
}

function inferStatus(event: string, state: Record<string, unknown>): string {
  const e = event.toLowerCase()
  const s = String(state.status || state.state || '').toLowerCase()
  if (s) return s
  if (/cycle[_ ]?complete|finished|done/.test(e)) return 'complete'
  if (/error|fault|fail/.test(e)) return 'error'
  if (/pause/.test(e)) return 'paused'
  if (/start|running|active/.test(e)) return 'running'
  if (/idle|standby|off/.test(e)) return 'idle'
  return 'reported'
}

function estimateSavings(
  beforeEnergy: string,
  afterEnergy: string,
  wattsBefore?: number,
  wattsAfter?: number,
): string | undefined {
  if (typeof wattsBefore === 'number' && typeof wattsAfter === 'number' && wattsBefore > wattsAfter) {
    const kwh = ((wattsBefore - wattsAfter) / 1000) * 0.25
    return `$${(kwh * 0.14).toFixed(2)}`
  }
  if (beforeEnergy === 'high' && afterEnergy === 'low') return '$0.12'
  if (beforeEnergy === 'high' && afterEnergy === 'medium') return '$0.05'
  if (beforeEnergy === 'medium' && afterEnergy === 'low') return '$0.03'
  return undefined
}

export interface NormalizedApplianceTelemetry {
  deviceId: string
  event: string
  physical: boolean
  riskLevel: RiskLevel
  targetEndpoint: string
  diffData: {
    before: Record<string, unknown>
    after: Record<string, unknown>
  }
  summary: string
}

export function normalizeApplianceTelemetry(raw: Record<string, unknown> = {}): NormalizedApplianceTelemetry {
  const input = asRecord(raw)
  const deviceId = String(input.deviceId || input.applianceId || input.id || 'device')
  const event = String(input.event || input.type || input.action || 'telemetry')
  const prior = asRecord(input.before || input.previous || input.prior)
  const reported = asRecord(input.after || input.state || input.telemetry || input)

  const beforeStatus = String(
    prior.status ||
      prior.state ||
      (/cycle|complete|pause|error/.test(event.toLowerCase()) ? 'running' : 'idle'),
  ).toLowerCase()
  const afterStatus = inferStatus(event, reported)

  const beforeEnergy = inferEnergyRate({ ...prior, status: beforeStatus, event: 'running' })
  const afterEnergy = inferEnergyRate(
    { ...reported, status: afterStatus, event, watts: reported.watts ?? input.watts },
    event,
  )

  const before: Record<string, unknown> = {
    deviceId,
    status: beforeStatus,
    energyRate: beforeEnergy,
  }
  if (prior.errorCode || input.priorErrorCode) {
    before.errorCode = String(prior.errorCode || input.priorErrorCode)
  }
  if (typeof prior.watts === 'number') before.watts = prior.watts

  const after: Record<string, unknown> = {
    deviceId,
    status: afterStatus,
    energyRate: afterEnergy,
  }
  const errCode =
    reported.errorCode || input.errorCode || (/error|fault/i.test(event) ? event : null)
  if (errCode) after.errorCode = String(errCode)
  if (typeof reported.watts === 'number') after.watts = reported.watts
  else if (typeof input.watts === 'number') after.watts = input.watts

  const savings = estimateSavings(
    beforeEnergy,
    afterEnergy,
    typeof before.watts === 'number' ? before.watts : undefined,
    typeof after.watts === 'number' ? after.watts : undefined,
  )
  if (savings) after.savingsEstimated = savings

  const topic =
    preferLocalEndpoint(
      input.mqttTopic,
      input.localUrl,
      input.lanEndpoint,
      input.targetEndpoint,
      input.cloudUrl,
      input.webhookUrl,
    ) || `smarthq://devices/${encodeURIComponent(deviceId)}`

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
    summary: input.summary
      ? String(input.summary)
      : physical
        ? `Physical action "${event}" on ${deviceId}. Requires [ENTER] before the device bridge.`
        : `Appliance ${event} on ${deviceId}. Normalized telemetry — review before any hardware change.`,
  }
}

export function cardFromApplianceEvent(
  raw: Record<string, unknown> = {},
  extras: { agentId?: string; packName?: string } = {},
): DecisionCardPayload {
  const normalized = normalizeApplianceTelemetry(raw)
  const input = asRecord(raw)
  const actionType = input.actionType
    ? String(input.actionType)
    : `APPLIANCE_${normalized.event
        .replace(/[^A-Za-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .toUpperCase()}`

  return {
    agentId: String(extras.agentId || input.agentId || 'agent_appliance'),
    packName: String(extras.packName || input.packName || 'Home & family'),
    actionType,
    riskLevel: normalized.riskLevel,
    targetEndpoint: normalized.targetEndpoint,
    method: String(input.method || (normalized.physical ? 'POST' : 'GET')).toUpperCase(),
    summary: normalized.summary,
    diffData: normalized.diffData,
    resourceCost: (input.resourceCost as DecisionCardPayload['resourceCost']) || {
      amount: '0',
      token: 'none',
    },
    source: 'appliance',
    webhookEvent: normalized.event,
    timestamp: typeof input.timestamp === 'number' ? input.timestamp : Date.now(),
  }
}

export interface DeviceRecord {
  deviceId: string
  name: string
  transport: string
  endpoint: string
  online: boolean
  lastSeenAt: number
  retryState: {
    status: string
    reason: string | null
    attempt: number
    nextAttemptAt?: number
    updatedAt: number
  } | null
}

export interface DeviceRetryEntry {
  id: string
  deviceId: string
  status: 'retry_scheduled' | 'recovered' | 'exhausted'
  reason: string
  attempt: number
  maxAttempts: number
  nextAttemptAt: number
  createdAt: number
  updatedAt: number
  lastError: string | null
}

function inferTransport(endpoint: string): string {
  const u = endpoint.toLowerCase()
  if (u.startsWith('mqtt')) return 'mqtt'
  if (u.startsWith('smarthq') || u.startsWith('lan') || u.startsWith('mdns')) return 'lan'
  if (/^https?:\/\/(localhost|127\.|10\.|192\.168\.)/i.test(endpoint)) return 'lan'
  if (/^https?:\/\//i.test(endpoint)) return 'cloud'
  if (u.includes('/')) return 'mqtt'
  return 'unknown'
}

export class DeviceConnectionManager {
  readonly devices = new Map<string, DeviceRecord>()
  readonly retries: DeviceRetryEntry[] = []
  readonly maxAttempts: number
  readonly baseDelayMs: number
  private readonly now: () => number

  constructor(opts: { maxAttempts?: number; baseDelayMs?: number; now?: () => number } = {}) {
    this.maxAttempts = opts.maxAttempts ?? 8
    this.baseDelayMs = opts.baseDelayMs ?? 1_000
    this.now = opts.now || (() => Date.now())
  }

  discover(device: Record<string, unknown>): DeviceRecord {
    const id = String(device?.deviceId || device?.id || '')
    if (!id) throw new Error('deviceId is required for discovery')
    const endpoint = preferLocalEndpoint(
      device.mqttTopic,
      device.localUrl,
      device.lanEndpoint,
      device.endpoint,
      device.cloudUrl,
    )
    const record: DeviceRecord = {
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

  listDevices(): DeviceRecord[] {
    return [...this.devices.values()].sort((a, b) => a.deviceId.localeCompare(b.deviceId))
  }

  getDevice(deviceId: string): DeviceRecord | null {
    return this.devices.get(String(deviceId)) || null
  }

  markDropped(deviceId: string, reason = 'connection_dropped'): DeviceRetryEntry {
    const id = String(deviceId)
    const device = this.devices.get(id) || this.discover({ deviceId: id, online: false })
    device.online = false
    const nextAttemptAt = this.now() + this.baseDelayMs
    device.retryState = {
      status: 'retry_scheduled',
      reason: String(reason),
      attempt: 0,
      nextAttemptAt,
      updatedAt: this.now(),
    }
    const entry: DeviceRetryEntry = {
      id: `retry-${randomUUID()}`,
      deviceId: id,
      status: 'retry_scheduled',
      reason: String(reason),
      attempt: 0,
      maxAttempts: this.maxAttempts,
      nextAttemptAt,
      createdAt: this.now(),
      updatedAt: this.now(),
      lastError: String(reason),
    }
    this.retries.push(entry)
    return entry
  }

  enqueueDeviceRetry(deviceId: string, meta: { reason?: string } = {}): DeviceRetryEntry {
    return this.markDropped(deviceId, meta.reason || 'connection_dropped')
  }

  listDueRetries(at = this.now()): DeviceRetryEntry[] {
    return this.retries.filter((r) => r.status === 'retry_scheduled' && r.nextAttemptAt <= at)
  }

  listRetries(status?: string): DeviceRetryEntry[] {
    return status ? this.retries.filter((r) => r.status === status) : [...this.retries]
  }

  recordRetryAttempt(retryId: string, result: { ok?: boolean; error?: string } = {}): DeviceRetryEntry | null {
    const entry = this.retries.find((r) => r.id === retryId)
    if (!entry) return null
    entry.attempt += 1
    entry.updatedAt = this.now()
    if (result.ok) {
      entry.status = 'recovered'
      entry.lastError = null
      const device = this.devices.get(entry.deviceId)
      if (device) {
        device.online = true
        device.lastSeenAt = this.now()
        device.retryState = {
          status: 'online',
          reason: null,
          attempt: entry.attempt,
          updatedAt: this.now(),
        }
      }
      return entry
    }
    entry.lastError = result.error ? String(result.error) : 'retry_failed'
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

  retryNoticeCard(retryEntry: DeviceRetryEntry): DecisionCardPayload {
    const device = this.getDevice(retryEntry.deviceId)
    return cardFromApplianceEvent({
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
    })
  }
}

/** Persist retry rows alongside the vault when a VaultDb is available. */
export function enqueueDeviceRetryInVault(
  vault: VaultDb,
  deviceId: string,
  reason = 'connection_dropped',
): { retryId: string; card: ReturnType<VaultDb['enqueueCard']> } {
  const manager = new DeviceConnectionManager()
  const retry = manager.enqueueDeviceRetry(deviceId, { reason })
  const card = vault.enqueueCard(manager.retryNoticeCard(retry))
  return { retryId: retry.id, card }
}
