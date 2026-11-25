#!/usr/bin/env node
require("./_env-guard");
// Pack / add-on install history: fresh, upgrade, failed save, retry/noop.
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
process.env.AIA_STORE_PATH = path.join(os.tmpdir(), "aia-install-hist-" + Date.now() + "-" + process.pid + ".json");
delete global.__aia;
delete global.__aiaHydrate;
delete global.__aiaStoreLoaded;

let failed = 0;
let asserts = 0;
function fail(msg) { console.error("FAIL " + msg); failed += 1; process.exitCode = 1; }
function pass(msg) { console.log("ok  " + msg); }
function ok(cond, msg) { asserts += 1; if (cond) pass(msg); else fail(msg); }

function mockRes() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    getHeader(k) { return this.headers[String(k).toLowerCase()]; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    end(b) { if (b !== undefined && this.body == null) this.body = b; return this; }
  };
}
async function call(handler, method, headers, body, query) {
  const res = mockRes();
  const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  ["log", "error", "warn", "info"].forEach((k) => { console[k] = function () {}; });
  try {
    await handler({ method, headers: headers || {}, body: body == null ? {} : body, query: query || {}, url: "" }, res);
  } finally {
    Object.assign(console, orig);
  }
  return res;
}

async function main() {
  const ihPath = path.join(root, "api/_install-history.js");
  ok(fs.existsSync(ihPath), "_install-history.js present");
  const schemaPath = path.join(root, "schemas/install-history.json");
  ok(fs.existsSync(schemaPath), "install-history JSON schema present");
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  ok(schema.title === "AIAInstallHistoryEntry", "schema title");
  ok(Array.isArray(schema.required) && schema.required.indexOf("installMode") >= 0, "schema requires installMode");

  const types = fs.readFileSync(path.join(root, "runtime/src/types.ts"), "utf8");
  ok(types.indexOf("InstallHistoryEntry") >= 0 && types.indexOf("InstallMode") >= 0, "TypeScript InstallHistoryEntry types");

  const packs = require(path.join(root, "api/_packs"));
  const lib = require(path.join(root, "api/_lib"));
  const ih = require(path.join(root, "api/_install-history"));
  await lib.ready();

  const DESK = "hist-desk";
  const ACC = "acct_hist";
  const now = "2026-01-01T00:00:00.000Z";
  const pin = (n) => lib.hashPin(n);
  const person = {
    id: "p_ann_hist", name: "Ann", role: "owner", kind: "owner",
    status: "approved", pin: pin("1111"), accountId: ACC, email: "", createdAt: now
  };
  const desk = {
    slug: DESK, biz: DESK, name: DESK, accountId: ACC, pin: pin("1111"),
    createdAt: now, people: [person], rules: [], does: ""
  };
  const acc = {
    id: ACC, name: "Ann Shop", ownerName: "Ann", email: "ann@hist.test",
    desks: [DESK], memberDesks: [], createdAt: now, kind: "human", history: []
  };
  lib.mem.accounts = [acc];
  lib.mem.workspaces = [desk];
  lib.mem.jobs = [];
  lib.mem.packs = [];
  lib.mem.audit = [];
  lib.mem.installHistory = [];
  lib.mem.money = [];

  const hdr = { "x-workspace": DESK, "x-pin": "1111" };

  // Unit: normalize + classify
  const fresh = ih.normalizeEntry({
    pack: { id: "home", name: "Home", version: "1.0.0" },
    shop: desk,
    person: person,
    acc: acc,
    status: "succeeded",
    action: "install"
  });
  ok(fresh.eventType === "pack.installed", "fresh eventType pack.installed");
  ok(fresh.installMode === "fresh", "fresh installMode");
  ok(fresh.status === "succeeded" && /^\d{4}-\d{2}-\d{2}T/.test(fresh.timestamp), "fresh timestamp ISO");
  ok(fresh.scope && fresh.scope.deskId === DESK, "fresh scope desk");
  ok(fresh.actor && fresh.actor.accountId === ACC, "fresh actor account");

  const upgraded = ih.normalizeEntry({
    pack: { id: "home", name: "Home", version: "2.0.0" },
    previousModuleId: "home",
    previousVersion: "1.0.0",
    shop: desk,
    person: person,
    acc: acc,
    status: "succeeded",
    action: "install"
  });
  ok(upgraded.eventType === "pack.upgraded", "upgrade eventType");
  ok(upgraded.previousVersion === "1.0.0" && upgraded.version === "2.0.0", "upgrade versions");

  const noop = ih.normalizeEntry({
    pack: { id: "home", name: "Home", version: "1.0.0" },
    previousModuleId: "home",
    previousVersion: "1.0.0",
    already: true,
    shop: desk,
    person: person,
    status: "succeeded"
  });
  ok(noop.installMode === "noop", "noop installMode on same version");

  const retry = ih.normalizeEntry({
    pack: { id: "home", name: "Home", version: "1.0.0" },
    previousModuleId: "home",
    previousVersion: "1.0.0",
    already: true,
    retry: true,
    shop: desk,
    person: person,
    status: "succeeded"
  });
  ok(retry.installMode === "retry", "retry installMode");

  const failedShape = ih.normalizeEntry({
    pack: { id: "home", name: "Home", version: "1.0.0" },
    shop: desk,
    person: person,
    status: "failed",
    error: "State did not save."
  });
  ok(failedShape.status === "failed" && /did not save/.test(failedShape.error || ""), "failed entry shape");

  const addon = ih.normalizeEntry({
    pack: { id: "price", name: "Price add-on", type: "addon", version: "1" },
    moduleType: "addon",
    shop: desk,
    person: person,
    status: "succeeded"
  });
  ok(addon.eventType === "addon.installed" && addon.moduleType === "addon", "addon.installed");

  // Compaction keeps HISTORY_MAX
  for (let i = 0; i < ih.HISTORY_MAX + 25; i++) {
    ih.recordInstallEvent({
      pack: { id: "home", name: "Home", version: "1.0.0" },
      shop: desk,
      person: person,
      acc: acc,
      status: "succeeded",
      already: true,
      installMode: "noop"
    });
  }
  ok(lib.mem.installHistory.length === ih.HISTORY_MAX, "compaction caps at HISTORY_MAX (" + lib.mem.installHistory.length + ")");
  lib.mem.installHistory = [];
  acc.history = [];

  // Integration: fresh install-pack
  const install1 = await call(packs, "POST", hdr, { action: "install-pack", id: "home" });
  ok(install1.statusCode === 200 && install1.body && install1.body.ok === true, "fresh install-pack ok");
  ok(install1.body.history && install1.body.history.eventType === "pack.installed", "fresh returns pack.installed");
  ok(install1.body.history.installMode === "fresh", "fresh installMode in reply");
  ok(install1.body.history.status === "succeeded", "fresh succeeded after save");
  ok(desk.pack === "home", "desk pack set");
  ok(Array.isArray(lib.mem.installHistory) && lib.mem.installHistory[0] && lib.mem.installHistory[0].id === install1.body.history.id, "entry stored in mem.installHistory");

  // Persist round-trip includes installHistory
  const payload = JSON.parse(JSON.stringify(lib.mem));
  ok(Array.isArray(payload.installHistory) && payload.installHistory.length >= 1, "payload carries installHistory");

  // Noop / idempotent reinstall same pack
  const install2 = await call(packs, "POST", hdr, { action: "install-pack", id: "home" });
  ok(install2.statusCode === 200 && install2.body && install2.body.already === true, "reinstall already true");
  ok(install2.body.history && install2.body.history.installMode === "noop", "reinstall noop mode");
  ok(install2.body.history.eventType === "pack.installed", "noop still pack.installed");

  // Explicit retry
  const install3 = await call(packs, "POST", hdr, { action: "install-pack", id: "home", retry: true });
  ok(install3.statusCode === 200 && install3.body.history && install3.body.history.installMode === "retry", "retry installMode");

  // Upgrade when version changes on desk
  desk.packVersion = "1.0.0";
  const homePack = packs.findPack("home");
  const oldVersion = homePack.version;
  homePack.version = "9.9.9";
  const upgrade = await call(packs, "POST", hdr, { action: "install-pack", id: "home" });
  ok(upgrade.statusCode === 200 && upgrade.body.history && upgrade.body.history.eventType === "pack.upgraded", "upgrade eventType");
  ok(upgrade.body.history.previousVersion === "1.0.0" && upgrade.body.history.version === "9.9.9", "upgrade versions in reply");
  if (oldVersion != null) homePack.version = oldVersion;
  else delete homePack.version;

  // Failed install: save returns false → no phantom success
  const realSave = lib.save;
  let blocked = 0;
  lib.save = async function () { blocked += 1; return false; };
  desk.pack = "";
  delete desk.packVersion;
  const beforeFail = (lib.mem.installHistory || []).length;
  const failInstall = await call(packs, "POST", hdr, { action: "install-pack", id: "consign" });
  lib.save = realSave;
  ok(failInstall.statusCode === 503 && failInstall.body && failInstall.body.ok === false, "failed save returns 503");
  ok(failInstall.body.history && failInstall.body.history.status === "failed", "failed history status");
  ok(desk.pack !== "consign" && !desk.pack, "failed save reverts desk pack");
  ok((lib.mem.installHistory || []).length >= beforeFail + 1, "failed entry retained in mem");
  ok(!(lib.mem.installHistory || []).some((e) => e && e.moduleId === "consign" && e.status === "succeeded"), "no phantom consign success");

  // remove-pack
  desk.pack = "home";
  desk.packName = "Home & family";
  desk.packVersion = "1.0.0";
  const removed = await call(packs, "POST", hdr, { action: "remove-pack", id: "home" });
  ok(removed.statusCode === 200 && removed.body && removed.body.ok === true, "remove-pack ok");
  ok(removed.body.history && removed.body.history.eventType === "pack.removed", "pack.removed event");
  ok(!desk.pack, "desk pack cleared");

  // addon via moduleType on install-aia
  const addonInstall = await call(packs, "POST", hdr, {
    action: "install-aia",
    filename: "price.aia",
    pack: { name: "Price add-on", aia: "price.aia", id: "price-addon", does: "Draft price. Collect HOLD.", moduleType: "addon", version: "1.2.0", rules: [] }
  });
  ok(addonInstall.statusCode === 200 && addonInstall.body && addonInstall.body.ok === true, "addon install-aia ok");
  ok(addonInstall.body.history && addonInstall.body.history.moduleType === "addon", "addon moduleType");
  ok(addonInstall.body.history.eventType === "addon.installed", "addon.installed event");

  // History feed includes install rows
  const hist = require(path.join(root, "api/_history")).historyOf(desk, [], [], {});
  ok(hist.items.some((it) => it && it.kind === "install"), "historyOf includes install items");

  // install-history action
  const listed = await call(packs, "POST", hdr, { action: "install-history" });
  ok(listed.statusCode === 200 && Array.isArray(listed.body.history) && listed.body.history.length >= 1, "install-history lists rows");
  ok(listed.body.history[0].actor && listed.body.history[0].actor.accountId === ACC, "owner install-history keeps accountId");

  // Helper cannot read accountId / seatOverride on install-history
  const helper = {
    id: "p_hel_hist", name: "Hel", role: "employee", kind: "helper",
    status: "approved", pin: pin("5555"), accountId: "acct_hel_hist", email: "", createdAt: now
  };
  desk.people.push(helper);
  const helListed = await call(packs, "POST", { "x-workspace": DESK, "x-pin": "5555" }, { action: "install-history" });
  ok(helListed.statusCode === 200 && Array.isArray(helListed.body.history), "helper can read install-history");
  const helActor = (helListed.body.history[0] && helListed.body.history[0].actor) || {};
  ok(!helActor.accountId && !helActor.seatId && !helActor.permission && helActor.seatOverride == null, "helper actor is display-only");

  // rollback must not mutate OFFICIAL catalog version
  const homeBefore = packs.findPack("home");
  const homeVerBefore = homeBefore && homeBefore.version;
  desk.pack = "home";
  desk.packVersion = "9.9.9";
  lib.mem.installHistory.unshift(ih.normalizeEntry({
    pack: { id: "home", name: "Home", version: "1.0.0" },
    shop: desk,
    person: person,
    acc: acc,
    status: "succeeded",
    action: "install"
  }));
  const rolled = await call(packs, "POST", hdr, { action: "rollback-pack", id: "home", version: "1.0.0", pack: "home" });
  ok(rolled.statusCode === 200 && rolled.body && rolled.body.ok === true, "rollback-pack with string pack id ok");
  const homeAfter = packs.findPack("home");
  ok((homeAfter && homeAfter.version) === homeVerBefore, "rollback does not poison OFFICIAL pack.version");

  // Static wiring asserts
  const packsSrc = fs.readFileSync(path.join(root, "api/_packs.js"), "utf8");
  ok(packsSrc.indexOf("finishPackInstall") >= 0 && packsSrc.indexOf("remove-pack") >= 0, "packs wiring");
  const libSrc = fs.readFileSync(path.join(root, "api/_lib.js"), "utf8");
  ok(libSrc.indexOf("installHistory") >= 0, "lib persists installHistory");
  const freeze = fs.readFileSync(path.join(root, "scripts/_api-freeze.js"), "utf8");
  ok(freeze.indexOf("api/_install-history.js") >= 0, "api freeze pins install-history");

  console.log("check-install-history: " + asserts + " asserts, " + failed + " failed");
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
