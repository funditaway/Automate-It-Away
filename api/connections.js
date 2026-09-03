const { cors, catalog, PROVIDERS, configured, mem, log, save, ready, workspaceOf, readBody, personOf, isOwner } = require("./_lib");
const crypto = require("crypto");

const AI_PROVIDERS = {
  grok: { label: "Grok", vendor: "xAI", acts: ["draft"], login: "https://console.x.ai/team/default/api-keys", model: "grok-4-fast-non-reasoning", note: "Log in at console.x.ai. Paste the API key. Drafts only." },
  openai: { label: "ChatGPT", vendor: "OpenAI", acts: ["draft"], login: "https://platform.openai.com/api-keys", model: "gpt-4o-mini", note: "Log in at platform.openai.com. Paste the API key. Sign in with ChatGPT does not give drafts." },
  anthropic: { label: "Claude", vendor: "Anthropic", acts: ["draft"], login: "https://console.anthropic.com/settings/keys", model: "claude-sonnet-4-20250514", note: "Log in at console.anthropic.com. Paste the API key. claude.ai chat login is not a draft pipe." }
};
function isAiProvider(id) { return !!AI_PROVIDERS[String(id || "").toLowerCase()]; }
function aiCatalog() {
  return Object.entries(AI_PROVIDERS).map(([id, spec]) => ({ id, label: spec.label, vendor: spec.vendor, acts: spec.acts, login: spec.login, model: spec.model, live: false, connectable: true, lane: "draft", status: "hold", note: spec.note }));
}
function connectSecret() {
  const s = process.env.AIA_CONNECT_SECRET || process.env.BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN || process.env.XAI_API_KEY || "aia-draft-pilot";
  return crypto.createHash("sha256").update(String(s)).digest();
}
function wrapSecret(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", connectSecret(), iv);
  const enc = Buffer.concat([c.update(String(plain || ""), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64");
}
function last4Of(key) { const s = String(key || "").trim(); return s ? s.slice(-4) : ""; }
function publicAi(row) {
  if (!row) return null;
  return { id: row.id, workspace: row.workspace, provider: row.provider, label: row.label, vendor: row.vendor, lane: "draft", acts: ["draft"], live: !!row.keyPacked, status: row.keyPacked ? "live" : "hold", last4: row.last4 || "", model: row.model, login: row.login, createdAt: row.createdAt, note: "Drafts only. Never Send. If this key dies, included drafts or engine recs still run." };
}

function searchLogin(q) {
  return "https://www.google.com/search?q=" + encodeURIComponent(String(q || "") + " developer API login");
}
