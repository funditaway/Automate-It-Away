// Lead Catcher — Official AIA Pack. Ported from the tested reference build (/workspace/aia-lead-catcher).
'use strict';
// Deterministic rule-based extractor (default; needs no model key).
// It only SUGGESTS fields. It never verifies contact, never changes status,
// never approves, never sends. Customer text is treated as untrusted data.
const { normPhone, normEmail } = require('./_lc-util');

const CATEGORIES = [
  ['plumbing',    /\b(plumb\w*|leak\w*|pipe\w*|drain\w*|clog\w*|toilet|faucet|sewer|water heater|burst)\b/i],
  ['hvac',        /\b(hvac|furnace|a\/?c\b|air condition\w*|heat pump|no heat|thermostat|ac unit|boiler|duct\w*)\b/i],
  ['electrical',  /\b(electric\w*|outlet\w*|breaker\w*|panel|wiring|sparking|spark\w*|power out|light switch)\b/i],
  ['roofing',     /\b(roof\w*|shingle\w*|gutter\w*|skylight|flashing)\b/i],
  ['restoration', /\b(flood\w*|mold|water damage|fire damage|smoke damage|restoration|sewage backup|mitigation)\b/i],
];
const EMERGENCY = /\b(flood\w*|burst|gas smell|smell(s)? gas|sparking|smoke|no heat|water everywhere|ceiling (is )?(falling|caving)|emergency|sewage)\b/i;
const HIGH = /\b(asap|today|urgent|right away|tonight|as soon as)\b/i;
const LOW = /\b(no rush|whenever|next month|quote for later|just a quote)\b/i;
// Instruction-like text aimed at the system. Flagged for a person; never obeyed.
const INJECTION = /(ignore (all |any )?(previous|prior|above) (instructions|rules)|\bsystem\s*:|you are now|approve (this|the|all)|send (this|it|the reply) (now|immediately|to)|auto[-_ ]?send|mark (the )?contact (as )?verified|change (the )?(policy|rules)|disable (approval|approvals)|\bjailbreak\b)/i;

const PHONE_RE = /(\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const NAME_RE = /\b(?:my name is|this is|i am|i'm)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/;
const ADDRESS_RE = /\b\d{1,6}\s+[A-Za-z0-9.]+(?:\s+[A-Za-z0-9.]+){0,3}\s+(st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd|ct|court|way|pl|place)\b/i;

function extract(text, fields) {
  const t = String(text || '');
  const f = fields || {};
  const out = { suggestions: {}, missing: [], uncertain: [], notes: [], extractor: 'rules-v1' };

  const phones = [...new Set([...(f.phone ? [f.phone] : []), ...(t.match(PHONE_RE) || [])].map(normPhone).filter((p) => p.length >= 11))];
  const emails = [...new Set([...(f.email ? [f.email] : []), ...(t.match(EMAIL_RE) || [])].map(normEmail))];
  if (phones.length) out.suggestions.customer_phone = phones[0];
  if (emails.length) out.suggestions.customer_email = emails[0];
  if (phones.length > 1) out.uncertain.push('more_than_one_phone');
  if (emails.length > 1) out.uncertain.push('more_than_one_email');
  if (!phones.length && !emails.length) out.missing.push('contact');

  const nm = f.name ? String(f.name).trim() : ((t.match(NAME_RE) || [])[1] || '');
  if (nm) out.suggestions.customer_name = nm.slice(0, 80); else out.missing.push('customer_name');

  if (!ADDRESS_RE.test(t) && !f.address) out.missing.push('service_address');
  if (t.replace(/\s+/g, ' ').trim().length < 15) out.missing.push('problem_description');

  const hits = CATEGORIES.filter(([, re]) => re.test(t)).map(([c]) => c);
  if (hits.length === 1) out.suggestions.category = hits[0];
  else if (hits.length > 1) { out.suggestions.category = hits[0]; out.uncertain.push('category:' + hits.join('|')); }
  else { out.suggestions.category = 'other'; out.uncertain.push('category_unknown'); }

  if (EMERGENCY.test(t)) out.suggestions.urgency = 'emergency';
  else if (HIGH.test(t)) out.suggestions.urgency = 'high';
  else if (LOW.test(t)) out.suggestions.urgency = 'low';
  else out.suggestions.urgency = 'normal';

  if (INJECTION.test(t)) {
    out.uncertain.push('request_contains_instructions');
    out.notes.push('The request contains text that reads like instructions to the system. It was stored as customer words only and ignored as instructions.');
  }
  return out;
}

module.exports = { extract, INJECTION };
