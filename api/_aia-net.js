const TLD = "aia";
const INTERNET = "AIA Internet";
const HOLD_NOTE = ".aia names on this desk now. Wallet / registry connect later as a Pipe HOLD. AIA AI home is ai.aia. DNS stays orange until it answers.";
const KEY_NOTE = "Registry key is on this box. Names still HOLD until a wallet pipe answers. No on-chain claim. AIA AI home is ai.aia.";
const RESERVED = ["www", "localhost", "invalid", "ai"];

function registryKey() {
  return process.env.AIA_DOT_AIA_KEY || process.env.AIA_REGISTRY_KEY || process.env.AIA_WEB3_KEY || "";
}

function registryOn() {
  return !!registryKey();
}

function labelOf(raw, fallback) {
  let s = String(raw == null ? "" : raw).trim().toLowerCase();
  s = s.replace(/^@+/, "");
  s = s.replace(/\.aia$/i, "");
  s = s.replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!s && fallback) return labelOf(fallback, "");
  if (!s) return "";
  s = s.slice(0, 63);
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(s)) return "";
  return s;
}

function parseName(raw, fallback) {
  const text = String(raw == null ? "" : raw).trim();
  const stripped = text.replace(/^@+/, "");
  if (stripped && /\./.test(stripped) && !/\.aia$/i.test(stripped)) {
    return { ok: false, error: "AIA Internet names end in .aia — like james.aia or springfield-shop.aia." };
  }
  const label = labelOf(text, fallback);
  if (!label) return { ok: false, error: "Use a .aia name like james.aia or springfield-shop.aia." };
  if (RESERVED.indexOf(label) >= 0) return { ok: false, error: "That .aia label is reserved." };
  return {
    ok: true,
    label: label,
    name: label + "." + TLD,
    file: label + "." + TLD,
    tld: TLD,
    internet: INTERNET
  };
}

function of(raw, fallback) {
  const parsed = parseName(raw, fallback);
  if (parsed.ok) return parsed;
  return parseName(fallback || "desk", "desk");
}

function publicNet(parsed) {
  const row = parsed && parsed.ok ? parsed : (parsed && parsed.name ? parsed : null);
  const on = registryOn();
  return {
    tld: "." + TLD,
    internet: INTERNET,
    name: row && row.name ? row.name : "",
    label: row && row.label ? row.label : "",
    file: row && row.file ? row.file : (row && row.name ? row.name : ""),
    live: false,
    owned: false,
    chain: false,
    registry: on ? "hold" : "off",
    note: on ? KEY_NOTE : HOLD_NOTE
  };
}

function statusOf() {
  const on = registryOn();
  return {
    internet: INTERNET,
    tld: "." + TLD,
    names: "on this desk",
    live: false,
    owned: false,
    chain: false,
    registry: on ? "hold" : "off",
    on: on,
    note: on ? KEY_NOTE : HOLD_NOTE,
    pipe: "hold"
  };
}

function fileOf(raw, fallback) {
  return of(raw, fallback).file;
}

function matchName(row, want) {
  const term = String(want || "").toLowerCase().replace(/^@+/, "");
  if (!term) return false;
  const net = of(row && (row.aia || row.aiaName || row.id || row.name || row.slug), "");
  return net.name === term || net.label === term.replace(/\.aia$/, "") || net.file === term;
}

module.exports = {
  TLD,
  INTERNET,
  HOLD_NOTE,
  KEY_NOTE,
  registryKey,
  registryOn,
  labelOf,
  parseName,
  of,
  publicNet,
  statusOf,
  fileOf,
  matchName
};
