/**
 * Default decision-card schema.
 * Grok may overlay `card_ui` on a single card. This document is the stable
 * shape the desk renders when the model is offline.
 */
export const DEFAULT_CARD_UI = {
  title: 'Active Decision Card',
  subtitle: 'Inspect the diff. Nothing runs until you authorize.',
  fields: [
    { id: 'agent', label: 'Agent ID', path: 'payload.agentId', kind: 'mono' },
    { id: 'pack', label: 'Pack', path: 'payload.packName', kind: 'text' },
    { id: 'action', label: 'Action', path: 'payload.actionType', kind: 'mono' },
    { id: 'risk', label: 'Risk', path: 'payload.riskLevel', kind: 'badge' },
    { id: 'endpoint', label: 'Target Endpoint', path: 'payload.targetEndpoint', kind: 'mono' },
    { id: 'summary', label: 'Execution Summary', path: 'payload.summary', kind: 'text' },
    { id: 'diff', label: 'Payload Diff', path: 'payload.diffData', kind: 'diff' },
  ],
  actions: {
    primary: { id: 'yes', label: 'YES: AUTHORIZE & SIGN', shortcut: 'ENTER' },
    secondary: [
      { id: 'reject', label: 'Reject & Abort' },
      { id: 'delegate', label: 'Delegate to Sub-Agent' },
    ],
  },
}
