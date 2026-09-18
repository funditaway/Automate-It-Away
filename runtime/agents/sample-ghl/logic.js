/**
 * Sample agent pack logic — sensitive GHL write is intercepted by the sandbox.
 * Authorization resumes only after the human signs the Decision Card.
 */
async function run(context, aia) {
  const contactId = (context && context.contactId) || 'demo-contact-1'
  const result = await aia.http({
    method: 'PUT',
    url: `https://services.leadconnectorhq.com/contacts/${contactId}`,
    actionType: 'GHL_CONTACT_TAG_UPDATE',
    summary: `Tag contact ${contactId} after inbound webhook review`,
    riskLevel: 'high',
    body: {
      tags: ['aia-authorized', 'nurture'],
      source: 'sandbox-logic',
    },
  })
  return { ok: true, contactId, auth: result }
}

module.exports = { run }
