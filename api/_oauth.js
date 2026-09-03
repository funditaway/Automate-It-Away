const PROVIDERS = [
  { id: "google", label: "Google", group: "live", status: "hold" },
  { id: "github", label: "GitHub", group: "live", status: "hold" },
  { id: "apple", label: "Apple", group: "live", status: "hold" },
  { id: "microsoft", label: "Microsoft", group: "live", status: "hold" },
  { id: "x", label: "X", group: "more", status: "hold" },
  { id: "amazon", label: "Amazon", group: "more", status: "hold" },
  { id: "facebook", label: "Facebook", group: "more", status: "hold" },
  { id: "grok", label: "Grok", group: "ask", status: "ask" },
  { id: "chatgpt", label: "ChatGPT", group: "ask", status: "ask" },
  { id: "claude", label: "Claude", group: "ask", status: "ask" },
  { id: "linkedin", label: "LinkedIn", group: "ext", status: "hold" },
  { id: "discord", label: "Discord", group: "ext", status: "hold" },
  { id: "vercel", label: "Vercel", group: "ext", status: "hold" },
  { id: "yahoo", label: "Yahoo", group: "ext", status: "hold" },
  { id: "passkey", label: "Passkey", group: "ext", status: "ask" },
  { id: "other", label: "Another site", group: "ext", status: "ask" }
];

function publicProviders() {
  return PROVIDERS.map((p) => ({
    id: p.id,
    label: p.label,
    name: p.label,
    group: p.group,
    status: p.status,
    live: p.status === "live",
    ask: p.status === "ask",
    hold: p.status === "hold"
  }));
}

function startOAuth(body) {
  const id = String((body && (body.provider || body.id || body.site)) || "").toLowerCase().trim();
  const site = String((body && body.site) || "").trim();
  if (id === "other" || id === "site" || id === "ext") {
    if (!site) return { ok: false, status: 400, error: "Name the site." };
    return {
      ok: false,
      status: 409,
      ask: true,
      error: "Ask. AIA can add that site as a login door. Identity only — never Send, Stop, pay, or draft."
    };
  }
  const row = PROVIDERS.find((p) => p.id === id);
  if (!row) return { ok: false, status: 400, error: "Name the site." };
  if (row.status === "ask") {
    return {
      ok: false,
      status: 409,
      ask: true,
      error: "Ask. That vendor has not admitted AIA as a website login yet."
    };
  }
  return {
    ok: false,
    status: 409,
    hold: true,
    error: "Hold. That door is on the wall until the app id is on the box."
  };
}

module.exports = { PROVIDERS, publicProviders, startOAuth };
