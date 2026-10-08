// Lead Catcher — Official AIA Pack. AI work package (rule-based by default).
'use strict';
// AI prepares; a person checks and authorizes. This builds a proposal ONLY from the scoped context
// made by _lc-context.buildContext. It is a pure function: no store, no network, no environment.
// Nothing in a package sends anything, confirms anything, or counts as a Yes.
const rules = require('./_lc-extract');
const draftLib = require('./_lc-draft');

// Customer asked about timing / price. These become separate decisions for a person.
const SCHEDULE_ASK = /\b(today|tomorrow|tonight|this (?:morning|afternoon|evening|week|weekend)|next (?:week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|on (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|asap|as soon as|when can|what time|available|availability|schedule|appointment|come out|come by)\b/i;
const PRICE_ASK = /(\bhow much\b|\bcost\w*\b|\bprice\w*\b|\bquote\b|\bestimate\b|\bcharge\b|\brates?\b|\bfees?\b|\$\s?\d)/i;
const SERVICE_NOUNS = ['water heater', 'tankless heater', 'garbage disposal', 'sump pump', 'furnace', 'air conditioner', 'ac unit', 'heat pump', 'thermostat', 'boiler', 'toilet', 'faucet', 'sink', 'drain', 'sewer line', 'pipe', 'outlet', 'breaker', 'electrical panel', 'panel', 'light switch', 'ceiling fan', 'roof', 'gutter', 'shingles', 'skylight', 'mold', 'water damage', 'fire damage'];
const SERVICE_VERBS = ['replace', 'repair', 'fix', 'install', 'inspect', 'clean', 'unclog', 'service'];
const KIND_WORDS = { plumbing: 'plumbing', hvac: 'heating and cooling', electrical: 'electrical', roofing: 'roofing', restoration: 'restoration', other: 'other' };
const QUESTIONS = {
  contact: 'What is the best phone number or email to reach you?',
  customer_name: 'Who should we ask for?',
  service_address: 'What is the address where the work is needed?',
  problem_description: 'Can you tell us a little more about the problem?',
};
const ADDRESS_RE = /\b\d{1,6}\s+[A-Za-z0-9.]+(?:\s+[A-Za-z0-9.]+){0,3}\s+(st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd|ct|court|way|pl|place)\b/i;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function serviceOf(text) {
  const t = String(text || '').toLowerCase();
  const noun = SERVICE_NOUNS.find((n) => t.includes(n));
  if (!noun) return null;
  const verb = SERVICE_VERBS.find((v) => new RegExp('\\b' + v + '\\w*\\b[^.?!]{0,30}' + noun).test(t));
  return verb ? cap(verb) + ' ' + noun : cap(noun);
}
function aboutService(service, category) {
  if (!service) return 'about a ' + KIND_WORDS[category] + ' job';
  const m = service.match(/^(Replace|Repair|Fix|Install|Inspect|Clean|Unclog|Service) (.+)$/);
  return m ? 'to ' + m[1].toLowerCase() + ' the ' + m[2] : 'about the ' + service.toLowerCase();
}
function fill(tpl, vals) { return String(tpl).replace(/\{(\w+)\}/g, (m, k) => (vals[k] == null ? '' : vals[k])); }

// ctx: the frozen object from buildContext. extra: optional allow-listed model suggestions.
function build(ctx, extra) {
  const text = [ctx.original_message].concat((ctx.latest_replies || []).map((r) => r.text)).join('\n');
  const latest = ctx.latest_replies && ctx.latest_replies.length ? ctx.latest_replies[ctx.latest_replies.length - 1].text : ctx.original_message;
  const ex = rules.extract(text, {});
  const sug = Object.assign({}, ex.suggestions, (extra && extra.suggestions) || {});
  const card = ctx.card || {};
  const name = card.customer_name || sug.customer_name || null;
  const phone = card.customer_phone || sug.customer_phone || null;
  const email = card.customer_email || sug.customer_email || null;
  const category = card.category || sug.category || 'other';
  const urgency = card.urgency || sug.urgency || 'normal';
  const service = serviceOf(text);
  const addr = card.service_address || ((text.match(ADDRESS_RE) || [])[0] || null);
  const schedule = SCHEDULE_ASK.exec(latest) || SCHEDULE_ASK.exec(text);
  const price = PRICE_ASK.test(latest) || PRICE_ASK.test(text);
  const injected = ex.uncertain.includes('request_contains_instructions');

  const missing = [];
  if (!phone && !email) missing.push('contact');
  if (!name) missing.push('customer_name');
  if (!addr) missing.push('service_address');
  if (ex.missing.includes('problem_description')) missing.push('problem_description');

  const items = [];
  const add = (key, kind, label, value, more) => items.push(Object.assign({ key, kind, label, value, state: 'proposed' }, more || {}));
  const asks = [schedule ? 'when someone can come' : null, price ? 'what it will cost' : null].filter(Boolean);
  add('summary', 'summary', 'Summary',
    (name || 'A customer') + ' asked ' + aboutService(service, category) + ' (urgency: ' + urgency + ').'
    + (asks.length ? ' They want to know ' + asks.join(' and ') + '.' : '')
    + (ctx.latest_replies && ctx.latest_replies.length ? ' This follows their latest reply.' : '')
    + (injected ? ' The message also has text that reads like instructions to AIA. It was ignored.' : ''));
  if (name) add('contact_name', 'detail', 'Name', name, { field: 'customer_name' });
  if (phone) add('contact_phone', 'detail', 'Phone', phone, { field: 'customer_phone', note: 'Not confirmed. A person confirms it.' });
  if (email) add('contact_email', 'detail', 'Email', email, { field: 'customer_email', note: 'Not confirmed. A person confirms it.' });
  add('service', 'detail', 'Service', service || 'Not clear yet', { field: 'service' });
  add('location', 'detail', 'Location', addr || 'Not given', { field: 'service_address' });
  add('request', 'detail', 'What they want', (service || cap(KIND_WORDS[category]) + ' help') + (asks.length ? '; asks ' + asks.join(' and ') : '') + '.');
  missing.forEach((m) => add('question:' + m, 'question', 'Ask the customer', QUESTIONS[m]));
  add('category', 'detail', 'Suggested kind of job', category, { field: 'category' });
  if (schedule) add('decision:schedule', 'decision', 'Scheduling', 'They asked about ' + schedule[0].toLowerCase() + '. A person must check availability and confirm. Do not confirm a time or a booking.', { needs: 'confirmation' });
  if (price) add('decision:price', 'decision', 'Price', 'They asked what it will cost. Only an authorized estimate from a person can answer. Do not give a price.', { needs: 'authorized_estimate' });
  const steps = [];
  if (!phone && !email) steps.push('get a phone number or email');
  else if (!card.contact_verified) steps.push('call back to confirm the contact');
  if (schedule) steps.push('check the schedule');
  if (price) steps.push('arrange an estimate');
  if (missing.includes('service_address')) steps.push('get the service address');
  const next = steps.length ? cap(steps.join(', then ')) + '.' : 'Reply and set a next step.';
  add('next_step', 'detail', 'Recommended next step', (urgency === 'emergency' ? 'Urgent: ' : '') + next, { field: 'next_action' });

  // Draft: from the desk's templates only. Never a time, a booking or a price. Never copies customer words.
  const tpl = (id) => ((ctx.templates || []).find((t) => t.id === id) || {}).text || '';
  const first = name ? String(name).split(/\s+/)[0] : '';
  let draft = fill(tpl('first_reply'), {
    first_name: first || 'there', business: ctx.scope.business, job: service ? 'the ' + service.toLowerCase().replace(/^(replace|repair|fix|install|inspect|clean|unclog|service) /, '') : 'your ' + KIND_WORDS[category] + ' job',
    owner: card.owner_first_name || 'Someone from our team', how: card.verified_channel === 'email' ? 'email you' : 'call you',
  });
  if (schedule || price) draft += ' ' + tpl('time_and_price').split('. ').filter((s) => (schedule && /timing|schedule/.test(s)) || (price && /cost|estimate/.test(s))).join('. ').replace(/\.?$/, '.');
  const qs = missing.filter((m) => m !== 'contact').map((m) => QUESTIONS[m]);
  if (qs.length) draft += ' ' + fill(tpl('need_info'), { questions: qs.join(' ') });
  if (urgency === 'emergency') draft += ' If anyone is in danger or you smell gas, leave the building and call 911 first.';
  draft += ' — ' + ctx.scope.business;
  add('draft', 'draft', 'Draft reply (editable)', draft, { lint: draftLib.lint(draft) });

  return {
    source: extra && extra.used ? 'rules-v1+model' : 'rules-v1',
    card_id: ctx.scope.card_id, desk: ctx.scope.desk,
    decisions: items.filter((i) => i.kind === 'decision').map((i) => ({ key: i.key, needs: i.needs })),
    flags: ex.uncertain.slice(), items,
    note: 'Prepared by AIA from this card only. Check each item. Accepting an item never sends anything and never counts as Yes.',
  };
}

module.exports = { build, SCHEDULE_ASK, PRICE_ASK };
