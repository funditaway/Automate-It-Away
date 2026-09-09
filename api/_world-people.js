const lib = require("./_lib");
const account = require("./_account");
const aiaAdmin = require("./_aia-admin");

const ASK = ["family", "friend", "helper", "member", "staff"];
const STAFF_ASK = ["family", "friend", "helper"];
const QUERY_MIN = 2;
const HIT_MAX = 20;

function lower(v) {
  return String(v || "").trim().toLowerCase();
}
function handleBare(value) {
  if (aiaAdmin && typeof aiaAdmin.normalizeHandle === "function") {
    return aiaAdmin.normalizeHandle(value);
  }
  return String(value || "").trim().replace(/^@+/, "").toLowerCase().replace(/[^a-z0-9_-]+/g, "").slice(0, 40);
}
function looksLikeEmail(value) {
  if (typeof account.looksLikeEmail === "function") return account.looksLikeEmail(value);
  const e = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 120;
}
function deskListed(ws) {
  if (!ws || ws.closed === true || ws.accepts === false) return false;
  if (ws.listed === true) return true;
  return String(ws.visibility || "").toLowerCase() === "public";
}
function accountHandle(acc) {
  if (!acc) return "";
  const raw = String(acc.handle || acc.accountHandle || acc.at || "").trim();
  if (!raw) return "";
  return handleBare(raw);
}
function displayName(acc) {
  return String((acc && (acc.ownerName || acc.name || acc.biz)) || "").trim().slice(0, 80);
}
function handleOf(acc) {
  const bare = accountHandle(acc);
  if (bare === "aia") return "@AIA";
  return bare ? "@" + bare : "";
}
function isReservedHandle(value) {
  const bare = handleBare(value);
  if (!bare) return false;
  if (typeof aiaAdmin.isReservedHandle === "function") return aiaAdmin.isReservedHandle(bare);
  return bare === "aia" || bare === "automateitaway" || bare === "automate-it-away";
}
function homeOf(person, row) {
  if (typeof account.homeAccount === "function") return account.homeAccount(person, row);
  if (person && person.accountId) {
    return (lib.mem.accounts || []).find((a) => a && a.id === person.accountId) || null;
  }
  return null;
}
function listedDesksOf(acc) {
  const slugs = {};
  ((acc && acc.desks) || []).forEach((slug) => {
    if (slug) slugs[String(slug)] = true;
  });
  return (lib.mem.workspaces || []).filter((w) => {
    if (!w || !deskListed(w)) return false;
    if (acc && w.accountId && w.accountId === acc.id) return true;
    return slugs[w.slug];
  }).slice(0, 8).map((w) => ({
    name: w.biz || w.name || w.slug,
    city: w.city || "",
    drop: "/drop?ws=" + encodeURIComponent(w.slug)
  }));
}
function seatOnDesk(row, acc) {
  if (!row || !acc) return null;
  return (row.people || []).find((p) => p && p.status !== "denied" && (
    (p.accountId && p.accountId === acc.id) ||
    (accountHandle(acc) && handleBare(p.handle || p.at) === accountHandle(acc))
  )) || null;
}
function publicWorldCard(acc, viewerDesk) {
  if (!acc) return null;
  const handle = accountHandle(acc);
  if (!handle) return null;
  const seat = seatOnDesk(viewerDesk, acc);
  const reserved = isReservedHandle(handle) || (typeof aiaAdmin.isPlatformAccount === "function" && aiaAdmin.isPlatformAccount(acc));
  return {
    kind: "account",
    world: true,
    accountId: acc.id,
    name: displayName(acc),
    handle,
    at: handle === "aia" ? "@AIA" : "@" + handle,
    city: String(acc.city || "").slice(0, 40),
    state: String(acc.state || "").slice(0, 24),
    photoUrl: String(acc.photoUrl || "").slice(0, 180000),
    note: String(acc.note || "").slice(0, 120),
    listedDesks: listedDesksOf(acc),
    alreadyOnDesk: !!(seat && seat.status === "approved"),
    pendingOnDesk: !!(seat && seat.status === "pending"),
    seatKind: seat ? (seat.kind || seat.role || "") : "",
    seatId: seat ? seat.id : "",
    reserved,
    sit: !reserved,
    platform: !!reserved
  };
}
function parseQuery(raw) {
  const text = String(raw || "").trim().slice(0, 80);
  return {
    raw: text,
    email: looksLikeEmail(text),
    handle: handleBare(text),
    name: lower(text).replace(/^@+/, "").replace(/\s+/g, " ")
  };
}
function searchableAccounts() {
  return (lib.mem.accounts || []).filter((a) => a && accountHandle(a));
}
function searchWorldAccounts(query, opts) {
  const q = parseQuery(query);
  if (q.email) {
    return { ok: false, status: 400, error: "Email is not a world name. Search @handle or the account name." };
  }
  if (!q.handle || q.handle.length < QUERY_MIN) {
    return { ok: false, status: 400, error: "Type at least two letters of a name or @handle." };
  }
  if (isReservedHandle(q.handle) && String(q.raw || "").indexOf("@") === 0) {
    return {
      ok: true,
      q: q.raw,
      reserved: true,
      hits: [],
      people: [],
      error: "@AIA is the platform account. It is not a sit target."
    };
  }
  const viewerDesk = opts && opts.desk ? opts.desk : (opts && opts.row ? opts.row : null);
  const viewerAcc = opts && opts.account ? opts.account : null;
  const exactOnly = String(q.raw || "").trim().charAt(0) === "@";
  const exact = [];
  const named = [];
  searchableAccounts().forEach((acc) => {
    if (viewerAcc && acc.id === viewerAcc.id) return;
    const handle = accountHandle(acc);
    const name = lower(displayName(acc));
    const card = publicWorldCard(acc, viewerDesk);
    if (!card || card.reserved) return;
    if (handle === q.handle) exact.push(card);
    else if (!exactOnly && (handle.indexOf(q.handle) >= 0 || name.indexOf(q.name) >= 0)) named.push(card);
  });
  const seen = {};
  const hits = exact.concat(named).filter((row) => {
    if (!row || !row.accountId || seen[row.accountId]) return false;
    seen[row.accountId] = true;
    return true;
  }).slice(0, HIT_MAX);
  return {
    ok: true,
    q: q.raw,
    hits,
    people: hits,
    count: hits.length,
    kinds: ASK,
    hint: hits.length ? "" : "No world account by that name. Ask them to set a handle on Account."
  };
}
function canInviteKind(actor, kind) {
  const want = String(kind || "helper").toLowerCase();
  if (ASK.indexOf(want) < 0) return { ok: false, error: "Invite family, a friend, a helper, a member, or staff.", kinds: ASK };
  if (want === "owner" || want === "agent") return { ok: false, error: "World invite is not an owner or agent seat." };
  const owner = !!(actor && (actor.role === "owner" || actor.kind === "owner" || lib.isOwner(actor)));
  const staff = !!(actor && (actor.kind === "staff" || (actor.can && actor.can.invite)));
  if (owner) return { ok: true, kind: want };
  if (staff && STAFF_ASK.indexOf(want) >= 0) return { ok: true, kind: want };
  if (staff) return { ok: false, status: 403, error: "Staff can invite family, a friend, or a helper. Owner invites member or staff." };
  return { ok: false, status: 403, error: "Owner or staff with invite can send a world invite." };
}
function findAccountForWorld(body) {
  const id = String((body && (body.accountId || body.id)) || "").trim();
  if (id) {
    const byId = (lib.mem.accounts || []).find((a) => a && a.id === id && accountHandle(a));
    if (byId) return byId;
  }
  const handle = handleBare((body && (body.handle || body.at || body.account || body.q || body.name)) || "");
  if (handle) {
    const byHandle = (lib.mem.accounts || []).find((a) => a && accountHandle(a) === handle);
    if (byHandle) return byHandle;
  }
  return null;
}
function inviteWorld(row, body, actor) {
  if (!row) return { ok: false, status: 404, error: "No desk." };
  if (!actor) return { ok: false, status: 401, error: "Sign in on this desk first." };
  const gate = canInviteKind(actor, (body && (body.kind || body.seat || body.want)) || "helper");
  if (!gate.ok) return { ok: false, status: gate.status || 400, error: gate.error, kinds: ASK };
  const home = findAccountForWorld(body);
  if (!home) return { ok: false, status: 404, error: "No world account by that name. Ask them to set a handle on Account." };
  if (isReservedHandle(accountHandle(home)) || (typeof aiaAdmin.isPlatformAccount === "function" && aiaAdmin.isPlatformAccount(home))) {
    return { ok: false, status: 409, error: "@AIA is the platform account. It is not a sit target." };
  }
  const you = homeOf(actor, row);
  if (you && you.id === home.id) return { ok: false, status: 409, error: "That is your account." };
  const existing = seatOnDesk(row, home);
  if (existing && existing.status === "approved") {
    return { ok: false, status: 409, error: handleOf(home) + " is already on this desk as " + (existing.kind || "helper") + ".", alreadyOnDesk: true, person: lib.publicPerson(existing) };
  }
  if (existing && existing.status === "pending") {
    return { ok: false, status: 409, error: "Already asked. Waiting on them.", pending: true, person: lib.publicPerson(existing) };
  }
  let made = account.inviteSeat(row, {
    name: displayName(home),
    accountId: home.id,
    id: home.id,
    account: home.id,
    handle: accountHandle(home),
    kind: gate.kind,
    pin: home.pin ? "x" : "world",
    approve: false,
    status: "pending"
  }, { name: (actor && actor.name) || "desk", role: "employee", kind: "staff" });
  if (!made.ok && /desk code|4\+ digit/i.test(made.error || "")) {
    const seat0 = {
      id: "p_" + Date.now().toString(36),
      name: displayName(home),
      role: "employee",
      kind: gate.kind,
      accountId: home.id,
      handle: accountHandle(home),
      email: "",
      phone: "",
      pin: home.pin || "",
      status: "pending",
      worldInvite: true,
      waitingOn: "them",
      invitedBy: (actor && actor.name) || "desk",
      requestedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    row.people = row.people || [];
    row.people.push(seat0);
    made = { ok: true, pending: true, person: lib.publicPerson(seat0) };
  }
  if (!made.ok) return made;
  const seat = (row.people || []).find((p) => p && made.person && p.id === made.person.id);
  if (seat) {
    seat.accountId = home.id;
    seat.handle = accountHandle(home);
    seat.worldInvite = true;
    seat.waitingOn = "them";
    seat.invitedBy = (actor && actor.name) || "desk";
    seat.status = "pending";
    seat.approvedAt = null;
    seat.approvedBy = "";
  }
  const shop = row.biz || row.name || row.slug || "this desk";
  const at = handleOf(home);
  return {
    ok: true,
    pending: true,
    waitingOn: "them",
    status: 202,
    person: lib.publicPerson(seat || made.person),
    hit: publicWorldCard(home, row),
    line: inviteLine(shop, gate.kind, at),
    hint: "Asked " + at + " to sit as " + gate.kind + ". They Accept on their People tab. Copy, text, or email the note — AIA does not send it."
  };
}
function inviteLine(deskName, kind, handle) {
  const seat = kind || "helper";
  const who = handle || "You";
  const shop = deskName || "this desk";
  return who + " — you're invited to sit on " + shop + " as " + seat + ". Open https://automateitaway.com/login with your own account. Accept on People. Nobody sends money from here.";
}
function incomingInvites(acc) {
  if (!acc) return [];
  const rows = [];
  (lib.mem.workspaces || []).forEach((w) => {
    if (!w) return;
    (w.people || []).forEach((p) => {
      if (!p || p.status !== "pending") return;
      if (p.accountId && p.accountId === acc.id) {
        rows.push({
          id: p.id,
          name: w.biz || w.name || w.slug,
          slug: w.slug,
          kind: p.kind || "helper",
          status: "pending",
          by: p.invitedBy || "",
          handle: handleOf(acc),
          side: "in",
          t: p.requestedAt || p.createdAt || ""
        });
      }
    });
  });
  return rows.slice(0, 24);
}
function outgoingInvites(row) {
  if (!row) return [];
  return (row.people || []).filter((p) => p && p.status === "pending" && p.worldInvite).map((p) => ({
    id: p.id,
    name: p.name || "",
    handle: p.handle ? "@" + handleBare(p.handle) : "",
    kind: p.kind || "helper",
    status: "pending",
    slug: row.slug,
    desk: row.biz || row.name || row.slug,
    side: "out",
    t: p.requestedAt || p.createdAt || ""
  })).slice(0, 24);
}
function invitesOf(row, person) {
  const acc = homeOf(person, row);
  return { ok: true, incoming: incomingInvites(acc), outgoing: outgoingInvites(row) };
}
function acceptInvite(acc, slug) {
  if (!acc) return { ok: false, status: 401, error: "Sign in to accept." };
  const target = lib.slugify(slug || "");
  const row = (lib.mem.workspaces || []).find((w) => w && w.slug === target);
  if (!row) return { ok: false, status: 404, error: "No desk with that name." };
  const seat = (row.people || []).find((p) => p && p.status === "pending" && p.accountId === acc.id);
  if (!seat) return { ok: false, status: 404, error: "No invite waiting for this account on that desk." };
  if (typeof account.setSeatStatus === "function") {
    const made = account.setSeatStatus(row, seat.id, "approved", { name: displayName(acc), role: "employee", kind: seat.kind, accountId: acc.id });
    if (!made.ok) return made;
  } else {
    seat.status = "approved";
    seat.approvedAt = new Date().toISOString();
    seat.approvedBy = displayName(acc);
  }
  seat.waitingOn = "";
  if (typeof account.connectDesk === "function") account.connectDesk(acc, row, "member");
  return {
    ok: true,
    accepted: true,
    desk: row.biz || row.name || row.slug,
    slug: row.slug,
    kind: seat.kind || "helper",
    hint: "Accepted. You can open the queue on " + (row.biz || row.slug) + ". AIA does not send."
  };
}
function declineInvite(acc, slug) {
  if (!acc) return { ok: false, status: 401, error: "Sign in to decline." };
  const target = lib.slugify(slug || "");
  const row = (lib.mem.workspaces || []).find((w) => w && w.slug === target);
  if (!row) return { ok: false, status: 404, error: "No desk with that name." };
  const seat = (row.people || []).find((p) => p && p.status === "pending" && p.accountId === acc.id);
  if (!seat) return { ok: false, status: 404, error: "No invite waiting for this account on that desk." };
  if (typeof account.setSeatStatus === "function") {
    const made = account.setSeatStatus(row, seat.id, "denied", { name: displayName(acc), role: "employee", kind: seat.kind, accountId: acc.id });
    if (!made.ok) return made;
  } else {
    seat.status = "denied";
  }
  seat.waitingOn = "";
  return {
    ok: true,
    declined: true,
    desk: row.biz || row.name || row.slug,
    slug: row.slug,
    hint: "Declined " + (row.biz || row.slug) + "."
  };
}

module.exports = {
  ASK,
  STAFF_ASK,
  QUERY_MIN,
  HIT_MAX,
  handleBare,
  handleOf,
  looksLikeEmail,
  isReservedHandle,
  publicWorldCard,
  searchWorldAccounts,
  inviteWorld,
  inviteLine,
  incomingInvites,
  outgoingInvites,
  invitesOf,
  acceptInvite,
  declineInvite,
  findAccountForWorld,
  canInviteKind
};
