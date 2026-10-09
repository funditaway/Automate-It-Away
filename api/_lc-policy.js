// Lead Catcher — Official AIA Pack. Ported from the tested reference build (/workspace/aia-lead-catcher).
'use strict';
// Role → action permission matrix. Enforced server-side in service.js on every call.
// SysAdmin has NO customer-commitment authority by default (no draft, approve, execute, outcome).

const ROLES = ['desk_owner', 'responder', 'approver', 'technician', 'supervisor', 'sysadmin'];

const ACTIONS = {
  'card.view':            'See cards and their history',
  'card.create_manual':   'Type in a request by hand',
  'card.assign':          'Set or change owner, backup, next action and due time',
  'card.edit_fields':     'Correct customer name, contact, category, urgency',
  'card.verify_contact':  'Confirm the customer contact is real (called back, matched records)',
  'card.run_extraction':  'Run the helper that reads the request and suggests fields',
  'card.set_waiting':     'Move a card to Waiting (with reason and follow-up date)',
  'card.set_in_review':   'Move a card to In Review',
  'card.complete':        'Mark a card Completed (needs outcome)',
  'card.close_no_action': 'Close a card with no action (needs reason)',
  'draft.generate':       'Ask the helper to write a draft reply',
  'draft.edit':           'Write or change a draft reply',
  'draft.reject':         'Throw away a draft',
  'approval.approve':     'Press Yes on an exact draft (customer commitment)',
  'approval.revoke':      'Press Stop on an approval before it runs',
  'external.execute':     'Run an approved customer action (in this build: MOCK outbox only)',
  'outcome.record':       'Record what happened (booked, lost, no answer...)',
  'metrics.view':         'See desk numbers',
  'audit.view':           'See the attempts log',
  'users.view':           'See the people on this desk',
};

const Y = true, N = false;
// columns: desk_owner, responder, approver, technician, supervisor, sysadmin
const MATRIX = {
  'card.view':            [Y, Y, Y, Y, Y, Y],
  'card.create_manual':   [Y, Y, Y, Y, Y, N],
  'card.assign':          [Y, N, Y, N, Y, N],
  'card.edit_fields':     [Y, Y, Y, Y, Y, N],
  'card.verify_contact':  [Y, Y, Y, N, Y, N],
  'card.run_extraction':  [Y, Y, Y, N, Y, N],
  'card.set_waiting':     [Y, Y, Y, Y, Y, N],
  'card.set_in_review':   [Y, Y, Y, N, Y, N],
  'card.complete':        [Y, Y, Y, N, Y, N],
  'card.close_no_action': [Y, N, Y, N, Y, N],
  'draft.generate':       [Y, Y, Y, N, Y, N],
  'draft.edit':           [Y, Y, Y, N, Y, N],
  'draft.reject':         [Y, Y, Y, N, Y, N],
  'approval.approve':     [Y, N, Y, N, Y, N],
  'approval.revoke':      [Y, N, Y, N, Y, N],
  'external.execute':     [Y, Y, Y, N, Y, N],
  'outcome.record':       [Y, Y, Y, Y, Y, N],
  'metrics.view':         [Y, N, Y, N, Y, Y],
  'audit.view':           [Y, N, N, N, Y, Y],
  'users.view':           [Y, Y, Y, Y, Y, Y],
};

function can(role, action) {
  const i = ROLES.indexOf(role);
  const row = MATRIX[action];
  if (i < 0 || !row) return false; // unknown role or action: deny
  return row[i] === true;
}

// Lifecycle
const ACTIVE = ['new', 'assigned', 'in_review', 'waiting'];
const TRANSITIONS = {
  new:        ['assigned', 'closed_no_action'],
  assigned:   ['in_review', 'waiting', 'completed', 'closed_no_action'],
  in_review:  ['assigned', 'waiting', 'completed', 'closed_no_action'],
  waiting:    ['in_review', 'assigned', 'completed', 'closed_no_action'],
  completed:  [],
  closed_no_action: [],
};
const STATUS_WORDS = {
  new: 'New', assigned: 'Assigned', in_review: 'In Review', waiting: 'Waiting',
  completed: 'Completed', closed_no_action: 'Closed — No Action',
};

module.exports = { ROLES, ACTIONS, MATRIX, can, ACTIVE, TRANSITIONS, STATUS_WORDS };
