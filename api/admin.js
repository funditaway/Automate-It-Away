const {
  cors, mem, ready, save, workspaceOf, personOf, isOwner, ensureRules, jobCounts, readBody, slugify, publicPerson
} = require("./_lib");
const { adminPinOk } = require("./_desk");
const {
  ensureAccount, publicAccount, accountSnapshot, inviteSeat, requestSeat,
  setSeatStatus, approvalsOf, peopleAcross, accountForDesk, homeAccount, requestMonthly, publicPlan,
  switchPlan, publicPlans, proHome, requestPermission, setPermission, desksForPerson
} = require("./_account");
const aiaAdmin = require("./_aia-admin");
const worldPeople = require("./_world-people");
const { setDeskPerms, setSeatCan, publicDesk } = require("./_desk");
const plans = require("./_plans");
const { historyOf, filterHistory } = require("./_history");

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
    id: String(hint.id || hint.personId || "").trim(),
    name: String(hint.name || hint.who || hint.person || "").trim(),
    email: lower(hint.email),
    accountId: String(hint.accountId || hint.account || "").trim()
  };
}
function seatMatchesPerson(seat, hint) {
  if (!seat) return false;
  if (hint.id && seat.id === hint.id) return true;
  if (hint.accountId && String(seat.accountId || "") === hint.accountId) return true;
  if (hint.email && lower(seat.email) === hint.email) return true;
  if (hint.name && hint.email && lower(seat.name) === lower(hint.name) && lower(seat.email) === hint.email) return true;
  if (!hint.id && !hint.accountId && !hint.email && hint.name) return lower(seat.name) === lower(hint.name);
  return false;
}
function allowedSlugs(currentSlug, extras) {
  const out = [];
  const seen = {};
  function add(slug) {
    const use = slugify(slug || "");
    if (!use || seen[use]) return;
    seen[use] = true;
    out.push(use);
  }
  add(currentSlug);
  const list = Array.isArray(extras) ? extras : [];
  list.slice(0, 32).forEach((item) => {
    const slug = slugify(item && (item.slug || item.workspace || item.biz || item.name) || "");
    if (!slug || seen[slug]) return;
    const headers = { "x-workspace": slug };
    if (item && item.pin != null) headers["x-pin"] = String(item.pin);
    if (item && item.token != null) headers["x-session"] = String(item.token);
    const found = personOf({ headers }, slug);
    if (!found.workspace || !found.person || (found.person && found.person.status === "pending")) return;
    add(slug);
  });
  return out;
}
function touchTime(job) {
  return String((job && (job.doneAt || job.updatedAt || job.createdAt || job.t)) || "");
}
function historyCard(job, row) {
  if (!job) return null;
  return {
    id: job.id,
    title: job.title || "Card",
    slug: job.workspace || (row && row.slug) || "",
    desk: deskName(row) || job.workspace || "",
    status: job.status || "",
    step: job.step || "",
    waitingOn: job.waitingOn || "",
    assignee: job.assignee || "",
    from: job.from || "",
    whoTapped: job.whoTapped || "",
    doneBy: job.doneBy || "",
    contactName: job.contactName || "",
    t: touchTime(job),
    offDesk: !!(job.status === "out" || job.offDesk),
    done: job.status === "shipped" || job.status === "killed"
  };
}
function jobTouchesPerson(job, match) {
  if (!job) return false;
  const custom = job.custom && typeof job.custom === "object" ? job.custom : {};
  if (custom.personId && match.ids[custom.personId]) return true;
  if (job.handedTo && job.handedTo.id && match.ids[job.handedTo.id]) return true;
  const values = [
    job.assignee,
    job.handedTo && job.handedTo.name,
    job.from,
    job.whoTapped,
    job.doneBy,
    job.sentByAgent,
    job.contactName
  ].map(lower).filter(Boolean);
  return values.some((val) => match.names[val] || match.emails[val] || match.ids[val] || match.accountIds[val]);
}
function personBook(hint, opts) {
  const want = personHint(hint);
  const viewer = opts && opts.viewer ? opts.viewer : null;
  const currentSlug = slugify((opts && opts.currentSlug) || "");
  const slugs = allowedSlugs(currentSlug, opts && opts.slugs);
  const rows = slugs.map((slug) => (mem.workspaces || []).find((w) => w && w.slug === slug)).filter(Boolean);
  const seats = [];
  rows.forEach((row) => {
    (row.people || []).forEach((seat) => {
      if (seatMatchesPerson(seat, want)) seats.push(Object.assign({ slug: row.slug, desk: deskName(row) }, seat));
    });
  });
  if (!seats.length) return { ok: false, status: 404, error: "Person not found.", slugs };
  const match = { ids: {}, names: {}, emails: {}, accountIds: {} };
  seats.forEach((seat) => {
    if (seat.id) match.ids[seat.id] = true;
    if (seat.name) match.names[lower(seat.name)] = true;
    if (seat.email) match.emails[lower(seat.email)] = true;
    if (seat.accountId) match.accountIds[String(seat.accountId)] = true;
  });
  const first = seats[0];
  const historyItems = [];
  const cards = [];
  rows.forEach((row) => {
    const jobs = (mem.jobs || []).filter((job) => job && job.workspace === row.slug);
    const openJobs = jobs.filter((job) => jobTouchesPerson(job, match));
    openJobs.forEach((job) => {
      const card = historyCard(job, row);
      if (card) cards.push(card);
    });
    historyItems.push.apply(historyItems, filterHistory(historyOf(row, jobs, [], {}).items, { who: first.name }).filter((item) => (
      item && (
        match.names[lower(item.who)] ||
        (item.hands || []).some((name) => match.names[lower(name)])
      )
    )));
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
    person: Object.assign({}, publicPerson(first) || {}, { phone: first.phone || "", desks: seats.length }),
    viewer: publicPerson(viewer),
    slugs,
    allowedSlugs: slugs,
    currentSlug,
    seats: seatCards,
    cards: cards.filter((card) => !card.done).slice(0, 24),
    history: historyItems.slice(0, 40),
    lastCard: cards[0] || historyItems[0] || null,
    thread: (first.thread || []).slice(-40),
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
      const acc = homeAccount(person, row);
      const foundWorld = worldPeople.searchWorldAccounts(q.q || q.handle || q.at || q.name || q.world || "", { desk: row, account: acc });
      return res.status(foundWorld.ok ? 200 : (foundWorld.status || 400)).json(Object.assign({ world: true }, foundWorld));
    }
    if (q.who || q.person || q.name) {
      const book = personBook({
        name: q.who || q.person || q.name,
        id: q.id || q.personId || "",
        email: q.email || "",
        accountId: q.account || q.accountId || ""
      }, { slugs: [row.slug], viewer: person, currentSlug: row.slug });
      return res.status(book.ok ? 200 : (book.status || 404)).json(book);
    }
    const owner = isOwner(person);
    const snap = accountSnapshot(row, person);
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
    const made = requestSeat(row, body);
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
  if (action === "accept-invite") {
    const acc = homeAccount(person, row);
    const made = worldPeople.acceptInvite(acc, body.slug || body.desk || body.workspace);
    if (!made.ok) return res.status(made.status || 400).json(made);
    await save();
    return res.status(200).json(made);
  }
  if (action === "decline-invite") {
    const acc = homeAccount(person, row);
    const made = worldPeople.declineInvite(acc, body.slug || body.desk || body.workspace);
    if (!made.ok) return res.status(made.status || 400).json(made);
    await save();
    return res.status(200).json(made);
  }
  if (action === "handle" || action === "at") {
    const acc = homeAccount(person, row);
    if (!acc) return res.status(401).json({ ok: false, error: "Sign in first." });
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
    const mine = fn({ id: person.id, name: person.name, email: person.email, pin: person.pin, accountId: person.accountId });
    return res.status(200).json({ ok: true, plan: publicPlan(accountForDesk(row)), you: person, owned: mine.owned, member: mine.member });
  }

  if (!isOwner(person)) return res.status(403).json({ ok: false, error: "Owner desk code required." });

  if (action === "invite") {
    const made = inviteSeat(row, body, person);
    if (!made.ok) return res.status(made.status || 400).json({ ok: false, error: made.error });
    await save();
    return res.status(made.status || 201).json({ ok: true, person: made.person, pending: !!made.pending, account: publicAccount() });
  }
  if (action === "approve" || action === "deny") {
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
    const made = requestMonthly(acc, person);
    if (!made.ok) return res.status(made.status || 400).json({ ok: false, error: made.error });
    await save();
    return res.status(200).json({ ok: true, hold: true, plan: made.plan, hint: "Still free. Monthly is noted. No card taken. No charge." });
  }
  if (action === "remove") {
    const id = body.id || body.personId;
    const target = (row.people || []).find((p) => p && p.id === id);
    if (!target) return res.status(404).json({ ok: false, error: "Person not found" });
    if (target.role === "owner" && row.people.filter((p) => p.role === "owner").length < 2) return res.status(409).json({ ok: false, error: "Keep at least one owner." });
    row.people = row.people.filter((p) => p.id !== id);
    await save();
    return res.status(200).json({ ok: true, account: publicAccount() });
  }
  return res.status(400).json({ ok: false, error: "Unknown admin action.", actions: ["invite", "request", "ask", "say", "permit", "mine", "person", "world-who", "invite-world", "invites", "accept-invite", "decline-invite", "handle", "approve", "deny", "plan", "login"] });
};
