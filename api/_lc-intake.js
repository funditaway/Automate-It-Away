// Lead Catcher — Official AIA Pack. Ported from the tested reference build (/workspace/aia-lead-catcher).
'use strict';
// Intake adapters normalize a channel's body into one shape.
// web_form: real adapter shape (a website form POST). Not connected to any live site.
// manual: typed in by staff.
// mock_email / mock_sms / mock_missed_call: MOCK. No provider is connected.

function s(v, max) { return v == null ? '' : String(v).slice(0, max || 4000); }

const ADAPTERS = {
  web_form(body) {
    return {
      channel: 'web_form', isMock: false, sourceRef: s(body.submission_id, 120) || null,
      text: s(body.message), fields: { name: s(body.name, 120), phone: s(body.phone, 40), email: s(body.email, 160), address: s(body.address, 200) },
    };
  },
  manual(body) {
    return {
      channel: 'manual', isMock: false, sourceRef: s(body.source_ref, 120) || null,
      text: s(body.request), fields: { name: s(body.name, 120), phone: s(body.phone, 40), email: s(body.email, 160), address: s(body.address, 200), heard_via: s(body.heard_via, 60) },
    };
  },
  mock_email(body) {
    return {
      channel: 'mock_email', isMock: true, sourceRef: s(body.message_id, 200) || null,
      text: (body.subject ? 'Subject: ' + s(body.subject, 300) + '\n\n' : '') + s(body.body), fields: { email: s(body.from, 160) },
    };
  },
  mock_sms(body) {
    return { channel: 'mock_sms', isMock: true, sourceRef: s(body.message_sid, 120) || null, text: s(body.text, 1600), fields: { phone: s(body.from, 40) } };
  },
  mock_missed_call(body) {
    return {
      channel: 'mock_missed_call', isMock: true, sourceRef: s(body.call_id, 120) || null,
      text: 'Missed call' + (body.voicemail_transcript ? '. Voicemail transcript: ' + s(body.voicemail_transcript, 2000) : ' (no voicemail).'),
      fields: { phone: s(body.from, 40) },
    };
  },
};

module.exports = { ADAPTERS };
