const {
  cors, mem, ready, save, workspaceOf, personOf, isOwner, ensureRules, readBody, slugify, publicPerson, viewSeat
} = require("./_lib");
const { adminPinOk, jobCounts } = require("./_desk");
const {
  ensureAccount, publicAccount, accountSnapshot, inviteSeat, requestSeat,
  setSeatStatus, seatOffRefused, approvalsOf, peopleAcross, accountForDesk, homeAccount, requestMonthly, publicPlan,
  switchPlan, publicPlans, proHome, requestPermission, setPermission, desksForPerson
} = require("./_account");
const aiaAdmin = require("./_aia-admin");
const worldPeople = require("./_world-people");
const { setDeskPerms, setSeatCan, publicDesk } = require("./_desk");
const plans = require("./_plans");
const { historyOf, filterHistory, historyItem } = require("./_history");

function ticketsOf(slug) {
  return (mem.tickets || []).filter((t) => t && (!slug || t.workspace === slug)).slice(0, 40);
}
function askFn() { return requestPermission || plans.requestPermission; }
function permitFn() { return setPermission || plans.setPermission; }
function mineFn() { return desksForPerson || plans.desksForPerson; }
function lower(v) { return String(v || "").trim().toLowerCase(); }
function deskName(row) { return (row && (row.biz || row.name || row.slug)) || ""; }
function personHint(src) {
  const hint = typeof src === "string" ? { name: src } : (src && typeof src === "object" ? src : {});
  return {
    // The seat is looked up by seat id (?seat=<id>, or id/personId/seatId). A name is only a fallback
    // when no id is sent, and only when exactly one seat on the desk has that name.
    id: String(hint.seat || hint.seatId || hint.id || hint.personId || "").trim(),
    desk: slugify(typeof hint.desk === "string" ? hint.desk : (typeof hint.seatDesk === "string" ? hint.seatDesk : "")),
    name: String(hint.name || hint.who || hint.person || "").trim()
  };
}
const { seatsNamed, jobTouchesSeat } = require("./_fields");
// The one seat this sheet is about: by seat id on the asked desk (default: the request's desk), or,
// with no id, the only seat on the request's desk with that name. Never a merge of same-name seats.
function findBookSeat(want, rows, currentSlug) {
  const byDesk = want.desk ? rows.filter((r) => r.slug === want.desk) : [];
  // An asked desk that is not open to this viewer: the same reply as an unknown seat (no oracle).
  if (want.desk && !byDesk.length) return { status: 404, error: "Person not found." };
  if (want.id) {
    const order = byDesk.length ? byDesk : [rows.find((r) => r.slug === currentSlug)].filter(Boolean);
    for (const row of order) {
      const seat = (row.people || []).find((p) => p && p.id === want.id);
      if (seat) return { row, seat };
    }
    if (want.desk) return { status: 404, error: "Person not found." };
    const hits = [];
    rows.forEach((row) => (row.people || []).forEach((p) => { if (p && p.id === want.id) hits.push({ row, seat: p }); }));
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) return { status: 409, error: "That seat id is on more than one desk. Send desk=<slug> with seat=<id>." };
    return { status: 404, error: "Person not found." };
  }
  const row = byDesk[0] || rows.find((r) => r.slug === currentSlug);
  const named = seatsNamed(row, want.name);
  if (named.length === 1) return { row, seat: named[0] };
  if (named.length > 1) return { status: 409, error: "More than one seat has that name. Open the person by seat (?seat=<seat id>)." };
  return { status: 404, error: "Person not found." };
}
// The desks this request opened, and per desk the seat that opened it: the signed-in seat on currentSlug,
// and on each extra desk the seat its own saved code or session opens there. Never one desk's seat for another.
function allowedSlugs(currentSlug, extras, viewer) {
  const out = [];
  const seen = {};
  const seatBy = {};
  function add(slug, seat) {
    const use = slugify(slug || "");
    if (!use || seen[use]) return;
    seen[use] = true;
    out.push(use);
    seatBy[use] = seat || null;
  }
  add(currentSlug, viewer);
  const list = Array.isArray(extras) ? extras : [];
  list.slice(0, 32).forEach((item) => {
    const slug = slugify(item && (item.slug || item.workspace || item.biz || item.name) || "");
    if (!slug || seen[slug]) return;
    const headers = { "x-workspace": slug };
    if (item && item.pin != null) headers["x-pin"] = String(item.pin);
    if (item && item.token != null) headers["x-session"] = String(item.token);
    const found = personOf({ headers }, slug);
    if (!found.workspace || !found.person || (found.person && found.person.status === "pending")) return;
    add(slug, found.person);
  });
  return { slugs: out, seatBy };
}
function touchTime(job) {
  return String((job && (job.doneAt || job.updatedAt || job.createdAt || job.t)) || "");
}
function historyCard(job, row) {
  const item = historyItem(job, row);
  if (!item) return null;
  return Object.assign({}, item, {
    title: item.title || job.title || "Card",
    slug: item.slug || job.workspace || (row && row.slug) || "",
    desk: item.desk || deskName(row) || job.workspace || "",
    t: item.t || touchTime(job),
    offDesk: !!(job.status === "out" || job.offDesk),
    done: job.status === "shipped" || job.status === "killed"
  });
}
function personBook(hint, opts) {
  const want = personHint(hint);
  const signedIn = opts && opts.viewer ? opts.viewer : null;
  const currentSlug = slugify((opts && opts.currentSlug) || "");
  const opened = allowedSlugs(currentSlug, opts && opts.slugs, signedIn);
  const slugs = opened.slugs;
  const rows = slugs.map((slug) => (mem.workspaces || []).find((w) => w && w.slug === slug)).filter(Boolean);
  const found = findBookSeat(want, rows, currentSlug);
  if (!found.seat) return { ok: false, status: found.status || 404, error: found.error || "Person not found.", slugs };
  // The viewer is the requester's own seat on the found seat's desk (owner views need the owner of THAT desk).
  const viewer = opened.seatBy[found.row.slug] || null;
  // This seat, plus the same person's seats on the other open desks: same account id only, never by name.
  const acct = String(found.seat.accountId || "");
  const seats = [Object.assign({ slug: found.row.slug, desk: deskName(found.row) }, found.seat)];
  if (acct) {
    rows.forEach((row) => {
      if (row === found.row) return;
      (row.people || []).forEach((seat) => {
        if (seat && String(seat.accountId || "") === acct) seats.push(Object.assign({ slug: row.slug, desk: deskName(row) }, seat));
      });
    });
  }
  const first = seats[0];
  const historyItems = [];
  const cards = [];
  rows.forEach((row) => {
    const mine = seats.filter((s) => s.slug === row.slug).map((s) => (row.people || []).find((p) => p && p.id === s.id)).filter(Boolean);
    if (!mine.length) return;
    const jobs = (mem.jobs || []).filter((job) => job && job.workspace === row.slug && mine.some((seat) => jobTouchesSeat(job, seat, row)));
    jobs.forEach((job) => {
      const card = historyCard(job, row);
      if (card) cards.push(card);
    });
    historyItems.push.apply(historyItems, historyOf(row, jobs, [], {}).items);
  });
  cards.sort((a, b) => String(b.t || "").localeCompare(String(a.t || "")));
  historyItems.sort((a, b) => String(b.t || "").localeCompare(String(a.t || "")));
  const seatCards = seats.map((seat) => {
    const jobs = cards.filter((card) => card.slug === seat.slug);
    const last = jobs[0] || null;
    return {
      id: seat.id || "",
      desk: seat.desk,
      slug: seat.slug,
      kind: seat.kind || (seat.role === "owner" ? "owner" : "helper"),
      status: seat.status || "approved",
      theyOwn: seat.role === "owner" || seat.kind === "owner",
      side: seat.slug === currentSlug ? (seats.length > 1 ? "yours" : "both") : "theirs",
      holding: jobs.filter((card) => !card.done && !card.offDesk).length,
      ext: jobs.filter((card) => !card.done && card.offDesk).length,
      done: jobs.filter((card) => card.done).length,
      lastCardTitle: last ? last.title : "",
      lastSeen: (last && last.t) || seat.approvedAt || seat.createdAt || null
    };
  }).sort((a, b) => String(b.lastSeen || "").localeCompare(String(a.lastSeen || "")));
  return {
    ok: true,
    // Not the owner and not their own seat: name and role only (no email, account, or phone).
    person: Object.assign({}, viewSeat(publicPerson(first), first, viewer) || {}, { phone: isOwner(viewer) || (viewer && viewer.id === first.id) ? first.phone || "" : "", desks: seats.length }),
    viewer: viewSeat(publicPerson(signedIn), signedIn, signedIn),
    slugs,
    allowedSlugs: slugs,
    currentSlug,
    seats: seatCards,
    cards: cards.filter((card) => !card.done).slice(0, 24),
    history: historyItems.slice(0, 40),
    lastCard: cards[0] || historyItems[0] || null,
    // The notes thread: only the seat itself and the owner (a helper opening another seat's sheet gets none).
    thread: isOwner(viewer) || (viewer && viewer.id === first.id) ? (first.thread || []).slice(-40) : [],
    ownerHere: !!(viewer && (viewer.role === "owner" || viewer.kind === "owner"))
  };
}

function findSeat(row, body) {
  const id = String((body && (body.id || body.personId)) || "").trim();
  const name = String((body && (body.name || body.who)) || "").trim().toLowerCase();
  const email = String((body && body.email) || "").trim().toLowerCase();
  return (row.people || []).find((p) => {
    if (!p) return false;
    if (id && p.id === id) return true;
    if (email && String(p.email || "").toLowerCase() === email) return true;
    if (name && String(p.name || "").toLowerCase() === name) return true;
    return false;
  }) || null;
}

function pushTalk(target, from, text, kind) {
  const line = String(text || "").trim();
  if (!target || !line) return null;
  target.thread = Array.isArray(target.thread) ? target.thread : [];
  const msg = {
    t: new Date().toISOString(),
    from: String(from || "desk"),
    kind: String(kind || "note"),
    text: line.slice(0, 500)
  };
  target.thread.push(msg);
  if (target.thread.length > 80) target.thread = target.thread.slice(-80);
  return msg;
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  await ready();
  ensureAccount();

  if (req.method === "GET") {
    const slug = workspaceOf(req);
    const pin = (req.headers && req.headers["x-pin"]) || "";
    if (!pin && adminPinOk(req)) {
      return res.status(200).json({ ok: true, platform: true, you: { name: "Admin", role: "admin", kind: "owner", live: true }, account: publicAccount(), plan: publicPlan({ plan: "pro" }), plans: publicPlans(), people: peopleAcross(), approvals: approvalsOf(""), desks: (mem.workspaces || []).map((w) => publicDesk(w, (w.people || []).find((p) => p && p.role === "owner"))), tickets: ticketsOf(""), audit: (mem.audit || []).slice(0, 40), money: mem.money || [] });
    }
    const found = personOf(req, slug);
    const row = found.workspace;
    const person = found.person;
    if (!row) return res.status(404).json({ ok: false, error: "No workspace with that slug. Start one first." });
    if (found.pending) return res.status(403).json({ ok: false, pending: true, error: "That seat is waiting on the owner." });
    if (!person) return res.status(401).json({ ok: false, error: "Pin required." });
    let q = (req.query && typeof req.query === "object") ? req.query : {};
    try {
      const raw = String(req.url || "");
      const parsed = Object.fromEntries(new URLSearchParams(raw.indexOf("?") >= 0 ? raw.slice(raw.indexOf("?") + 1) : ""));
      q = Object.assign({}, parsed, q);
    } catch (e) {}
    if (q.world || q.find || q.handle || q.at) {
      const acc = homeAccount(person, row, req);
      const foundWorld = worldPeople.searchWorldAccounts(q.q || q.handle || q.at || q.name || q.world || "", { desk: row, account: acc });
      return res.status(foundWorld.ok ? 200 : (foundWorld.status || 400)).json(Object.assign({ world: true }, foundWorld));
    }
    if (q.seat || q.who || q.person || q.name) {
      // desk=<slug>: another desk only when this viewer holds a seat there by this desk's own hint
      // (#367: own seat id here, or the account its own sign-in proved). The sheet is then read as
      // that seat on that desk. Any other desk (no seat, pending, unknown) gets the unknown-seat reply.
      const askDesk = slugify(typeof q.desk === "string" ? q.desk : (typeof q.seatDesk === "string" ? q.seatDesk : ""));
      let bookRow = row, bookViewer = person;
      if (askDesk) {
        const mineCards = mineFn()(plans.listHint(person, homeAccount(person, row, req), row.slug));
        const card = mineCards.owned.concat(mineCards.member).find((c) => c && c.slug === askDesk && c.status !== "pending");
        const there = card && askDesk !== row.slug ? (mem.workspaces || []).find((w) => w && w.slug === askDesk) : null;
        const seatThere = there && (there.people || []).find((p) => p && p.id === card.personId);
        if (seatThere) { bookRow = there; bookViewer = seatThere; }
      }
      const book = personBook({
        seat: q.seat || q.id || q.personId || "",
        desk: askDesk,
        name: q.who || q.person || q.name
      }, { slugs: [bookRow.slug], viewer: bookViewer, currentSlug: bookRow.slug });
      return res.status(book.ok ? 200 : (book.status || 404)).json(book);
    }
    const owner = isOwner(person);
    const ownAcc = homeAccount(person, row, req);
    const snap = accountSnapshot(row, person, ownAcc && ownAcc.id);
    return res.status(200).json({ ok: true, you: snap.you, account: snap.account, plan: snap.plan, plans: publicPlans(), shop: snap.shop, counts: jobCounts(row.slug), people: snap.people, approvals: owner ? snap.approvals : [], perms: snap.perms, agents: snap.agents, kinds: snap.kinds, levels: snap.levels, hardOwner: snap.hardOwner, rules: ensureRules(row), tickets: ticketsOf(row.slug), audit: owner ? (mem.audit || []).filter((a) => !a.workspace || a.workspace === row.slug).slice(0, 40) : null, money: owner ? (mem.money || []).filter((m) => !m.workspace || m.workspace === row.slug).slice(0, 40) : null });
  }

  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Use GET or POST." });
  const body = await readBody(req);
  const action = String(body.action || "invite").toLowerCase();
  const slug = workspaceOf(req);
  const found = personOf(req, slug);
  const row = found.workspace;
  const person = found.person;
  if (!row) return res.status(404).json({ ok: false, error: "No workspace" });
  if (!person) return res.status(401).json({ ok: false, error: "Desk code required." });

  if (action === "request") {
    const made = requestSeat(row, body, req);
    if (!made.ok) return res.status(made.status || 400).json({ ok: false, error: made.error });
    if (made.person && (body.note || body.text || body.say)) {
      pushTalk(made.person, body.name || made.person.name || "ask", body.note || body.text || body.say, "ask");
    } else if (made.person) {
      pushTalk(made.person, body.name || made.person.name || "ask", "Asked to sit on this desk.", "ask");
    }
    await save();
    return res.status(202).json({ ok: true, pending: true, person: made.person });
  }
  if (action === "say" || action === "talk") {
    const text = String(body.text || body.note || body.say || "").trim();
    if (!text) return res.status(400).json({ ok: false, error: "Type the note." });
    const target = findSeat(row, body);
    if (!target) return res.status(404).json({ ok: false, error: "Person not found." });
    const owner = isOwner(person);
    const self = person.id && target.id && person.id === target.id;
    if (!owner && !self) return res.status(403).json({ ok: false, error: "Talk on your seat or the owner desk." });
    const msg = pushTalk(target, person.name || "desk", text, body.kind || (owner ? "owner" : "note"));
    await save();
    return res.status(200).json({ ok: true, thread: (target.thread || []).slice(-40), last: msg, person: publicPerson(target) });
  }
  if (action === "person" || action === "book") {
    const book = personBook(body, { slugs: body.desks || [], viewer: person, currentSlug: row.slug });
    return res.status(book.ok ? 200 : (book.status || 404)).json(book);
  }
  if (action === "find" || action === "world" || action === "world-who" || action === "world-search" || action === "find-account") {
    const hit = worldPeople.searchWorldAccounts(body.q || body.handle || body.name || body.who || body.at, { row: row, person: person, desk: row });
    return res.status(hit.ok ? 200 : (hit.status || 400)).json(hit);
  }
  if (action === "invite-world" || action === "world-invite") {
    const made = worldPeople.inviteWorld(row, body, person);
    if (!made.ok) return res.status(made.status || 400).json(made);
    await save();
    return res.status(made.status || 202).json(made);
  }
  if (action === "invites" || action === "asks") {
    return res.status(200).json(worldPeople.invitesOf(row, person));
  }
  if ((action === "accept-invite" || action === "decline-invite" || action === "handle" || action === "at") && require("./_account").needsSignIn(person, row, req)) {
    return res.status(403).json(require("./_account").signInAgain());
  }
  if (action === "accept-invite" || action === "decline-invite") {
    const refusedI = require("./_account").writeRefused(req, homeAccount(person, row, req), action, body);
    if (refusedI) return res.status(403).json(refusedI);
  }
  if (action === "accept-invite") {
    const acc = homeAccount(person, row, req);
    const made = worldPeople.acceptInvite(acc, body.slug || body.desk || body.workspace);
    if (!made.ok) return res.status(made.status || 400).json(made);
    await save();
    return res.status(200).json(made);
  }
  if (action === "decline-invite") {
    const acc = homeAccount(person, row, req);
    const made = worldPeople.declineInvite(acc, body.slug || body.desk || body.workspace);
    if (!made.ok) return res.status(made.status || 400).json(made);
    await save();
    return res.status(200).json(made);
  }
  if (action === "handle" || action === "at") {
    const acc = homeAccount(person, row, req);
    if (!acc) return res.status(401).json({ ok: false, error: "Sign in first." });
    const refusedH = require("./_account").writeRefused(req, acc, "handle", body);
    if (refusedH) return res.status(403).json(refusedH);
    const ownBook = !!(person && person.accountId && person.accountId === acc.id);
    if (!isOwner(person) && !ownBook) return res.status(403).json({ ok: false, error: "Owner sets the world handle on Account." });
    const set = aiaAdmin.setAccountHandle(acc, body.handle || body.at || body.name, { allowReserved: aiaAdmin.isPlatformAccount(acc) });
    if (!set.ok) return res.status(set.status || 409).json({ ok: false, error: set.error });
    await save();
    return res.status(200).json({ ok: true, handle: set.handle, at: "@" + (set.handle === "aia" ? "AIA" : set.handle), hint: "A handle lets people find you on People." });
  }

  if (action === "ask" || action === "permission") {
    const fn = askFn();
    const made = fn(row, person, body.kind || body.want || body.permission);
    if (!made.ok) return res.status(made.status || 400).json({ ok: false, error: made.error });
    await save();
    return res.status(202).json(made);
  }

  if (action === "mine") {
    const fn = mineFn();
    const mine = fn(plans.listHint(person, homeAccount(person, row, req), row.slug));
    const ownAcc = homeAccount(person, row, req);
    // Never the raw seat row (pin hash, thread, a typed accountId): the public seat, trimmed for non-owners.
    return res.status(200).json({ ok: true, plan: publicPlan(accountForDesk(row)), you: viewSeat(publicPerson(person), person, person, ownAcc && ownAcc.id), owned: mine.owned, member: mine.member });
  }

  if (!isOwner(person)) return res.status(403).json({ ok: false, error: "Owner desk code required." });

  if (action === "invite") {
    const made = inviteSeat(row, body, person);
    if (!made.ok) return res.status(made.status || 400).json({ ok: false, error: made.error });
    await save();
    return res.status(made.status || 201).json({ ok: true, person: made.person, pending: !!made.pending, account: publicAccount() });
  }
  if (action === "approve" || action === "deny") {
    const off = action === "deny" && seatOffRefused(row, body.id || body.personId, person);
    if (off) return res.status(off.status).json({ ok: false, error: off.error });
    const made = setSeatStatus(row, body.id || body.personId, action === "deny" ? "denied" : "approved", person);
    if (!made.ok) return res.status(made.status || 400).json({ ok: false, error: made.error });
    if (made.person) pushTalk(made.person, person.name || "owner", action === "deny" ? "Denied this seat." : "Approved. They can open the queue.", action);
    await save();
    return res.status(200).json({ ok: true, person: made.person });
  }
  if (action === "permit" || action === "kind") {
    const fn = permitFn();
    const made = fn(row, body.id || body.personId, body.kind || body.want, person);
    if (!made.ok) return res.status(made.status || 400).json({ ok: false, error: made.error });
    await save();
    return res.status(200).json({ ok: true, person: made.person });
  }
  if (action === "perms") {
    const saved = setDeskPerms(row, body.perms || body);
    if (!saved.ok) return res.status(400).json(saved);
    await save();
    return res.status(200).json({ ok: true, perms: saved.perms });
  }
  if (action === "seat") {
    const saved = setSeatCan(row, body.id || body.personId, body);
    if (!saved.ok) return res.status(400).json(saved);
    await save();
    return res.status(200).json({ ok: true, person: saved.person });
  }
  if (action === "plan" || action === "subscribe") {
    const acc = accountForDesk(row);
    const refusedP = require("./_account").writeRefused(req, acc, "plan", body);
    if (refusedP) return res.status(403).json(refusedP);
    const made = switchPlan(acc, body.plan || body.id || body.name, person);
    if (!made.ok) return res.status(made.status || 400).json({ ok: false, error: made.error });
    await save();
    return res.status(200).json(Object.assign(proHome(acc, person), { hint: made.plan.name + " is active. Still free. Features follow this plan." }));
  }
  if (action === "pro" || action === "home" || action === "login") {
    return res.status(200).json(Object.assign({ savedLogin: true }, proHome(accountForDesk(row), person)));
  }
  if (action === "monthly" || action === "billing") {
    const acc = accountForDesk(row);
    const refusedM = require("./_account").writeRefused(req, acc, "monthly", body);
    if (refusedM) return res.status(403).json(refusedM);
    const made = requestMonthly(acc, person);
    if (!made.ok) return res.status(made.status || 400).json({ ok: false, error: made.error });
    await save();
    return res.status(200).json({ ok: true, hold: true, plan: made.plan, hint: "Still free. Monthly is noted. No card taken. No charge." });
  }
  if (action === "remove") {
    const id = body.id || body.personId;
    const target = (row.people || []).find((p) => p && p.id === id);
    if (!target) return res.status(404).json({ ok: false, error: "Person not found" });
    const off = seatOffRefused(row, id, person);
    if (off) return res.status(off.status).json({ ok: false, error: off.error });
    if (target.role === "owner" && row.people.filter((p) => p.role === "owner").length < 2) return res.status(409).json({ ok: false, error: "Keep at least one owner." });
    row.people = row.people.filter((p) => p.id !== id);
    await save();
    return res.status(200).json({ ok: true, account: publicAccount() });
  }
  return res.status(400).json({ ok: false, error: "Unknown admin action.", actions: ["invite", "request", "ask", "say", "permit", "mine", "person", "world-who", "invite-world", "invites", "accept-invite", "decline-invite", "handle", "approve", "deny", "plan", "login"] });
};

// Store guard: no saving request answers 2xx while its write was refused.
module.exports = require("./_lib").guardStore(module.exports);
