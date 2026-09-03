const lib = require("./_lib");
const { cors, mem, ready, save, readBody, workspaceOf, personOf, isOwner } = lib;
const {
  ensureAccount, accountForDesk, homeAccount, loginAccount, proHome, createOwnerAccount, publicPlan,
  switchPlan, looksLikeEmail, passwordMatches, setAccountPassword, applyAccountDetails
} = require("./_account");
const { leaveSeat, wipeDesk, confirmDeskName, heldCollectAsk, applyDeskEdit, setDeskClosed, publicDesk } = require("./_desk");

function refreshSession(req, res) {
  if (req && req.__aiaSessionToken && typeof lib.sessionCookie === "function") {
    res.setHeader("Set-Cookie", lib.sessionCookie(req.__aiaSessionToken));
  }
}

function sessionTokenOf(req) {
  return String((req && req.__aiaSessionToken) || (req && req.headers && req.headers["x-session"]) || lib.parseCookies(req).aia_session || "").trim();
}

function safeAccount(acc) {
  if (!acc) return null;
  return {
    id: acc.id,
    slug: acc.slug || "",
    name: acc.name || "",
    ownerName: acc.ownerName || "",
    email: acc.email || "",
    phone: acc.phone || "",
    city: acc.city || "",
    state: acc.state || "",
    timezone: acc.timezone || "",
    hours: acc.hours || "",
    note: acc.note || "",
    preferredDesk: acc.preferredDesk || "",
    photoUrl: acc.photoUrl || "",
    createdAt: acc.createdAt || "",
    plan: acc.plan || "pro",
    billing: Object.assign({}, acc.billing || {}, { charged: false, status: "free" }),
    desks: Array.isArray(acc.desks) ? acc.desks.slice() : [],
    memberDesks: Array.isArray(acc.memberDesks) ? acc.memberDesks.slice() : [],
    hasPassword: !!acc.password,
    mfaOn: !!acc.mfaOn
  };
}

function safePerson(person) {
  if (!person) return null;
  return {
    id: person.id,
    name: person.name || "",
    role: person.role || "",
    kind: person.kind || "",
    status: person.status || "approved",
    email: person.email || "",
    accountId: person.accountId || "",
    can: person.can || undefined,
    createdAt: person.createdAt || "",
    approvedAt: person.approvedAt || null
  };
}

function safeDesk(row) {
  if (!row) return null;
  return {
    slug: row.slug,
    name: row.name || "",
    biz: row.biz || row.name || row.slug,
    city: row.city || "",
    model: row.model || "",
    does: row.does || "",
    createdAt: row.createdAt || "",
    closed: !!row.closed,
    listed: row.listed === true,
    visibility: row.visibility || (row.listed ? "public" : "private"),
    nouns: lib.ensureNouns(row),
    rules: lib.ensureRules(row),
    people: (row.people || []).map(safePerson).filter(Boolean)
  };
}

function accountExport(acc, current, currentToken) {
  const slugs = Array.from(new Set([].concat(acc && acc.desks || [], acc && acc.memberDesks || [], current && current.slug || []).filter(Boolean)));
  return {
    format: "aia.account.v1",
    exportedAt: new Date().toISOString(),
    account: safeAccount(acc),
    desks: slugs.map((slug) => safeDesk((mem.workspaces || []).find((w) => w && w.slug === slug))).filter(Boolean),
    approvals: (mem.approvals || []).filter((a) => a && slugs.indexOf(a.slug) >= 0).map((a) => Object.assign({}, a)),
    sessions: typeof lib.listSessions === "function" ? lib.listSessions({ accountId: acc && acc.id, currentToken }) : []
  };
}

function authAccount(req) {
  const slug = workspaceOf(req);
  const found = personOf(req, slug);
  if (!found.workspace || !found.person) return { found, account: null };
  return { found, account: homeAccount(found.person, found.workspace) };
}

function findDesk(slug) {
  const want = lib.slugify(slug || "");
  return (mem.workspaces || []).find((w) => w && w.slug === want) || null;
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  await ready();
  ensureAccount();

  if (req.method === "GET") {
    const slug = workspaceOf(req);
    const found = personOf(req, slug);
    if (found.pending) {
      return res.status(403).json({ ok: false, pending: true, error: "That seat is waiting on the owner." });
    }
    if (found.person) {
      const acc = homeAccount(found.person, found.workspace);
      if (acc) {
        refreshSession(req, res);
        return res.status(200).json(proHome(acc, found.person));
      }
    }
    const pin = (req.headers && req.headers["x-pin"]) || "";
    const via = loginAccount(slug, pin);
    if (via.ok) {
      const owner = via.person || (via.desk && via.desk.people || []).find((p) => p && p.role === "owner") || { name: via.account.ownerName, role: "owner", kind: "owner" };
      return res.status(200).json(proHome(via.account, owner));
    }
    if (!found.workspace || !found.person) {
      return res.status(401).json({ ok: false, error: "Account name, desk code, or email does not match." });
    }
    return res.status(200).json(proHome(accountForDesk(found.workspace), found.person));
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Use GET or POST." });
  }

  const body = await readBody(req);
  const action = String(body.action || "login").toLowerCase();

  if (action === "login" || action === "open" || action === "save") {
    const name = body.account || body.slug || body.biz || body.name || workspaceOf(req);
    const pin = body.pin || (req.headers && req.headers["x-pin"]) || "";
    const extra = {
      email: body.email || (looksLikeEmail(name) ? name : ""),
      password: body.password || body.pass || ""
    };
    const via = loginAccount(name, pin, extra);
    if (!via.ok) return res.status(via.status || 401).json({ ok: false, pending: !!via.pending, locked: !!via.locked, error: via.error });
    const who = via.person || (via.desk && via.desk.people || []).find((p) => p && p.role === "owner") || {
      name: via.account.ownerName, role: "owner", kind: "owner"
    };
    const session = typeof lib.issueSession === "function" ? lib.issueSession(who, via.desk, via.account, req) : null;
    if (session && typeof lib.sessionCookie === "function") res.setHeader("Set-Cookie", lib.sessionCookie(session.token));
    await save();
    const home = proHome(via.account, who);
    return res.status(200).json(Object.assign({ savedLogin: true, session }, home));
  }

  if (action === "attach") {
    const { found, account } = authAccount(req);
    if (!found.workspace || !isOwner(found.person)) {
      return res.status(403).json({ ok: false, error: "Owner desk code required to attach a desk." });
    }
    const acc = account || accountForDesk(found.workspace);
    const other = String(body.desk || body.attach || body.name || "").trim();
    if (!other) return res.status(400).json({ ok: false, error: "Name the desk to attach." });
    const row = findDesk(other);
    if (!row) return res.status(404).json({ ok: false, error: "No desk with that name." });
    acc.desks = acc.desks || [];
    if (acc.desks.indexOf(row.slug) < 0) acc.desks.push(row.slug);
    row.accountId = acc.id;
    refreshSession(req, res);
    await save();
    return res.status(200).json(proHome(acc, found.person));
  }

  if (action === "plan" || action === "subscribe") {
    const { found, account } = authAccount(req);
    if (!found.workspace || !isOwner(found.person)) {
      return res.status(403).json({ ok: false, error: "Owner desk code required to switch the plan." });
    }
    const acc = account || accountForDesk(found.workspace);
    const made = switchPlan(acc, body.plan || body.id || body.name, found.person);
    if (!made.ok) return res.status(made.status || 400).json({ ok: false, error: made.error });
    refreshSession(req, res);
    await save();
    const home = proHome(acc, found.person);
    return res.status(200).json(Object.assign(home, {
      hint: made.plan.name + " is active. Still free. Features follow this plan."
    }));
  }

  if (action === "password" || action === "details" || action === "profile") {
    const { found, account } = authAccount(req);
    if (!found.workspace || !found.person) {
      return res.status(401).json({ ok: false, error: "Sign in first." });
    }
    const acc = account;
    if (!acc) return res.status(404).json({ ok: false, error: "No AIA account on this login." });
    if (action === "password") {
      if (acc.password) {
        const current = String(body.current || body.old || "");
        const viaPw = current && passwordMatches(acc.password, current);
        const viaPin = current && acc.pin && acc.pin === lib.hashPin(current);
        if (!viaPw && !viaPin) {
          return res.status(401).json({ ok: false, error: "Current password or desk code does not match." });
        }
      }
      const set = setAccountPassword(acc, body.password || body.next);
      if (!set.ok) return res.status(400).json({ ok: false, error: set.error });
      if (body.email && looksLikeEmail(body.email)) {
        const applied = applyAccountDetails(acc, { email: body.email });
        if (applied && applied.ok === false) return res.status(409).json({ ok: false, error: applied.error });
      }
      refreshSession(req, res);
      await save();
      return res.status(200).json({ ok: true, hasPassword: true, email: acc.email || "", hint: "Email and password can now open this account." });
    }
    if (body.name) found.person.name = String(body.name).trim().slice(0, 80);
    const applied = applyAccountDetails(acc, body);
    if (applied && applied.ok === false) return res.status(400).json({ ok: false, error: applied.error });
    refreshSession(req, res);
    await save();
    return res.status(200).json(Object.assign(proHome(acc, found.person), { hint: "Account details saved." }));
  }

  if (action === "mint") {
    const { found } = authAccount(req);
    if (!found.workspace || !isOwner(found.person)) {
      return res.status(403).json({ ok: false, error: "Owner desk code required." });
    }
    const acc = createOwnerAccount(body, found.workspace);
    refreshSession(req, res);
    await save();
    return res.status(200).json({ ok: true, plan: publicPlan(acc), account: { id: acc.id, name: acc.name } });
  }

  if (action === "sessions") {
    const { found, account } = authAccount(req);
    if (!found.workspace || !found.person || !account) {
      return res.status(401).json({ ok: false, error: "Sign in first." });
    }
    refreshSession(req, res);
    return res.status(200).json({ ok: true, sessions: lib.listSessions({ accountId: account.id, currentToken: sessionTokenOf(req) }) });
  }

  if (action === "logout") {
    const token = sessionTokenOf(req);
    const removed = token && typeof lib.revokeSession === "function" ? lib.revokeSession(token) : 0;
    if (typeof lib.clearSessionCookie === "function") res.setHeader("Set-Cookie", lib.clearSessionCookie());
    await save();
    return res.status(200).json({ ok: true, loggedOut: true, removed, hint: "This phone forgets the desk. The desk stays." });
  }

  if (action === "logout-all") {
    const { found, account } = authAccount(req);
    if (!found.workspace || !found.person || !account) {
      return res.status(401).json({ ok: false, error: "Sign in first." });
    }
    const removed = typeof lib.revokeSession === "function" ? lib.revokeSession("", { accountId: account.id }) : 0;
    if (typeof lib.clearSessionCookie === "function") res.setHeader("Set-Cookie", lib.clearSessionCookie());
    await save();
    return res.status(200).json({ ok: true, loggedOut: true, all: true, removed });
  }

  if (action === "export") {
    const { found, account } = authAccount(req);
    if (!found.workspace || !found.person || !account) {
      return res.status(401).json({ ok: false, error: "Sign in first." });
    }
    refreshSession(req, res);
    return res.status(200).json({ ok: true, pack: accountExport(account, found.workspace, sessionTokenOf(req)) });
  }

  if (action === "mfa") {
    const { found, account } = authAccount(req);
    if (!found.workspace || !found.person || !account) {
      return res.status(401).json({ ok: false, error: "Sign in first." });
    }
    const on = body.on !== false && body.on !== "false" && body.enabled !== false && body.enabled !== "false";
    if (on) {
      return res.status(409).json({ ok: false, hold: true, error: "HOLD. Authenticator is not live on this account." });
    }
    account.mfaOn = false;
    refreshSession(req, res);
    await save();
    return res.status(200).json({ ok: true, hold: true, mfaOn: false, hint: "Authenticator stays on HOLD." });
  }

  if (action === "desk-update" || action === "desk-edit") {
    const { found, account } = authAccount(req);
    if (!found.workspace || !found.person || !account) {
      return res.status(401).json({ ok: false, error: "Sign in first." });
    }
    const row = findDesk(body.desk || body.slug || found.workspace.slug);
    if (!row) return res.status(404).json({ ok: false, error: "No desk with that name." });
    if (!isOwner(found.person) && found.workspace.slug !== row.slug) {
      return res.status(403).json({ ok: false, error: "Only the owner can edit that shop." });
    }
    const saved = applyDeskEdit(row, body);
    if (!saved.ok) return res.status(400).json(saved);
    refreshSession(req, res);
    await save();
    return res.status(200).json(Object.assign({ ok: true, desk: publicDesk(row, found.person), hint: "Shop saved." }, proHome(account, found.person)));
  }

  if (action === "desk-close" || action === "desk-open" || action === "desk-reopen") {
    const { found, account } = authAccount(req);
    if (!found.workspace || !found.person || !account) {
      return res.status(401).json({ ok: false, error: "Sign in first." });
    }
    const row = findDesk(body.desk || body.slug || found.workspace.slug);
    if (!row) return res.status(404).json({ ok: false, error: "No desk with that name." });
    if (!isOwner(found.person)) return res.status(403).json({ ok: false, error: "Only the owner can close this desk." });
    setDeskClosed(row, action === "desk-close");
    refreshSession(req, res);
    await save();
    return res.status(200).json(Object.assign({
      ok: true,
      desk: publicDesk(row, found.person),
      hint: action === "desk-close" ? "No new drops. Drafts already on the queue stay." : "Desk is open."
    }, proHome(account, found.person)));
  }

  if (action === "leave" || action === "detach") {
    const { found, account } = authAccount(req);
    if (!found.workspace || !found.person || !account) {
      return res.status(401).json({ ok: false, error: "Sign in first." });
    }
    const want = lib.slugify(body.desk || body.slug || found.workspace.slug);
    const row = findDesk(want);
    if (!row) return res.status(404).json({ ok: false, error: "No desk with that name." });
    const seat = (row.people || []).find((p) => p && (
      p.id === found.person.id ||
      (found.person.accountId && p.accountId === found.person.accountId) ||
      (account.id && p.accountId === account.id)
    )) || (want === found.workspace.slug ? found.person : null);
    if (!seat) return res.status(403).json({ ok: false, error: "You do not sit on that desk." });
    const left = leaveSeat(row, seat, account);
    if (!left.ok) return res.status(left.status || 400).json({ ok: false, error: left.error });
    refreshSession(req, res);
    await save();
    return res.status(200).json(Object.assign({
      ok: true,
      left: want,
      hint: "You are off this desk. Cards stay for the owner."
    }, proHome(account, found.person)));
  }

  if (action === "delete" || action === "delete-desk" || action === "wipe") {
    const { found, account } = authAccount(req);
    if (!found.workspace || !found.person || !account) {
      return res.status(401).json({ ok: false, error: "Sign in first." });
    }
    const want = lib.slugify(body.desk || body.slug || found.workspace.slug);
    const row = findDesk(want);
    if (!row) return res.status(404).json({ ok: false, error: "No desk with that name." });
    const seat = (row.people || []).find((p) => p && p.id === found.person.id) || found.person;
    if (!isOwner(seat) && !isOwner(found.person)) {
      return res.status(403).json({ ok: false, error: "Only the owner can delete this desk." });
    }
    if (!confirmDeskName(row, body.confirm || body.say)) {
      return res.status(409).json({
        ok: false,
        error: "Type the shop name. Cards go. The log stays.",
        need: row.biz || row.slug
      });
    }
    const asks = heldCollectAsk(row.slug, 250);
    if (asks.length) {
      return res.status(409).json({
        ok: false,
        ask: true,
        error: "This desk has a held collect card of $250 or more. Ask before you wipe it.",
        held: asks.length
      });
    }
    const wiped = wipeDesk(row.slug, seat);
    refreshSession(req, res);
    await save();
    return res.status(200).json(Object.assign({
      ok: true,
      deleted: wiped.slug,
      name: wiped.name,
      charged: false,
      hint: "Desk deleted. Cards gone. The log stays."
    }, proHome(account, found.person)));
  }

  return res.status(400).json({
    ok: false,
    error: "Unknown account action.",
    actions: ["login", "open", "save", "attach", "plan", "mint", "password", "details", "logout", "logout-all", "sessions", "export", "mfa", "leave", "detach", "desk-update", "desk-close", "desk-open", "delete", "delete-desk"]
  });
};
