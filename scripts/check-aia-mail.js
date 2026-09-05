#!/usr/bin/env node
const fs = require("fs");
const os = require("os");
const path = require("path");

const store = path.join(os.tmpdir(), "aia-mail-check-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;
process.env.AIA_TLD_PROBE = "0";

delete global.__aia;
delete global.__aiaHydrate;

const root = path.join(__dirname, "..");
let failed = 0;
function fail(m) { failed += 1; console.error("FAIL " + m); }
function pass(m) { console.log("ok   " + m); }

["aia-mail.js", "api/_aia-mail.js", "account.html", "desks.html", "developer.js", "developer.html"].forEach(function (name) {
  if (!fs.existsSync(path.join(root, name))) fail("missing " + name);
  else pass("file " + name);
});

["account.html", "desks.html", "developer.js", "aia-mail.js"].forEach(function (name) {
  const src = fs.readFileSync(path.join(root, name), "utf8");
  if (!/Create \.aia email for automations/.test(src)) fail(name + " missing create .aia email copy");
  else pass(name + " create .aia email");
});

["account.html", "desks.html", "developer.html"].forEach(function (name) {
  const src = fs.readFileSync(path.join(root, name), "utf8");
  if (!/aia-mail\.js/.test(src)) fail(name + " must load aia-mail.js");
  else pass(name + " loads aia-mail.js");
});

const packMd = fs.readFileSync(path.join(root, "PACK.md"), "utf8");
if (!/james-ai@funditaway\.aia/.test(packMd) || !/queue@springfield-shop\.aia/.test(packMd)) fail("PACK.md missing examples");
else pass("PACK.md examples");
if (!/Outbound Send stays HOLD/.test(packMd) || !/does not resolve yet/.test(packMd)) fail("PACK.md missing honest MX copy");
else pass("PACK.md honest MX");

const holdFiles = ["api/_aia-mail.js", "aia-mail.js", "PACK.md"];
holdFiles.forEach(function (name) {
  const src = fs.readFileSync(path.join(root, name), "utf8");
  if (/\$250/.test(src)) fail(name + " invented $250");
  else pass(name + " no $250");
});

["../api/_lib", "../api/_account", "../api/_aia-mail", "../api/account", "../api/auth", "../api/desks", "../api/hook", "../api/health", "../api/_packs"].forEach(function (mod) {
  try { delete require.cache[require.resolve(mod)]; } catch (e) {}
});

const lib = require("../api/_lib");
const mail = require("../api/_aia-mail");
const account = require("../api/account");
const auth = require("../api/auth");
const desks = require("../api/desks");
const hook = require("../api/hook");
const health = require("../api/health");
const packHandler = require("../api/_packs");
const { mem, hashPin, ensurePeople, ready, save } = lib;

function mockRes() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    end() { return this; }
  };
}
function reqOf(method, headers, body, query) {
  return { method: method, headers: headers || {}, body: body || {}, query: query || {} };
}
async function call(handler, method, headers, body, query) {
  const res = mockRes();
  await handler(reqOf(method, headers, body, query), res);
  return res;
}

async function main() {
  await ready();
  const slug = "james-desk";
  const pin = "4821";
  const opened = await call(auth, "POST", { "x-workspace": slug }, {
    action: "open",
    slug: slug,
    biz: "James Desk",
    name: "James",
    email: "james@example.com",
    pin: pin
  });
  if (opened.statusCode !== 201 && opened.statusCode !== 200) fail("open desk " + opened.statusCode);
  else pass("open desk");

  const owner = { "x-workspace": slug, "x-pin": pin };
  const handle = await call(account, "POST", owner, { action: "handle", handle: "funditaway.aia" });
  if (handle.statusCode !== 200 || !handle.body || handle.body.aia !== "funditaway.aia") {
    fail("set handle " + handle.statusCode + " " + JSON.stringify(handle.body));
  } else pass("account is funditaway.aia");

  const shop = (mem.workspaces || []).find(function (w) { return w && w.slug === slug; });
  if (shop) {
    shop.aia = "springfield-shop.aia";
    shop.aiaLabel = "springfield-shop";
  }

  const saveAi = await call(packHandler, "POST", owner, {
    action: "save-ai",
    name: "James’s AI",
    aia: "james.aia",
    role: "Doer",
    does: "Drafts this project desk",
    steps: "qualify, do, follow"
  });
  if (saveAi.statusCode !== 200 || !saveAi.body.ok) fail("save-ai " + JSON.stringify(saveAi.body));
  else pass("named desk AI");

  const parsed = mail.parseAddress("james-ai@funditaway.aia");
  if (!parsed.ok || parsed.address !== "james-ai@funditaway.aia") fail("parse james-ai@funditaway.aia");
  else pass("parse james-ai@funditaway.aia");
  const shopAddr = mail.parseAddress("queue@springfield-shop.aia");
  if (!shopAddr.ok || shopAddr.domain !== "springfield-shop.aia") fail("parse queue@springfield-shop.aia");
  else pass("parse queue@springfield-shop.aia");
  if (mail.parseAddress("james-ai@funditaway.com").ok) fail("must reject .com");
  else pass("rejects other TLDs");
  if (mail.parseAddress("not-an-email").ok) fail("must require @");
  else pass("requires local@account.aia");

  const acc = (mem.accounts || [])[0];
  const badDomain = mail.validateAddress("queue@other-shop.aia", acc, shop);
  if (badDomain.ok) fail("must reject mismatched account label");
  else pass("account label must match");

  const made = await call(account, "POST", owner, {
    action: "mail-add",
    local: "james-ai",
    bind: "ai",
    ai: "James’s AI",
    desk: slug
  });
  if (made.statusCode !== 200 || !made.body.identity || made.body.identity.address !== "james-ai@funditaway.aia") {
    fail("create james-ai " + made.statusCode + " " + JSON.stringify(made.body));
  } else pass("create james-ai@funditaway.aia");
  if (made.body.identity.mx || made.body.identity.live || made.body.identity.smtp) fail("identity must not claim MX");
  else pass("identity mx false");
  if (made.body.identity.send !== "hold") fail("identity send must HOLD");
  else pass("identity send HOLD");

  const queue = await call(desks, "POST", owner, {
    action: "mail-add",
    local: "queue",
    bind: "desk",
    account: "springfield-shop"
  });
  if (queue.statusCode !== 200 || !queue.body.identity || queue.body.identity.address !== "queue@springfield-shop.aia") {
    fail("create queue " + queue.statusCode + " " + JSON.stringify(queue.body));
  } else pass("create queue@springfield-shop.aia");

  const listed = await call(account, "POST", owner, { action: "mail" });
  const addrs = ((listed.body && listed.body.mail) || []).map(function (r) { return r.address; });
  if (addrs.indexOf("james-ai@funditaway.aia") < 0 || addrs.indexOf("queue@springfield-shop.aia") < 0) {
    fail("list mail " + JSON.stringify(addrs));
  } else pass("list both identities");

  const wrong = await call(account, "POST", owner, {
    action: "mail-add",
    address: "spy@other.aia",
    desk: slug
  });
  if (wrong.statusCode < 400) fail("mismatched domain must 400");
  else pass("create rejects other account label");

  const send = await call(account, "POST", owner, { action: "mail-send", to: "neighbor@example.com", text: "hi" });
  if (send.statusCode !== 409 || !send.body.hold || send.body.send !== "hold" || send.body.mx !== false) {
    fail("send must 409 HOLD " + send.statusCode + " " + JSON.stringify(send.body));
  } else pass("outbound send HOLD");
  if (!/orange/i.test(String(send.body.status || ""))) fail("send status should be orange");
  else pass("send status orange");

  const hookSend = await call(hook, "POST", owner, { action: "send", to: "james-ai@funditaway.aia", text: "nope" });
  if (hookSend.statusCode !== 409 || !hookSend.body.hold) fail("hook send must HOLD");
  else pass("hook send HOLD");

  const inbound = await call(hook, "POST", {}, {
    event: "mail",
    to: "james-ai@funditaway.aia",
    from: "neighbor@example.com",
    subject: "Need a quote",
    text: "Can you look at the porch?"
  });
  if (inbound.statusCode !== 201 || !inbound.body.ok || !inbound.body.job) {
    fail("inbound " + inbound.statusCode + " " + JSON.stringify(inbound.body));
  } else pass("inbound mail captures");
  const job = inbound.body.job;
  if (job.workspace !== slug) fail("inbound landed on wrong desk");
  else pass("inbound lands on bound desk");
  if (job.aiaMail !== "james-ai@funditaway.aia") fail("job missing aiaMail");
  else pass("job stamped with identity");
  if (!job.custom || !job.custom.automation || job.custom.automation.trigger !== "mail") fail("automation trigger missing");
  else pass("automations trigger from inbound");
  if (job.status === "shipped" || job.rail === "sent") fail("inbound must not send");
  else pass("inbound does not send");

  const missing = await call(hook, "POST", {}, { to: "nobody@funditaway.aia", subject: "x" });
  if (missing.statusCode !== 404) fail("unknown identity must 404, got " + missing.statusCode);
  else pass("unknown identity 404");

  const h = await call(health, "GET", {}, {}, {});
  if (!h.body || !h.body.mail || h.body.mail.mx || h.body.mail.live || h.body.mail.smtp) fail("health must not claim MX");
  else pass("health mail HOLD");
  if (!/does not resolve yet/.test(h.body.mail.note || "")) fail("health missing DNS honesty");
  else pass("health DNS honesty");
  if (h.body.mail.send !== "hold") fail("health send must HOLD");
  else pass("health send HOLD");

  const deskGet = await call(desks, "GET", owner, {}, {});
  if (!deskGet.body || !deskGet.body.desk || !Array.isArray(deskGet.body.desk.mail) || deskGet.body.desk.mail.length < 2) {
    fail("public desk missing mail");
  } else pass("desk GET lists identities");
  if (deskGet.body.desk.mx && (deskGet.body.desk.mx.live || deskGet.body.desk.mx.mx)) fail("desk mx claimed live");
  else pass("desk mx HOLD");

  const gone = await call(account, "POST", owner, { action: "mail-remove", address: "james-ai@funditaway.aia" });
  if (gone.statusCode !== 200 || gone.body.removed !== "james-ai@funditaway.aia") fail("remove " + JSON.stringify(gone.body));
  else pass("remove identity");

  if (/\$250|live eBay|on-chain owned|smtp live/i.test(JSON.stringify(made.body) + JSON.stringify(inbound.body) + JSON.stringify(h.body.mail))) {
    fail("hard-line leak");
  } else pass("no demo $250 / live eBay / fake MX");

  await save();
  try { if (fs.existsSync(store)) fs.unlinkSync(store); } catch (e) {}
  if (failed) {
    console.error(failed + " failed");
    process.exit(1);
  }
  console.log("check-aia-mail ok");
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
