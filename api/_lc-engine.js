'use strict';
// Lead Catcher — Official AIA Pack engine. All rules are enforced here, server-side:
// pack gate, roles, desk (tenant) isolation, lifecycle, payload-bound Yes, idempotent runs, history.
// Data lives in the ISOLATED Lead Catcher store (api/_lc-store.js), never the shared AIA store.
// Outbound actions go to a MOCK outbox only. Nothing is sent. Collect stays OFF.
const crypto = require('crypto');
const store = require('./_lc-store');
const policy = require('./_lc-policy');
const { ADAPTERS } = require('./_lc-intake');
const rules = require('./_lc-extract');
const model = require('./_lc-model');
const draftLib = require('./_lc-draft');
const { sha256, canonical, normPhone, normEmail, normText, HttpError } = require('./_lc-util');

const PACK_ID = 'lead-catcher';
const OUTCOMES = ['booked', 'quoted', 'referred', 'no_answer', 'not_a_fit', 'lost', 'spam', 'other'];
const ATTRIBUTION = ['staff_recorded', 'customer_said', 'calendar_match'];
const URG = ['emergency', 'high', 'normal', 'low'];

let clock = () => new Date();
function setClock(fn) { clock = fn || (() => new Date()); }
const iso = () => clock().toISOString();
const ttlMs = () => Number(process.env.AIA_LC_APPROVAL_TTL_MIN || 60) * 60000;
const id = (p) => p + '_' + crypto.randomBytes(9).toString('hex');
const clone = (o) => JSON.parse(JSON.stringify(o));

// ---------- history (append-only, hash-chained so tampering is detectable) ----------
function chain(D, entry) {
  const prev = D.activity.length ? D.activity[D.activity.length - 1].hash : 'genesis';
  D.seq += 1;
  const e = Object.assign({ seq: D.seq, desk: D.slug }, entry);
  e.hash = sha256(prev + canonical(e));
  D.activity.push(e);
}
function log(D, card, actor, kind, event, summary, detail) {
  chain(D, { card_id: card ? card.id : null, at: iso(), actor_id: actor ? actor.id : null, actor_name: actor ? actor.name : null, actor_kind: kind, event, summary, detail: detail || {} });
}
function verifyChain(D) {
  let prev = 'genesis';
  for (const e of D.activity) {
    const body = Object.assign({}, e); delete body.hash;
    if (sha256(prev + canonical(body)) !== e.hash) return { ok: false, brokenAt: e.seq };
    prev = e.hash;
  }
  return { ok: true, entries: D.activity.length };
}
function attempt(D, actor, action, target, outcome, reason) {
  D.attempts.push({ at: iso(), desk: D.slug, actor_id: actor ? actor.id : null, action, target: target || null, outcome, reason: reason || null });
  if (D.attempts.length > 5000) D.attempts.splice(0, D.attempts.length - 5000);
}

// ---------- gates ----------
function deskOf(actor) {
  if (store.liveBlocked()) throw new HttpError(503, 'not_on_live_site', 'Lead Catcher is not turned on for the live site yet.');
  if (!actor || !actor.desk) throw new HttpError(401, 'unauthenticated', 'Open your desk first.');
  return store.desk(actor.desk);
}
function requirePackOn(D) { if (!D.pack || !D.pack.on) throw new HttpError(409, 'pack_off', 'Lead Catcher is not turned on for this desk. The desk owner turns it on from the Lead Catcher page.'); }
function requirePerm(D, actor, action, target) {
  if (!actor || !actor.id) { attempt(D, null, action, target, 'denied', 'not signed in'); throw new HttpError(401, 'unauthenticated', 'Open your desk first.'); }
  if (!policy.can(actor.role, action)) {
    attempt(D, actor, action, target, 'denied', 'role ' + (actor.role || 'none') + ' cannot ' + action);
    throw new HttpError(403, 'forbidden', 'Your seat (' + (actor.role || 'no Lead Catcher role').replace('_', ' ') + ') cannot do this: ' + (policy.ACTIONS[action] || action) + '.');
  }
}
function loadCard(D, actor, cardId, action) {
  const c = D.cards.find((x) => x.id === String(cardId || '') && x.desk === D.slug);
  if (!c) { attempt(D, actor, action, cardId, 'denied', 'card not on caller desk'); throw new HttpError(404, 'not_found', 'No such card on your desk.'); }
  return c;
}
function seat(actor, personId) { return (actor.people || []).find((p) => p.id === personId) || null; }
function save() { store.persist(); }

// ---------- pack: get once on the account, turn on per desk; both need a person's Yes ----------
function packStatus(actor) {
  const D = deskOf(actor);
  const acct = store.account(actor.accountKey);
  return {
    pack: PACK_ID, name: 'Lead Catcher', official: true, brand: 'AIA',
    owned: acct.owned.some((o) => o.pack === PACK_ID), on: !!(D.pack && D.pack.on), desk: D.slug,
    price: 0, charged: false, collect: 'off',
    note: 'No charge in AIA. Getting or turning on the pack never charges anything. Collect stays off.',
    store: 'Lead Catcher test store (separate from your live desk data).',
  };
}
function getPack(actor, b) {
  const D = deskOf(actor);
  if (!actor.isOwner) { attempt(D, actor, 'pack.get', PACK_ID, 'denied', 'not owner'); throw new HttpError(403, 'forbidden', 'Only the desk owner can add a pack to the account.'); }
  if (b.confirm !== true) throw new HttpError(409, 'needs_yes', 'Adding Lead Catcher needs your Yes. Nothing is charged.');
  const acct = store.account(actor.accountKey);
  if (!acct.owned.some((o) => o.pack === PACK_ID)) acct.owned.push({ pack: PACK_ID, at: iso(), by: actor.id, price: 0, charged: false });
  attempt(D, actor, 'pack.get', PACK_ID, 'allowed');
  log(D, null, actor, 'human', 'pack_owned', 'Lead Catcher added to the account. No charge.', { charged: false });
  save();
  return packStatus(actor);
}
function turnOn(actor, b) {
  const D = deskOf(actor);
  if (!actor.isOwner) { attempt(D, actor, 'pack.turn_on', PACK_ID, 'denied', 'not owner'); throw new HttpError(403, 'forbidden', 'Only the desk owner can turn a pack on.'); }
  const acct = store.account(actor.accountKey);
  if (!acct.owned.some((o) => o.pack === PACK_ID)) throw new HttpError(409, 'not_owned', 'Add Lead Catcher to the account first.');
  if (b.confirm !== true) throw new HttpError(409, 'needs_yes', 'Turning on Lead Catcher changes how this desk works. It needs your Yes.');
  const intakeKey = 'lc_' + crypto.randomBytes(12).toString('hex');
  D.pack = { on: true, at: iso(), by: actor.id, intakeKeyHash: sha256(intakeKey) };
  attempt(D, actor, 'pack.turn_on', PACK_ID, 'allowed');
  log(D, null, actor, 'human', 'pack_on', 'Lead Catcher turned on for this desk. Replies stay drafts until a person presses Yes.', {});
  save();
  return Object.assign(packStatus(actor), { intakeKey, intakeNote: 'Website-form key for this desk. Shown once. It only lets a form drop a request in; it cannot read or send anything.' });
}
function turnOff(actor, b) {
  const D = deskOf(actor);
  if (!actor.isOwner) throw new HttpError(403, 'forbidden', 'Only the desk owner can turn a pack off.');
  if (b.confirm !== true) throw new HttpError(409, 'needs_yes', 'Turning off Lead Catcher needs your Yes. Cards are kept.');
  D.pack = Object.assign({}, D.pack, { on: false, offAt: iso(), offBy: actor.id });
  D.approvals.filter((a) => a.status === 'valid').forEach((a) => { a.status = 'invalidated'; a.ended_at = iso(); a.ended_reason = 'pack turned off'; });
  log(D, null, actor, 'human', 'pack_off', 'Lead Catcher turned off. Cards kept. Open Yes presses cancelled.', {});
  save();
  return packStatus(actor);
}
function setRole(actor, b) {
  const D = deskOf(actor);
  if (!actor.isOwner) { attempt(D, actor, 'roles.set', b.personId, 'denied', 'not owner'); throw new HttpError(403, 'forbidden', 'Only the desk owner sets Lead Catcher seats.'); }
  const p = seat(actor, b.personId);
  if (!p) throw new HttpError(404, 'no_person', 'No such person on this desk.');
  if (p.deskAi) throw new HttpError(400, 'desk_ai', 'A desk AI cannot hold a Lead Catcher seat. It only drafts.');
  if (b.role !== 'none' && !policy.ROLES.includes(b.role)) throw new HttpError(400, 'bad_role', 'Seat must be one of: ' + policy.ROLES.join(', ') + ', none.');
  if (b.confirm !== true) throw new HttpError(409, 'needs_yes', 'Changing a seat needs your Yes.');
  D.roles[p.id] = b.role;
  log(D, null, actor, 'human', 'role_set', (p.name || p.id) + ' now has the Lead Catcher seat: ' + b.role.replace('_', ' ') + '.', { person: p.id, role: b.role });
  save();
  return { ok: true, person: p.id, role: b.role };
}

// ---------- intake ----------
function deskByIntakeKey(key) {
  if (!key) return null;
  const h = sha256(key);
  const s = store.load();
  return Object.values(s.desks).find((D) => D.pack && D.pack.on && D.pack.intakeKeyHash === h) || null;
}
function originalHash(c) { return sha256(canonical({ r: c.original_request, f: c.original_fields, a: c.arrived_at, s: c.source_channel, ref: c.source_ref, d: c.desk })); }
function intake(D, adapterName, body, actor, deskName) {
  requirePackOn(D);
  const adapter = ADAPTERS[adapterName];
  if (!adapter) throw new HttpError(400, 'bad_channel', 'Unknown intake channel.');
  const label = body && body.data_label ? body.data_label : 'test';
  if (!['test', 'demo'].includes(label)) throw new HttpError(400, 'live_disabled', 'Live customer data is not allowed yet. Use test or demo.');
  const n = adapter(body || {});
  if (!normText(n.text) && !n.fields.phone && !n.fields.email) throw new HttpError(400, 'empty', 'The request is empty.');
  const arrived = iso();
  const dedupe = n.sourceRef ? sha256(['ref', n.channel, n.sourceRef].join('|'))
    : sha256(['content', n.channel, normPhone(n.fields.phone), normEmail(n.fields.email), normText(n.text), arrived.slice(0, 10)].join('|'));
  const existing = D.cards.find((c) => c.dedupe_key === dedupe);
  if (existing) {
    log(D, existing, actor, actor ? 'human' : 'channel', 'duplicate_intake', 'Same request came in again by ' + n.channel.replace(/_/g, ' ') + '. No new card made.', { source_ref: n.sourceRef });
    save();
    return { card: existing, duplicate: true };
  }
  const c = {
    id: id('card'), desk: D.slug, data_label: label, status: 'new', source_channel: n.channel, source_is_mock: n.isMock, source_ref: n.sourceRef,
    dedupe_key: dedupe, original_request: n.text, original_fields: n.fields, arrived_at: arrived,
    customer_name: n.fields.name || null, customer_phone: n.fields.phone ? normPhone(n.fields.phone) : null, customer_email: n.fields.email ? normEmail(n.fields.email) : null,
    contact_verified: false, verified_channel: null, verified_value: null, verified_by: null, verified_at: null,
    missing_flags: [], uncertain_flags: [], category: null, urgency: null, owner_id: null, backup_id: null, next_action: null, next_action_due: null,
    waiting_reason: null, follow_up_at: null, close_reason: null, outcome: null, outcome_note: null, outcome_attribution: null, outcome_at: null,
    first_assigned_at: null, first_response_at: null, created_by: actor ? actor.id : null, created_at: arrived, updated_at: arrived,
  };
  c.original_hash = originalHash(c);
  D.cards.push(c);
  D.spans.push({ card_id: c.id, status: 'new', entered_at: arrived });
  log(D, c, actor, actor ? 'human' : 'channel', 'created', 'Request came in by ' + n.channel.replace(/_/g, ' ') + (n.isMock ? ' (MOCK channel)' : '') + '. Their words are saved exactly as sent.', { source_ref: n.sourceRef, data_label: label });
  applyExtraction(D, c, rules.extract(n.text, n.fields), null, 'rules');
  save();
  return { card: c, duplicate: false };
}
function intakeManual(actor, b) {
  const D = deskOf(actor); requirePackOn(D);
  requirePerm(D, actor, 'card.create_manual');
  attempt(D, actor, 'card.create_manual', null, 'allowed');
  return intake(D, 'manual', b, actor);
}
function applyExtraction(D, c, ex, actor, kind) {
  const filled = [];
  for (const k of ['customer_name', 'customer_phone', 'customer_email', 'category', 'urgency']) {
    if (ex.suggestions[k] && !c[k]) { c[k] = ex.suggestions[k]; filled.push(k); }
  }
  c.missing_flags = ex.missing || []; c.uncertain_flags = ex.uncertain || []; c.updated_at = iso();
  log(D, c, actor, kind, 'extraction', 'Helper (' + (ex.extractor || kind) + ') suggested fields. The contact is not confirmed until a person checks it.', { filled, missing: ex.missing, uncertain: ex.uncertain, notes: ex.notes || [], dropped: ex.dropped || [] });
}
async function runExtraction(actor, cardId) {
  const D = deskOf(actor); requirePackOn(D);
  requirePerm(D, actor, 'card.run_extraction', cardId);
  const c = loadCard(D, actor, cardId, 'card.run_extraction');
  const ex = rules.extract(c.original_request, c.original_fields);
  let kind = 'rules';
  if (model.enabled(process.env)) {
    try {
      const m = await model.suggest(c.original_request, process.env);
      if (m.ok) { Object.assign(ex.suggestions, m.suggestions); ex.dropped = m.dropped; ex.extractor = 'rules-v1+model'; kind = 'model'; }
    } catch (e) { ex.notes.push('Model helper failed; rules result kept.'); }
  }
  attempt(D, actor, 'card.run_extraction', cardId, 'allowed');
  applyExtraction(D, c, ex, actor, kind);
  save();
  return detail(actor, cardId);
}

// ---------- read ----------
function isOverdue(c) {
  const t = iso();
  if (!policy.ACTIVE.includes(c.status)) return false;
  if (c.status === 'waiting') return !!(c.follow_up_at && c.follow_up_at < t);
  return !!(c.next_action_due && c.next_action_due < t);
}
function nameOf(actor, pid) { const p = seat(actor, pid); return p ? p.name : null; }
function view(actor, c) { return Object.assign(clone(c), { status_words: policy.STATUS_WORDS[c.status], overdue: isOverdue(c), owner_name: nameOf(actor, c.owner_id), backup_name: nameOf(actor, c.backup_id), original_intact: originalHash(c) === c.original_hash }); }
function list(actor, q) {
  const D = deskOf(actor); requirePackOn(D);
  requirePerm(D, actor, 'card.view');
  q = q || {};
  const v = q.view || 'active';
  let rows = D.cards.filter((c) => c.desk === D.slug);
  const f = {
    active: (c) => policy.ACTIVE.includes(c.status), unassigned: (c) => c.status === 'new', overdue: isOverdue,
    waiting: (c) => c.status === 'waiting', done: (c) => !policy.ACTIVE.includes(c.status), mine: (c) => c.owner_id === actor.id || c.backup_id === actor.id,
  }[v] || (() => true);
  rows = rows.filter(f);
  if (q.status) rows = rows.filter((c) => c.status === q.status);
  if (q.category) rows = rows.filter((c) => c.category === q.category);
  if (q.urgency) rows = rows.filter((c) => c.urgency === q.urgency);
  if (q.label) rows = rows.filter((c) => c.data_label === q.label);
  if (q.q) { const t = String(q.q).toLowerCase().slice(0, 100); rows = rows.filter((c) => [c.original_request, c.customer_name, c.customer_phone, c.customer_email, c.category].join(' ').toLowerCase().includes(t)); }
  const due = (c) => (c.status === 'waiting' ? c.follow_up_at : c.next_action_due) || '9999';
  const sorts = {
    arrived_desc: (a, b) => b.arrived_at.localeCompare(a.arrived_at), arrived_asc: (a, b) => a.arrived_at.localeCompare(b.arrived_at),
    due_asc: (a, b) => due(a).localeCompare(due(b)), urgency: (a, b) => (URG.indexOf(a.urgency) + 9) % 9 - (URG.indexOf(b.urgency) + 9) % 9 || a.arrived_at.localeCompare(b.arrived_at),
  };
  rows.sort(sorts[q.sort] || sorts.arrived_desc);
  return rows.slice(0, 500).map((c) => view(actor, c));
}
function detail(actor, cardId) {
  const D = deskOf(actor); requirePackOn(D);
  requirePerm(D, actor, 'card.view', cardId);
  const c = loadCard(D, actor, cardId, 'card.view');
  return {
    card: view(actor, c),
    drafts: clone(D.drafts.filter((d) => d.card_id === c.id)).sort((a, b) => b.version - a.version),
    approvals: clone(D.approvals.filter((a) => a.card_id === c.id)).reverse(),
    actions: clone(D.actions.filter((a) => a.card_id === c.id)).reverse(),
    history: clone(D.activity.filter((h) => h.card_id === c.id)),
  };
}

// ---------- lifecycle ----------
function span(D, c, to, followUp) {
  const open = D.spans.filter((s) => s.card_id === c.id && !s.left_at).pop();
  if (open) { open.left_at = iso(); if (open.status === 'waiting' && open.follow_up_at) open.follow_up_met = open.left_at <= open.follow_up_at; }
  D.spans.push({ card_id: c.id, status: to, entered_at: iso(), follow_up_at: followUp || null });
}
function invalidate(D, c, actor, reason) {
  const live = D.approvals.filter((a) => a.card_id === c.id && a.status === 'valid');
  if (!live.length) return 0;
  live.forEach((a) => { a.status = 'invalidated'; a.ended_at = iso(); a.ended_reason = reason; });
  log(D, c, actor, actor ? 'human' : 'system', 'approval_invalidated', 'Yes cancelled: ' + reason + '. A person must press Yes again on the new version.', { approvals: live.map((a) => a.id), reason });
  return live.length;
}
function assign(actor, cardId, b) {
  const D = deskOf(actor); requirePackOn(D);
  requirePerm(D, actor, 'card.assign', cardId);
  const c = loadCard(D, actor, cardId, 'card.assign');
  if (!policy.ACTIVE.includes(c.status)) throw new HttpError(409, 'closed', 'This card is closed.');
  const owner = seat(actor, b.ownerId);
  if (!owner) throw new HttpError(400, 'owner_required', 'Pick an owner who works on this desk.');
  if (owner.deskAi || owner.lcRole === 'sysadmin' || !owner.lcRole || owner.lcRole === 'none') throw new HttpError(400, 'owner_role', 'That seat cannot own customer work (desk AIs and System Admins never do).');
  const backup = b.backupId ? seat(actor, b.backupId) : null;
  if (b.backupId && (!backup || backup.deskAi)) throw new HttpError(400, 'backup_invalid', 'The backup must be a person on this desk.');
  const next = String(b.nextAction || '').trim();
  if (!next) throw new HttpError(400, 'next_action_required', 'An active card needs a next action.');
  const due = b.nextActionDue ? new Date(b.nextActionDue) : null;
  if (!due || isNaN(due)) throw new HttpError(400, 'due_required', 'The next action needs a due time.');
  Object.assign(c, { owner_id: owner.id, backup_id: backup ? backup.id : null, next_action: next.slice(0, 300), next_action_due: due.toISOString(), updated_at: iso() });
  if (!c.first_assigned_at) c.first_assigned_at = iso();
  if (c.status === 'new') { span(D, c, 'assigned'); c.status = 'assigned'; }
  attempt(D, actor, 'card.assign', c.id, 'allowed');
  log(D, c, actor, 'human', 'assigned', 'Owner: ' + owner.name + (backup ? ', backup: ' + backup.name : '') + '. Next: ' + next + ' (due ' + c.next_action_due + ').', { owner: owner.id, backup: c.backup_id });
  save();
  return detail(actor, cardId);
}
function updateFields(actor, cardId, b) {
  const D = deskOf(actor); requirePackOn(D);
  requirePerm(D, actor, 'card.edit_fields', cardId);
  const c = loadCard(D, actor, cardId, 'card.edit_fields');
  const sets = {};
  if (b.customer_name !== undefined) sets.customer_name = String(b.customer_name).slice(0, 120) || null;
  if (b.customer_phone !== undefined) sets.customer_phone = b.customer_phone ? normPhone(b.customer_phone) : null;
  if (b.customer_email !== undefined) sets.customer_email = b.customer_email ? normEmail(b.customer_email) : null;
  if (b.category !== undefined) sets.category = String(b.category).slice(0, 40) || null;
  if (b.urgency !== undefined) { if (b.urgency && !URG.includes(b.urgency)) throw new HttpError(400, 'bad_urgency', 'Urgency must be emergency, high, normal or low.'); sets.urgency = b.urgency || null; }
  if (b.next_action !== undefined) {
    if (c.status !== 'new' && policy.ACTIVE.includes(c.status) && !String(b.next_action).trim()) throw new HttpError(400, 'next_action_required', 'An active card needs a next action.');
    sets.next_action = String(b.next_action).slice(0, 300);
  }
  const changed = c.contact_verified && ((c.verified_channel === 'phone' && sets.customer_phone !== undefined && sets.customer_phone !== c.verified_value) || (c.verified_channel === 'email' && sets.customer_email !== undefined && sets.customer_email !== c.verified_value));
  if (changed) Object.assign(sets, { contact_verified: false, verified_channel: null, verified_value: null, verified_by: null, verified_at: null });
  Object.assign(c, sets, { updated_at: iso() });
  attempt(D, actor, 'card.edit_fields', c.id, 'allowed');
  log(D, c, actor, 'human', 'fields_changed', 'Changed: ' + Object.keys(sets).join(', ') + '.', sets);
  if (changed) invalidate(D, c, actor, 'customer contact changed');
  save();
  return detail(actor, cardId);
}
function verifyContact(actor, cardId, b) {
  const D = deskOf(actor); requirePackOn(D);
  requirePerm(D, actor, 'card.verify_contact', cardId);
  const c = loadCard(D, actor, cardId, 'card.verify_contact');
  if (!['phone', 'email'].includes(b.channel)) throw new HttpError(400, 'bad_channel', 'Confirm a phone or an email.');
  const value = b.channel === 'phone' ? c.customer_phone : c.customer_email;
  if (!value) throw new HttpError(400, 'no_value', 'There is no ' + b.channel + ' on this card to confirm.');
  const how = String(b.how || '').trim();
  if (how.length < 4) throw new HttpError(400, 'how_required', 'Say how you confirmed it (for example: called back and they answered).');
  if (c.contact_verified && c.verified_value !== value) invalidate(D, c, actor, 'confirmed contact changed');
  Object.assign(c, { contact_verified: true, verified_channel: b.channel, verified_value: value, verified_by: actor.id, verified_at: iso(), updated_at: iso() });
  attempt(D, actor, 'card.verify_contact', c.id, 'allowed');
  log(D, c, actor, 'human', 'contact_verified', 'Confirmed ' + b.channel + ' ' + value + '. How: ' + how.slice(0, 200), { channel: b.channel, value, how });
  save();
  return detail(actor, cardId);
}
function setStatus(actor, cardId, b) {
  const D = deskOf(actor); requirePackOn(D);
  const to = b && b.to;
  const perm = { waiting: 'card.set_waiting', in_review: 'card.set_in_review', assigned: 'card.set_in_review', completed: 'card.complete', closed_no_action: 'card.close_no_action' }[to];
  if (!perm) throw new HttpError(400, 'bad_status', 'Unknown status. Use Assign to move a New card.');
  requirePerm(D, actor, perm, cardId);
  const c = loadCard(D, actor, cardId, perm);
  if (!policy.TRANSITIONS[c.status].includes(to)) throw new HttpError(409, 'bad_transition', 'A card cannot go from ' + policy.STATUS_WORDS[c.status] + ' to ' + policy.STATUS_WORDS[to] + '.');
  if (['assigned', 'in_review', 'waiting'].includes(to) && (!c.owner_id || !c.next_action)) throw new HttpError(409, 'owner_and_next_action_required', 'An active card needs an owner and a next action.');
  const sets = { status: to };
  let followUp = null;
  if (to === 'waiting') {
    const reason = String(b.reason || '').trim(); const f = b.followUpAt ? new Date(b.followUpAt) : null;
    if (!reason) throw new HttpError(400, 'waiting_reason_required', 'Waiting needs a reason (what are we waiting on?).');
    if (!f || isNaN(f)) throw new HttpError(400, 'follow_up_required', 'Waiting needs a follow-up date.');
    followUp = f.toISOString(); Object.assign(sets, { waiting_reason: reason.slice(0, 300), follow_up_at: followUp });
  } else if (c.status === 'waiting') Object.assign(sets, { waiting_reason: null, follow_up_at: null });
  if (to === 'closed_no_action') {
    const reason = String(b.reason || '').trim();
    if (reason.length < 5) throw new HttpError(400, 'close_reason_required', 'Closing with no action needs a reason.');
    // Same as AIA Kill: a second, deliberate tap.
    if (b.confirm !== true) throw new HttpError(409, 'needs_second_tap', 'Closing with no action needs a second tap.');
    sets.close_reason = reason.slice(0, 300);
  }
  if (to === 'completed' && !c.outcome) throw new HttpError(409, 'outcome_required', 'Record the outcome before marking the card Completed.');
  const from = c.status;
  span(D, c, to, followUp);
  Object.assign(c, sets, { updated_at: iso() });
  if (['completed', 'closed_no_action'].includes(to)) invalidate(D, c, actor, 'card closed');
  attempt(D, actor, perm, c.id, 'allowed');
  log(D, c, actor, 'human', 'status', policy.STATUS_WORDS[from] + ' → ' + policy.STATUS_WORDS[to] + (sets.waiting_reason ? '. Waiting on: ' + sets.waiting_reason + ' (follow up by ' + followUp + ')' : '') + (sets.close_reason ? '. Reason: ' + sets.close_reason : '') + '.', sets);
  save();
  return detail(actor, cardId);
}

// ---------- drafts ----------
function current(D, c) { return D.drafts.filter((d) => d.card_id === c.id && d.state === 'current').sort((a, b) => b.version - a.version)[0] || null; }
function draftable(c) {
  if (!policy.ACTIVE.includes(c.status)) throw new HttpError(409, 'closed', 'This card is closed.');
  if (c.status === 'new' || !c.owner_id) throw new HttpError(409, 'owner_required', 'Give the card an owner before drafting a reply.');
  if (!c.contact_verified) throw new HttpError(409, 'contact_unverified', 'Confirm the customer contact before drafting a reply.');
}
function addDraft(D, c, actor, kind, d) {
  const prev = current(D, c);
  const version = D.drafts.filter((x) => x.card_id === c.id).reduce((m, x) => Math.max(m, x.version), 0) + 1;
  const row = {
    id: id('draft'), desk: D.slug, card_id: c.id, version, channel: d.channel, recipient: d.recipient, content: d.content,
    attachments: d.attachments || [], commitment: d.commitment || {}, payload_hash: draftLib.payloadHash({ tenant_id: D.slug, id: c.id }, d),
    lint_flags: draftLib.lint(d.content), author_kind: kind, author_id: actor ? actor.id : null, based_on_id: prev ? prev.id : null, state: 'current', created_at: iso(),
  };
  if (prev) prev.state = 'superseded';
  invalidate(D, c, actor, 'draft changed to version ' + version);
  D.drafts.push(row);
  if (c.status === 'assigned') { span(D, c, 'in_review'); c.status = 'in_review'; }
  log(D, c, actor, kind === 'human' ? 'human' : kind, 'draft', 'Draft v' + version + ' written by ' + (kind === 'human' ? 'a person' : 'the ' + kind + ' helper') + '. Nothing sent.' + (row.lint_flags.length ? ' Check: ' + row.lint_flags.join(', ') + '.' : ''), { draft_id: row.id, version, payload_hash: row.payload_hash, lint: row.lint_flags });
  return row;
}
function generateDraft(actor, cardId) {
  const D = deskOf(actor); requirePackOn(D);
  requirePerm(D, actor, 'draft.generate', cardId);
  const c = loadCard(D, actor, cardId, 'draft.generate');
  draftable(c);
  const owner = seat(actor, c.owner_id);
  attempt(D, actor, 'draft.generate', c.id, 'allowed');
  addDraft(D, c, actor, 'rules', { channel: c.verified_channel === 'phone' ? 'sms' : 'email', recipient: c.verified_value, content: draftLib.templateDraft(c, { business_name: actor.deskName || 'our team' }, owner), attachments: [], commitment: {} });
  save();
  return detail(actor, cardId);
}
function saveDraft(actor, cardId, b) {
  const D = deskOf(actor); requirePackOn(D);
  requirePerm(D, actor, 'draft.edit', cardId);
  const c = loadCard(D, actor, cardId, 'draft.edit');
  draftable(c);
  const content = String(b.content || '').trim();
  if (!content) throw new HttpError(400, 'empty', 'The draft is empty.');
  if (content.length > 1600) throw new HttpError(400, 'too_long', 'Keep the reply under 1600 characters.');
  const channel = b.channel || (c.verified_channel === 'phone' ? 'sms' : 'email');
  if ((channel === 'sms') !== (c.verified_channel === 'phone')) throw new HttpError(400, 'channel_mismatch', 'The reply channel must match the confirmed contact.');
  attempt(D, actor, 'draft.edit', c.id, 'allowed');
  addDraft(D, c, actor, 'human', { channel, recipient: c.verified_value, content, attachments: Array.isArray(b.attachments) ? b.attachments.map(String) : [], commitment: b.commitment && typeof b.commitment === 'object' ? b.commitment : {} });
  save();
  return detail(actor, cardId);
}
function rejectDraft(actor, cardId, b) {
  const D = deskOf(actor); requirePackOn(D);
  requirePerm(D, actor, 'draft.reject', cardId);
  const c = loadCard(D, actor, cardId, 'draft.reject');
  const d = current(D, c);
  if (!d || d.id !== b.draftId) throw new HttpError(409, 'not_current', 'That draft is not the current one.');
  d.state = 'rejected';
  invalidate(D, c, actor, 'draft thrown away');
  attempt(D, actor, 'draft.reject', c.id, 'allowed');
  log(D, c, actor, 'human', 'draft_rejected', 'Draft v' + d.version + ' thrown away.', { draft_id: d.id });
  save();
  return detail(actor, cardId);
}

// ---------- Yes / Stop / Run ----------
function approve(actor, cardId, b) {
  const D = deskOf(actor); requirePackOn(D);
  requirePerm(D, actor, 'approval.approve', cardId);
  const c = loadCard(D, actor, cardId, 'approval.approve');
  const no = (code, msg, reason, extra) => { attempt(D, actor, 'approval.approve', c.id, 'denied', reason); throw new HttpError(409, code, msg, extra); };
  if (!policy.ACTIVE.includes(c.status) || c.status === 'new') no('not_active', 'Only an active card with an owner can get a Yes.', 'not active');
  const d = current(D, c);
  if (!d || d.id !== b.draftId) no('stale_draft', 'The draft changed. Read the new version, then press Yes.', 'stale draft');
  const re = draftLib.payloadHash({ tenant_id: D.slug, id: c.id }, d);
  if (re !== d.payload_hash || b.payloadHash !== d.payload_hash) no('payload_mismatch', 'What you saw is not what is stored. Reload and check again.', 'payload hash mismatch');
  if (!c.contact_verified || c.verified_value !== d.recipient) no('recipient_unverified', 'The reply goes to a contact that is not confirmed.', 'recipient not verified');
  if (d.lint_flags.length && b.acknowledgeFlags !== true) no('flags_need_ack', 'This draft mentions: ' + d.lint_flags.join(', ') + '. Tick that you checked it.', 'flags not acknowledged', { flags: d.lint_flags });
  if (D.approvals.some((a) => a.draft_id === d.id && a.status === 'executed')) no('already_ran', 'This exact reply already ran. To reply again, write a new version.', 'draft already ran');
  const existing = D.approvals.find((a) => a.draft_id === d.id && a.status === 'valid');
  if (existing) return { approval: clone(existing), alreadyApproved: true, detail: detail(actor, cardId) };
  const a = { id: id('appr'), desk: D.slug, card_id: c.id, draft_id: d.id, draft_version: d.version, payload_hash: d.payload_hash, action_id: id('act'), approver_id: actor.id, approver_role: actor.role, approved_at: iso(), flags_acknowledged: d.lint_flags.length > 0, status: 'valid' };
  D.approvals.push(a);
  attempt(D, actor, 'approval.approve', c.id, 'allowed');
  log(D, c, actor, 'human', 'approved', 'Yes pressed on draft v' + d.version + ' (' + d.channel + ' to ' + d.recipient + '). Bound to this exact text. Any change cancels it.', { approval_id: a.id, action_id: a.action_id, payload_hash: a.payload_hash });
  save();
  return { approval: clone(a), alreadyApproved: false, detail: detail(actor, cardId) };
}
function revoke(actor, cardId, b) {
  const D = deskOf(actor); requirePackOn(D);
  requirePerm(D, actor, 'approval.revoke', cardId);
  const c = loadCard(D, actor, cardId, 'approval.revoke');
  const a = D.approvals.find((x) => x.card_id === c.id && x.id === b.approvalId && x.status === 'valid');
  if (!a) throw new HttpError(409, 'not_valid', 'There is no open Yes with that id.');
  Object.assign(a, { status: 'revoked', ended_at: iso(), ended_reason: String(b.reason || 'Stop pressed').slice(0, 200) });
  attempt(D, actor, 'approval.revoke', c.id, 'allowed');
  log(D, c, actor, 'human', 'approval_revoked', 'Stop pressed. The Yes on draft v' + a.draft_version + ' is cancelled. Nothing ran.', { approval_id: a.id });
  save();
  return detail(actor, cardId);
}
function execute(actor, cardId, b) {
  const D = deskOf(actor); requirePackOn(D);
  requirePerm(D, actor, 'external.execute', cardId);
  const c = loadCard(D, actor, cardId, 'external.execute');
  const actionId = b && typeof b.actionId === 'string' ? b.actionId : '';
  const deny = (code, msg, reason) => { attempt(D, actor, 'external.execute', c.id, 'denied', reason); log(D, c, actor, 'human', 'action_blocked', 'Blocked: ' + msg, { action_id: actionId || null, reason }); save(); throw new HttpError(code === 'no_approval' ? 403 : 409, code, msg); };
  if (!actionId) deny('no_approval', 'No approved action was given. Nothing runs without a person pressing Yes.', 'missing action id');
  const done = D.actions.find((x) => x.action_id === actionId);
  if (done) {
    if (done.card_id !== c.id) deny('no_approval', 'That Yes is for a different card.', 'action id belongs to another card');
    attempt(D, actor, 'external.execute', c.id, 'allowed', 'repeat — returned first result, nothing re-run');
    log(D, c, actor, 'human', 'action_repeat', 'Run pressed again for the same Yes. Nothing ran twice.', { action_id: actionId });
    save();
    return { duplicate: true, action: clone(done) };
  }
  const a = D.approvals.find((x) => x.card_id === c.id && x.action_id === actionId);
  if (!a) deny('no_approval', 'No Yes exists for that action. Nothing runs without a person pressing Yes.', 'no approval for action id');
  if (a.status !== 'valid') deny('approval_not_valid', 'That Yes was ' + a.status + (a.ended_reason ? ' (' + a.ended_reason + ')' : '') + '. Press Yes again on the current draft.', 'approval ' + a.status);
  if (clock().getTime() - new Date(a.approved_at).getTime() > ttlMs()) { Object.assign(a, { status: 'invalidated', ended_at: iso(), ended_reason: 'too old' }); deny('approval_stale', 'That Yes is too old. Check the draft and press Yes again.', 'approval older than ttl'); }
  const d = D.drafts.find((x) => x.id === a.draft_id);
  if (!d || d.state !== 'current' || draftLib.payloadHash({ tenant_id: D.slug, id: c.id }, d) !== a.payload_hash) deny('payload_changed', 'The draft changed after Yes. Press Yes again on the current version.', 'payload hash mismatch');
  if (!c.contact_verified || c.verified_value !== d.recipient) deny('recipient_unverified', 'The customer contact changed or is not confirmed.', 'recipient mismatch');
  if (!policy.ACTIVE.includes(c.status) || c.status === 'new') deny('not_active', 'This card is not active.', 'card not active');
  // Synchronous from here to the save: one Node process cannot interleave, so the action id runs once.
  const ea = { id: id('ext'), desk: D.slug, card_id: c.id, approval_id: a.id, action_id: actionId, adapter: store.outbox.name, adapter_mode: store.outbox.mode, payload_hash: a.payload_hash, status: 'pending', executed_by: actor.id, started_at: iso() };
  D.actions.push(ea);
  Object.assign(a, { status: 'executed', ended_at: iso(), ended_reason: 'ran' });
  save();
  try {
    ea.result = store.outbox.deliver({ desk: D.slug, card_id: c.id, action_id: actionId, approval_id: a.id, approved_by: a.approver_id, payload_hash: a.payload_hash, at: iso(), payload: draftLib.payloadOf({ tenant_id: D.slug, id: c.id }, d) });
    ea.status = 'written_to_mock_outbox';
  } catch (e) {
    ea.status = 'failed'; ea.result = { error: 'mock outbox write failed' };
    log(D, c, actor, 'human', 'action_failed', 'The MOCK outbox write failed. Nothing was sent.', { action_id: actionId });
    save();
    throw new HttpError(500, 'adapter_failed', 'The test send failed. Nothing was sent.');
  }
  ea.finished_at = iso();
  if (!c.first_response_at) c.first_response_at = iso();
  attempt(D, actor, 'external.execute', c.id, 'allowed');
  log(D, c, actor, 'human', 'action_ran', 'Test send ran: the approved ' + d.channel + ' reply went to the MOCK outbox. Nothing was sent to the customer.', { action_id: actionId, adapter: ea.adapter, mode: ea.adapter_mode, payload_hash: a.payload_hash });
  save();
  return { duplicate: false, action: clone(ea) };
}
function recordOutcome(actor, cardId, b) {
  const D = deskOf(actor); requirePackOn(D);
  requirePerm(D, actor, 'outcome.record', cardId);
  const c = loadCard(D, actor, cardId, 'outcome.record');
  if (!OUTCOMES.includes(b.outcome)) throw new HttpError(400, 'bad_outcome', 'Outcome must be one of: ' + OUTCOMES.join(', ') + '.');
  if (b.outcome === 'booked' && !ATTRIBUTION.includes(b.attribution)) throw new HttpError(400, 'attribution_required', 'Say how you know it was booked: ' + ATTRIBUTION.join(', ') + '.');
  Object.assign(c, { outcome: b.outcome, outcome_note: String(b.note || '').slice(0, 500) || null, outcome_attribution: b.attribution || null, outcome_at: iso(), updated_at: iso() });
  attempt(D, actor, 'outcome.record', c.id, 'allowed');
  log(D, c, actor, 'human', 'outcome', 'Outcome: ' + b.outcome + (b.attribution ? ' (how we know: ' + b.attribution + ')' : '') + (c.outcome_note ? '. ' + c.outcome_note : ''), { outcome: b.outcome, attribution: b.attribution || null });
  save();
  return detail(actor, cardId);
}

// ---------- numbers ----------
function stats(arr) {
  if (!arr.length) return { count: 0, median_min: null, p90_min: null };
  const s = arr.slice().sort((x, y) => x - y); const q = (p) => s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)];
  return { count: s.length, median_min: Math.round(q(0.5) * 10) / 10, p90_min: Math.round(q(0.9) * 10) / 10 };
}
function metrics(actor, q) {
  const D = deskOf(actor); requirePackOn(D);
  requirePerm(D, actor, 'metrics.view');
  const now = iso(); const h48 = new Date(clock().getTime() - 48 * 3600e3).toISOString();
  const cards = D.cards.filter((c) => !q || !q.label || c.data_label === q.label);
  const ids = new Set(cards.map((c) => c.id));
  const mins = (a, b) => (new Date(b) - new Date(a)) / 60000;
  const active = cards.filter((c) => policy.ACTIVE.includes(c.status));
  const old = active.filter((c) => c.arrived_at < h48);
  const reasons = {}; old.filter((c) => c.status === 'waiting').forEach((c) => { reasons[c.waiting_reason] = (reasons[c.waiting_reason] || 0) + 1; });
  const ws = D.spans.filter((s) => ids.has(s.card_id) && s.status === 'waiting');
  const ended = ws.filter((s) => s.left_at); const missedOpen = ws.filter((s) => !s.left_at && s.follow_up_at < now).length;
  const met = ended.filter((s) => s.follow_up_met).length; const denom = ended.length + missedOpen;
  const drafts = D.drafts.filter((d) => ids.has(d.card_id));
  const approved = (d) => D.approvals.some((a) => a.draft_id === d.id && (a.status === 'valid' || a.status === 'executed'));
  const kindOf = (did) => { const x = D.drafts.find((y) => y.id === did); return x ? x.author_kind : null; };
  const helper = (k) => k === 'rules' || k === 'model';
  const booked = {}; cards.filter((c) => c.outcome === 'booked').forEach((c) => { booked[c.outcome_attribution] = (booked[c.outcome_attribution] || 0) + 1; });
  return {
    as_of: now, data: 'test and demo only',
    first_customer_response: Object.assign(stats(cards.filter((c) => c.first_response_at).map((c) => mins(c.arrived_at, c.first_response_at))), { without_response: cards.filter((c) => !c.first_response_at && c.status !== 'closed_no_action').length, definition: 'Arrival to the first customer reply a person approved and ran. Giving the card an owner does not count. Here the reply is a MOCK outbox write.' }),
    internal_triage: Object.assign(stats(cards.filter((c) => c.first_assigned_at).map((c) => mins(c.arrived_at, c.first_assigned_at))), { definition: 'Arrival to first owner.' }),
    unassigned_active: active.filter((c) => c.status === 'new').length,
    overdue_active: active.filter(isOverdue).length,
    unresolved_after_48h: { not_waiting: old.filter((c) => c.status !== 'waiting').length, waiting: old.filter((c) => c.status === 'waiting').length, waiting_reasons: reasons },
    on_time_follow_up: { met, missed: ended.length - met + missedOpen, rate: denom ? Math.round((met / denom) * 1000) / 10 : null },
    draft_quality: {
      approved_as_is: drafts.filter((d) => approved(d) && helper(d.author_kind)).length,
      approved_after_edit: drafts.filter((d) => approved(d) && d.author_kind === 'human' && helper(kindOf(d.based_on_id))).length,
      human_written_approved: drafts.filter((d) => approved(d) && d.author_kind === 'human' && !helper(kindOf(d.based_on_id))).length,
      helper_drafts_rejected: drafts.filter((d) => d.state === 'rejected' && helper(d.author_kind)).length,
    },
    booked_opportunities: { total: Object.values(booked).reduce((x, y) => x + y, 0), by_attribution: booked, definition: 'Cards marked booked, with how staff know. Not revenue.' },
    staff_handling_time: { measured: false, method: 'Not measured yet. Plan: a supervisor times a sample of 20 cards a week.' },
  };
}
function attempts(actor) {
  const D = deskOf(actor);
  requirePerm(D, actor, 'audit.view');
  return clone(D.attempts.slice(-200).reverse());
}
function historyCheck(actor) {
  const D = deskOf(actor);
  requirePerm(D, actor, 'audit.view');
  return verifyChain(D);
}

module.exports = {
  PACK_ID, setClock, packStatus, getPack, turnOn, turnOff, setRole, deskByIntakeKey, intake, intakeManual, runExtraction,
  list, detail, assign, updateFields, verifyContact, setStatus, generateDraft, saveDraft, rejectDraft, approve, revoke, execute,
  recordOutcome, metrics, attempts, historyCheck, verifyChain, attempt,
};
