const RESERVED_HANDLES = ["aia", "automateitaway", "automate-it-away"];
const REVIEWER_DESKS = ["aia", "automateitaway", "funditaway"];
const PLATFORM_ACCOUNT_ID = "aia";

function normalizeHandle(value) {
  return String(value || "").trim().replace(/^@+/, "").replace(/\.aia$/i, "").toLowerCase().replace(/[^a-z0-9_-]+/g, "").slice(0, 40);
}

function handleTakenError() {
  return { ok: false, status: 409, error: "That handle is reserved for the AIA admin account." };
}

function isReservedHandle(value) {
  const h = normalizeHandle(value);
  return !!h && RESERVED_HANDLES.indexOf(h) >= 0;
}

function isPlatformAccount(acc) {
  if (!acc) return false;
  if (acc.id === PLATFORM_ACCOUNT_ID) return true;
  if (acc.heldBy === "admin") return true;
  if (acc.aiaReviewer === true) return true;
  const handle = normalizeHandle(acc.handle || acc.xHandle || acc.slug);
  return handle === "aia";
}

function isReviewerDesk(row) {
  if (!row) return false;
  const slug = String(row.slug || "").toLowerCase();
  const name = normalizeHandle(row.biz || row.name || "");
  return REVIEWER_DESKS.indexOf(slug) >= 0 || REVIEWER_DESKS.indexOf(name) >= 0;
}

function isAiaReviewer(acc, row, person) {
  if (isPlatformAccount(acc)) return true;
  if (isReviewerDesk(row)) return true;
  if (person && (person.aiaReviewer === true || normalizeHandle(person.handle || person.xHandle) === "aia")) return true;
  return false;
}

function stampAdminAccount(acc) {
  if (!acc || typeof acc !== "object") return acc;
  acc.handle = "aia";
  acc.aia = "aia.aia";
  acc.xHandle = "AIA";
  acc.aiaReviewer = true;
  if (!acc.heldBy) acc.heldBy = "admin";
  if (!acc.ownerName) acc.ownerName = "James Oddo";
  if (!acc.name) acc.name = "Automate It Away";
  return acc;
}

function setAccountHandle(acc, value, opts) {
  opts = opts || {};
  const net = require("./_aia-net");
  const parsed = net.parseName(value, "");
  const raw = String(value || "").trim().replace(/^@+/, "");
  if (raw && /\./.test(raw) && !parsed.ok) {
    return { ok: false, status: 400, error: parsed.error };
  }
  const handle = parsed.ok ? parsed.label : normalizeHandle(value);
  if (!handle) return { ok: false, status: 400, error: "Use a .aia name like james.aia." };
  if (handle.length < 2) return { ok: false, status: 400, error: "Handle needs at least two letters." };
  if (isReservedHandle(handle) && !isPlatformAccount(acc) && opts.allowReserved !== true) {
    return handleTakenError();
  }
  acc.handle = handle;
  acc.aia = handle + ".aia";
  acc.xHandle = handle === "aia" ? "AIA" : handle;
  if (handle === "aia") acc.aiaReviewer = true;
  return { ok: true, handle: acc.handle, aia: acc.aia, xHandle: acc.xHandle, aiaReviewer: !!acc.aiaReviewer };
}

function publicAdmin(acc) {
  if (!acc) return null;
  const handle = normalizeHandle(acc.handle || acc.xHandle || (isPlatformAccount(acc) ? "aia" : ""));
  return {
    handle: handle || "",
    aia: handle ? handle + ".aia" : "",
    xHandle: acc.xHandle || (handle ? "@" + (handle === "aia" ? "AIA" : handle) : ""),
    aiaReviewer: !!(acc.aiaReviewer || isPlatformAccount(acc)),
    reserved: isReservedHandle(handle)
  };
}

module.exports = {
  RESERVED_HANDLES,
  REVIEWER_DESKS,
  PLATFORM_ACCOUNT_ID,
  normalizeHandle,
  isReservedHandle,
  isPlatformAccount,
  isReviewerDesk,
  isAiaReviewer,
  stampAdminAccount,
  setAccountHandle,
  publicAdmin,
  handleTakenError
};
