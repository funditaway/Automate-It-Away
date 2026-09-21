/**
 * Web3 / domain bridge.
 *
 * Builds proposal cards only. There is no wallet client, no RPC broadcast,
 * and no transaction signing here. A human must authorize the card before
 * the ledger records anything, and even then the daemon does not broadcast.
 */

export const BRIDGE_CHAINS = [
  { id: 1, name: 'ethereum', symbol: 'ETH' },
  { id: 8453, name: 'base', symbol: 'ETH' },
]

export const DOMAIN = {
  name: 'aia',
  tld: 'aia',
  registerUrl: 'https://dns.decentraweb.org/name/aia',
  note: 'Proposal only. No broadcast. A person must authorize.',
}

export function buildBridgePayload(body) {
  const input = body && typeof body === 'object' ? body : {}
  const kind = input.kind === 'transfer' ? 'transfer' : 'domain'

  if (kind === 'domain') {
    const action = String(input.action || 'review')
    return {
      agentId: 'agent_bridge',
      packName: 'Decentraweb',
      packId: 'bridge',
      actionType: 'BRIDGE_DOMAIN',
      riskLevel: 'high',
      targetEndpoint: DOMAIN.registerUrl,
      method: 'GET',
      summary: `Propose .aia domain action (${action}). No name is registered until you authorize — and this daemon never broadcasts.`,
      diffData: {
        before: { domain: DOMAIN.name, status: 'proposed' },
        after: { domain: DOMAIN.name, status: 'awaiting_human_signature', action },
      },
      source: 'bridge',
      resourceCost: null,
    }
  }

  const chainId = Number(input.chainId || 1)
  const asset = String(input.asset || 'ETH')
  const amount = String(input.amount || '0')
  const to = String(input.to || 'unspecified')
  return {
    agentId: 'agent_bridge',
    packName: 'Cross-chain bridge',
    packId: 'bridge',
    actionType: 'BRIDGE_TRANSFER',
    riskLevel: 'critical',
    targetEndpoint: `bridge://chain/${chainId}`,
    method: 'POST',
    summary:
      `Cross-chain intent ${amount} ${asset} on chain ${chainId} to ${to}. ` +
      'Proposal only — nothing is signed on-chain and nothing is broadcast.',
    diffData: {
      before: { chainId, asset, amount, to, status: 'proposed' },
      after: { chainId, asset, amount, to, status: 'awaiting_human_signature', broadcast: false },
    },
    source: 'bridge',
    resourceCost: { amount, token: asset },
  }
}

export function mountBridge(ctx) {
  ctx.app.get('/api/bridge', (_req, res) => {
    res.json({
      ok: true,
      mode: 'proposal-only',
      broadcast: false,
      domain: DOMAIN,
      chains: BRIDGE_CHAINS,
    })
  })

  ctx.app.post('/api/bridge/propose', (req, res) => {
    const card = ctx.queue.add({ ...buildBridgePayload(req.body), timestamp: ctx.now() })
    res.status(202).json({
      ok: true,
      cardId: card.cardId,
      status: 'pending',
      executed: false,
      broadcast: false,
    })
  })
}
