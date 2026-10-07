// Lead Catcher — Official AIA Pack. Ported from the tested reference build (/workspace/aia-lead-catcher).
'use strict';
// Draft writer (deterministic template) + draft linter.
// The template never states a price, a time slot, a diagnosis, coverage, or a promise.
// It never copies customer text into the reply.
const { sha256, canonical } = require('./_lc-util');

const CATEGORY_WORDS = {
  plumbing: 'your plumbing problem', hvac: 'your heating or cooling problem', electrical: 'your electrical problem',
  roofing: 'your roof', restoration: 'the damage at your property', other: 'your request',
};

function templateDraft(card, tenant, owner) {
  const first = (card.customer_name || '').split(/\s+/)[0];
  const hi = first ? 'Hi ' + first + ',' : 'Hi,';
  const what = CATEGORY_WORDS[card.category] || CATEGORY_WORDS.other;
  const who = owner ? owner.name.split(/\s+/)[0] : 'Someone from our team';
  const how = card.verified_channel === 'phone' ? 'call you at this number' : 'reply to you here';
  const urgentLine = card.urgency === 'emergency'
    ? ' If anyone is in danger or you smell gas, leave the building and call 911 first.'
    : '';
  return hi + ' thanks for contacting ' + tenant.business_name + '. We got your message about ' + what + '. '
    + who + ' will ' + how + ' to talk about next steps. We have not set a time or a price yet.' + urgentLine
    + ' — ' + tenant.business_name;
}

const LINT = [
  ['mentions_price', /\$\s?\d|\b\d+\s?(dollars|bucks)\b|\bfree (estimate|inspection)\b/i],
  ['promises_time', /\b(today|tonight|tomorrow|within \d+ (minutes|hours)|at \d{1,2}(:\d{2})?\s?(am|pm))\b/i],
  ['guarantee_words', /\b(guarantee\w*|promise\w*|warrant(y|ies))\b/i],
  ['coverage_words', /\b(insurance (will|should) cover|covered by (your )?insurance|claim (will|is) (approved|covered))\b/i],
  ['diagnosis_words', /\b(it'?s (definitely|probably) (a|your)|the problem is|you need a new)\b/i],
];
function lint(content) { return LINT.filter(([, re]) => re.test(content)).map(([k]) => k); }

// The exact bytes a Yes is bound to.
function payloadOf(card, d) {
  return {
    tenant_id: card.tenant_id,
    card_id: card.id,
    channel: d.channel,
    recipient: d.recipient,
    content: d.content,
    attachments: d.attachments || [],
    commitment: d.commitment || {},
  };
}
function payloadHash(card, d) { return sha256(canonical(payloadOf(card, d))); }

module.exports = { templateDraft, lint, payloadOf, payloadHash };
