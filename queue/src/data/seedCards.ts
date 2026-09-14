import type { ActiveDecisionCard } from '../types'

const now = Date.now()

export const SEED_CARDS: ActiveDecisionCard[] = [
  {
    cardId: 'adc-crit-001',
    status: 'pending',
    payload: {
      agentId: 'agent_treasury_rail',
      packName: 'fund',
      actionType: 'SUPERFLUID_STREAM_UPDATE',
      riskLevel: 'critical',
      targetEndpoint: 'https://polygon.superfluid.finance/cfa/v1/updateFlow',
      summary:
        'Raise outbound USDC stream to vendor desk from 120 → 480 / month. Human Yes required before pipe write-back.',
      diffData: {
        before: {
          flowRate: '120',
          token: 'USDC',
          receiver: '0xVendorDesk…a91',
          status: 'active',
        },
        after: {
          flowRate: '480',
          token: 'USDC',
          receiver: '0xVendorDesk…a91',
          status: 'active',
        },
      },
      resourceCost: { amount: '360', token: 'USDC/mo Δ' },
      timestamp: now - 42_000,
    },
  },
  {
    cardId: 'adc-high-002',
    status: 'pending',
    payload: {
      agentId: 'agent_ghl_bridge',
      packName: 'aia-implement',
      actionType: 'GHL_WEBHOOK_OUTBOUND',
      riskLevel: 'high',
      targetEndpoint: 'https://services.leadconnectorhq.com/hooks/abc123',
      summary:
        'Post qualified lead “River Consign” to GHL. Draft only until Yes. No silent send.',
      diffData: {
        before: { stage: 'capture', tags: ['drop'] },
        after: {
          stage: 'qualified',
          tags: ['drop', 'consign'],
          contact: { name: 'River Consign', phone: '+1•••4421' },
          note: 'Owner taps Yes before webhook fires.',
        },
      },
      timestamp: now - 95_000,
    },
  },
  {
    cardId: 'adc-med-003',
    status: 'pending',
    payload: {
      agentId: 'agent_desk_home',
      packName: 'home',
      actionType: 'RULE_THEN_DRAFT',
      riskLevel: 'medium',
      targetEndpoint: 'desk://rules/then#follow-up',
      summary:
        'When = follow · If open ticket · Then draft a check-in. Stays HOLD until Yes.',
      diffData: {
        before: { draft: null },
        after: {
          draft: 'Check in on River — still waiting on photo?',
          assignee: 'desk',
          hold: true,
        },
      },
      timestamp: now - 180_000,
    },
  },
  {
    cardId: 'adc-low-004',
    status: 'pending',
    payload: {
      agentId: 'agent_inbox_sorter',
      packName: 'vita',
      actionType: 'INBOX_LABEL_APPLY',
      riskLevel: 'low',
      targetEndpoint: 'desk://inbox/labels',
      summary: 'Apply label “needs-photo” on two capture cards. Local only.',
      diffData: {
        before: { labels: [] },
        after: { labels: ['needs-photo'], cardIds: ['job-11', 'job-14'] },
      },
      timestamp: now - 12_000,
    },
  },
  {
    cardId: 'adc-high-005',
    status: 'pending',
    payload: {
      agentId: 'agent_pack_ship',
      packName: 'consign',
      actionType: 'PACK_INSTALL_UPDATE',
      riskLevel: 'high',
      targetEndpoint: 'desk://packs/install',
      summary:
        'Install updated consign.aia Then chain. Update is install again — Yes required.',
      diffData: {
        before: { version: '1.2.0', thens: 4 },
        after: { version: '1.3.1', thens: 5, changelog: 'Add photo-needed branch' },
      },
      timestamp: now - 60_000,
    },
  },
]
