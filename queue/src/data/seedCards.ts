import type { ActiveDecisionCard, RiskLevel } from '../types'

const now = Date.now()

export const SEED_CARDS: ActiveDecisionCard[] = [
  {
    cardId: 'card-001',
    status: 'pending',
    payload: {
      agentId: 'agent_ghl_outbound_v2',
      packName: 'GoHighLevel Lead Nurture Pack',
      actionType: 'GHL_WEBHOOK_OUTBOUND',
      riskLevel: 'high',
      targetEndpoint: 'https://services.leadconnectorhq.com/contacts/',
      summary:
        'Execute bulk contact tag update and trigger automated SMS sequence for 142 qualified inbound real estate leads.',
      diffData: {
        before: { tagCount: 1, activeAutomation: false, status: 'stale' },
        after: { tagCount: 3, activeAutomation: true, status: 'nurture_active' },
      },
      resourceCost: { amount: '0.045', token: 'ETH (Superfluid)' },
      timestamp: now - 65_000,
    },
  },
  {
    cardId: 'card-002',
    status: 'pending',
    payload: {
      agentId: 'agent_treasury_flux',
      packName: 'Superfluid Treasury Stream',
      actionType: 'SUPERFLUID_STREAM_UPDATE',
      riskLevel: 'critical',
      targetEndpoint: '0xCFB…92C',
      summary:
        'Modify real-time payroll token stream flow rate for sub-agent contributor node by +15% based on milestone verification.',
      diffData: {
        before: { flowRatePerSec: '0.000012 ETH/s', recipient: 'Node #4 - Research' },
        after: { flowRatePerSec: '0.0000138 ETH/s', recipient: 'Node #4 - Research' },
      },
      resourceCost: { amount: '0.120', token: 'USDCx' },
      timestamp: now - 300_000,
    },
  },
  {
    cardId: 'card-003',
    status: 'pending',
    payload: {
      agentId: 'agent_social_publisher',
      packName: 'Autonomous Brand Pod',
      actionType: 'API_DISPATCH_TWITTER',
      riskLevel: 'medium',
      targetEndpoint: 'https://api.x.com/2/tweets',
      summary:
        'Publish thread summarizing weekly sovereign agent swarm performance and local Provenance Ledger metrics.',
      diffData: {
        before: { draftPublished: false, scheduledSlot: '12:00 UTC' },
        after: { draftPublished: true, tweetId: '1893742910482' },
      },
      resourceCost: { amount: '0.001', token: 'ETH' },
      timestamp: now - 950_000,
    },
  },
]

export interface SimulateTemplate {
  packName: string
  actionType: string
  riskLevel: RiskLevel
  targetEndpoint: string
  summary: string
}

export const SIMULATE_TEMPLATES: SimulateTemplate[] = [
  {
    packName: 'CRM Pipeline Automation',
    actionType: 'GHL_CONTACT_PURGE',
    riskLevel: 'medium',
    targetEndpoint: 'https://services.leadconnectorhq.com/contacts/delete',
    summary: 'Archive 45 inactive leads flagged as bounced or unsubscribed.',
  },
  {
    packName: 'Autonomous Smart Contract Guard',
    actionType: 'EVM_DEPLOY_UPGRADE',
    riskLevel: 'critical',
    targetEndpoint: '0x32A…B910 (Mainnet)',
    summary: 'Upgrade staking vault proxy contract logic.js sandboxed bytecode.',
  },
  {
    packName: 'Email Outreach Dispatch',
    actionType: 'SMTP_BULK_SEND',
    riskLevel: 'low',
    targetEndpoint: 'smtp.mailgun.org/v3/messages',
    summary: 'Dispatch weekly newsletter batch to 820 verified subscribers.',
  },
]
