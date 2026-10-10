#!/usr/bin/env node
const fs = require("fs");
const os = require("os");
const path = require("path");

const store = path.join(os.tmpdir(), "aia-pack-install-cap-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;

delete global.__aia;
delete global.__aiaHydrate;

const root = path.join(__dirname, "..");
let failed = 0;
function fail(m) { failed += 1; console.error("FAIL " + m); }
function pass(m) { console.log("ok   " + m); }

const ais = require("../api/_ais");
const packHandler = require("../api/_packs");
const { mem, hashPin, ensurePeople, ready, save } = require("../api/_lib");

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

function deskAiSeats(desk) {
  return (desk.people || []).filter(function (p) { return p && p.deskAi; });
}
function orphanSeats(desk) {
  const names = {};
  const ids = {};
  (desk.ais || []).forEach(function (a) {
    if (!a) return;
    names[String(a.name || "").toLowerCase()] = true;
    if (a.id) ids[String(a.id)] = true;
  });
  return deskAiSeats(desk).filter(function (p) {
    const byName = names[String(p.name || "").toLowerCase()];
    const byId = p.aiId && ids[String(p.aiId)];
    return !byName && !byId;
  });
}
function namesOf(desk) {
  return (desk.ais || []).map(function (a) { return a && a.name; });
}
async function openDesk(slug) {
  const desk = {
    slug: slug,
    name: slug,
    biz: slug,
    pin: hashPin("4821"),
    createdAt: new Date().toISOString(),
    people: [],
    rules: []
  };
  ensurePeople(desk);
  mem.workspaces.unshift(desk);
  return { desk: desk, headers: { "x-workspace": slug, "x-pin": "4821" } };
}
async function saveNamed(headers, name, does) {
  return call(packHandler, "POST", headers, { action: "save-ai", name: name, does: does || "Drafts this desk", role: "Doer" });
}
async function fill(headers, n, prefix, does) {
  const saved = [];
  for (let i = 1; i <= n; i += 1) {
    const name = prefix + " " + i;
    const res = await saveNamed(headers, name, does);
    saved.push(res);
  }
  return saved;
}
function rows(names, does) {
  return names.map(function (name) { return { name: name, does: does || "Drafts from this pack" }; });
}
async function installAia(headers, action, file, aiRows) {
  return call(packHandler, "POST", headers, {
    action: action || "install-aia",
    filename: file,
    pack: { name: file.replace(/\.aia$/i, ""), aia: file, does: "Draft. Collect HOLD.", ais: aiRows }
  });
}
function holdOk(res) {
  return res && res.body && res.body.charged === false && res.body.collectHold && res.body.collectHold.hold === true;
}
function successClaim(note) {
  return /Named AIs attached|Named AIs attach|bound here|land on this desk|\d+ desk AIs attached/i.test(note || "");
}

async function main() {
  await ready();

  const capped = ais.normalizeAis([
    { name: "One" },
    { name: "Two" },
    { name: "Three" },
    { name: "Four" }
  ], "limit-desk");
  if (capped.length !== 3 || capped.map(function (a) { return a.name; }).join("|") !== "One|Two|Three") {
    fail("normalizeAis must keep the first 3, got " + JSON.stringify(capped.map(function (a) { return a.name; })));
  } else pass("3-AI pack limit still keeps the first 3");

  const all = await openDesk("cap-all");
  const allInstall = await installAia(all.headers, "install-aia", "all-lane.aia", rows(["All A", "All B"]));
  if (allInstall.statusCode !== 200 || !allInstall.body.ok || JSON.stringify(allInstall.body.notFitted) !== "[]") {
    fail("all fit " + allInstall.statusCode + " " + JSON.stringify(allInstall.body));
  } else if (namesOf(all.desk).join("|") !== "All A|All B" || deskAiSeats(all.desk).length !== 2 || orphanSeats(all.desk).length) {
    fail("all fit must store both AIs with seats");
  } else if ((allInstall.body.note || "").indexOf("Named AIs attached.") < 0 || /didn't fit|desk AIs attached/i.test(allInstall.body.note || "")) {
    fail("all fit must keep Named AIs attached " + allInstall.body.note);
  } else if ((allInstall.body.note || "").indexOf("Collect stays HOLD") < 0 || !holdOk(allInstall.body && allInstall)) {
    fail("all fit must keep Collect HOLD");
  } else pass("all fit keeps the pack sentence");

  const some = await openDesk("cap-some");
  const someSaved = await fill(some.headers, 4, "Desk");
  const beforeSome = deskAiSeats(some.desk).length;
  const someInstall = await installAia(some.headers, "install-aia", "some-lane.aia", rows(["Pack A", "Pack B", "Pack C"]));
  const someNames = namesOf(some.desk);
  const someSeats = deskAiSeats(some.desk);
  const someClause = "2 of 3 Desk AIs attached: Pack A, Pack B. This desk already has 6 Desk AIs. These didn't fit: Pack C.";
  if (someSaved.some(function (r) { return r.statusCode !== 200 || !r.body.ok; }) || someInstall.statusCode !== 200 || !someInstall.body.ok) {
    fail("some fit " + someInstall.statusCode + " " + JSON.stringify(someInstall.body));
  } else if (JSON.stringify(someInstall.body.notFitted) !== JSON.stringify(["Pack C"])) {
    fail("some fit notFitted " + JSON.stringify(someInstall.body.notFitted));
  } else if (someNames.length !== 6 || someNames.indexOf("Pack A") < 0 || someNames.indexOf("Pack B") < 0 || someNames.indexOf("Pack C") >= 0) {
    fail("some fit stored " + JSON.stringify(someNames));
  } else if (someSeats.length !== beforeSome + 2 || orphanSeats(some.desk).length || someSeats.some(function (p) { return p.name === "Pack C"; })) {
    fail("some fit seats " + JSON.stringify(someSeats.map(function (p) { return p.name; })));
  } else if ((someInstall.body.note || "").indexOf(someClause) < 0) {
    fail("some fit note " + someInstall.body.note);
  } else if (/Named AIs attached|6 desk AIs attached|5 desk AIs attached|4 desk AIs attached/i.test(someInstall.body.note || "")) {
    fail("some fit counted the desk " + someInstall.body.note);
  } else if ((someInstall.body.note || "").indexOf("Collect stays HOLD") < 0 || !holdOk(someInstall)) {
    fail("some fit must keep Collect HOLD");
  } else pass("some fit counts this pack and leaves no orphan seats");

  const none = await openDesk("cap-none");
  const noneSaved = await fill(none.headers, 6, "Full");
  const beforeNone = deskAiSeats(none.desk).length;
  const noneNames = namesOf(none.desk).join("|");
  const noneInstall = await installAia(none.headers, "install-aia", "none-lane.aia", rows(["None A", "None B", "None C"]));
  const noneClause = "No Desk AIs from this pack were attached. This desk already has 6 Desk AIs. These didn't fit: None A, None B, None C.";
  if (noneSaved.some(function (r) { return r.statusCode !== 200 || !r.body.ok; }) || noneInstall.statusCode !== 200 || !noneInstall.body.ok) {
    fail("none fit " + noneInstall.statusCode + " " + JSON.stringify(noneInstall.body));
  } else if (JSON.stringify(noneInstall.body.notFitted) !== JSON.stringify(["None A", "None B", "None C"])) {
    fail("none fit notFitted " + JSON.stringify(noneInstall.body.notFitted));
  } else if (namesOf(none.desk).join("|") !== noneNames || deskAiSeats(none.desk).length !== beforeNone || orphanSeats(none.desk).length) {
    fail("none fit must not add AIs or seats");
  } else if ((noneInstall.body.note || "").indexOf(noneClause) < 0 || successClaim(noneInstall.body.note)) {
    fail("none fit note " + noneInstall.body.note);
  } else if ((noneInstall.body.note || "").indexOf("Collect stays HOLD") < 0 || !holdOk(noneInstall)) {
    fail("none fit must keep Collect HOLD");
  } else pass("none fit drops attached, bound, and land wording");

  const dup = await openDesk("cap-dup");
  const dupInstall = await installAia(dup.headers, "install-aia", "dup-lane.aia", rows(["Dup", "Other", "Dup"]));
  const dupSeats = deskAiSeats(dup.desk);
  if (dupInstall.statusCode !== 200 || !dupInstall.body.ok) {
    fail("duplicate install " + JSON.stringify(dupInstall.body));
  } else if (JSON.stringify(dupInstall.body.notFitted) !== JSON.stringify(["Dup"])) {
    fail("duplicate notFitted " + JSON.stringify(dupInstall.body.notFitted));
  } else if (namesOf(dup.desk).join("|") !== "Dup|Other" || dupSeats.length !== 2 || dupSeats.filter(function (p) { return p.name === "Dup"; }).length !== 1 || orphanSeats(dup.desk).length) {
    fail("duplicate must store one seat " + JSON.stringify(namesOf(dup.desk)) + " " + JSON.stringify(dupSeats.map(function (p) { return p.name; })));
  } else if ((dupInstall.body.note || "").indexOf("2 of 3 Desk AIs attached: Dup, Other. These didn't fit: Dup.") < 0) {
    fail("duplicate note " + dupInstall.body.note);
  } else if (/already has 6 Desk AIs/.test(dupInstall.body.note || "")) {
    fail("duplicate on an open desk must not claim 6 " + dupInstall.body.note);
  } else pass("duplicate names are listed in notFitted in pack order");

  const mixed = await openDesk("cap-mixed");
  const mixedSaved = await fill(mixed.headers, 5, "Mixed");
  const mixedInstall = await installAia(mixed.headers, "install-aia", "mixed-lane.aia", rows(["New A", "New A", "New B"]));
  if (mixedSaved.some(function (r) { return r.statusCode !== 200 || !r.body.ok; }) || mixedInstall.statusCode !== 200 || !mixedInstall.body.ok) {
    fail("mixed duplicate " + JSON.stringify(mixedInstall.body));
  } else if (JSON.stringify(mixedInstall.body.notFitted) !== JSON.stringify(["New A", "New B"])) {
    fail("mixed notFitted " + JSON.stringify(mixedInstall.body.notFitted));
  } else if ((mixedInstall.body.note || "").indexOf("1 of 3 Desk AIs attached: New A. This desk already has 6 Desk AIs. These didn't fit: New A, New B.") < 0) {
    fail("mixed note " + mixedInstall.body.note);
  } else if (deskAiSeats(mixed.desk).filter(function (p) { return p.name === "New A"; }).length !== 1 || namesOf(mixed.desk).indexOf("New B") >= 0 || orphanSeats(mixed.desk).length) {
    fail("mixed seats");
  } else pass("cap misses and duplicates share notFitted in pack order");

  const keep = await openDesk("cap-keep");
  const keepNames = ["Keep 1", "Keep 2", "Keep 3", "Keep 4", "Keep 5", "Keep 6"];
  let keepOk = true;
  for (let i = 0; i < keepNames.length; i += 1) {
    const saved = await saveNamed(keep.headers, keepNames[i], "OLD-DOES");
    if (saved.statusCode !== 200 || !saved.body.ok) keepOk = false;
  }
  const beforeKeep = deskAiSeats(keep.desk).length;
  const keepInstall = await installAia(keep.headers, "install-aia", "keep-lane.aia", rows(["Keep 1", "Keep 2", "Keep 3"], "UPDATED-DOES"));
  const keepDoes = {};
  (keep.desk.ais || []).forEach(function (a) { if (a) keepDoes[a.name] = a.does; });
  if (!keepOk || keepInstall.statusCode !== 200 || !keepInstall.body.ok) {
    fail("update install " + JSON.stringify(keepInstall.body));
  } else if (JSON.stringify(keepInstall.body.notFitted) !== "[]") {
    fail("updates must fit " + JSON.stringify(keepInstall.body.notFitted));
  } else if (keepDoes["Keep 1"] !== "UPDATED-DOES" || keepDoes["Keep 2"] !== "UPDATED-DOES" || keepDoes["Keep 3"] !== "UPDATED-DOES") {
    fail("packed updates did not land " + JSON.stringify(keepDoes));
  } else if (keepDoes["Keep 4"] !== "OLD-DOES" || keepDoes["Keep 6"] !== "OLD-DOES") {
    fail("AIs outside the pack must stay " + JSON.stringify(keepDoes));
  } else if (deskAiSeats(keep.desk).length !== beforeKeep || orphanSeats(keep.desk).length) {
    fail("update install added a seat");
  } else if ((keepInstall.body.note || "").indexOf("Named AIs attached.") < 0 || /didn't fit/.test(keepInstall.body.note || "")) {
    fail("update note " + keepInstall.body.note);
  } else if (!holdOk(keepInstall)) {
    fail("update install must stay Collect HOLD");
  } else pass("updates on a full desk fit inside the 3-AI pack");

  const limit = await openDesk("cap-limit");
  const limitInstall = await installAia(limit.headers, "install-aia", "limit-lane.aia", rows(["One", "Two", "Three", "Four"]));
  const stored = (mem.packs || []).find(function (p) { return p && p.aia === "limit-lane.aia" && p.workspace === "cap-limit"; });
  const storedNames = stored && (stored.ais || []).map(function (a) { return a.name; });
  const publicNames = ((limitInstall.body && limitInstall.body.pack && limitInstall.body.pack.aiRows) || []).map(function (a) { return a.name; });
  if (limitInstall.statusCode !== 200 || !limitInstall.body.ok) {
    fail("pack limit install " + JSON.stringify(limitInstall.body));
  } else if (JSON.stringify(limitInstall.body.notFitted) !== "[]") {
    fail("fourth AI is outside the pack window " + JSON.stringify(limitInstall.body.notFitted));
  } else if (namesOf(limit.desk).join("|") !== "One|Two|Three" || namesOf(limit.desk).indexOf("Four") >= 0) {
    fail("desk stored " + JSON.stringify(namesOf(limit.desk)));
  } else if (!stored || storedNames.length !== 3 || storedNames.join("|") !== "One|Two|Three" || (stored.bots || []).length !== 3) {
    fail("stored pack must keep 3 AIs " + JSON.stringify(storedNames));
  } else if (publicNames.join("|") !== "One|Two|Three") {
    fail("public pack face " + JSON.stringify(publicNames));
  } else if (deskAiSeats(limit.desk).length !== 3 || orphanSeats(limit.desk).length) {
    fail("pack limit seats");
  } else pass("stored packs still keep at most 3 AIs");

  const maker = await openDesk("cap-maker");
  const published = await call(packHandler, "POST", maker.headers, {
    action: "publish-pack",
    name: "Lane pack",
    aia: "lane-pack.aia",
    does: "Draft. Collect HOLD.",
    ais: rows(["Lane One", "Lane Two"])
  });
  if (published.statusCode !== 200 || !published.body.ok || !published.body.pack) {
    fail("publish " + JSON.stringify(published.body));
  } else if ((published.body.note || "").indexOf("Pack JSON and desk AIs land on this desk.") < 0) {
    fail("all-fit publish must keep the land sentence " + published.body.note);
  } else pass("all-fit publish keeps the existing sentence");

  const counter = await openDesk("cap-counter");
  const counterSaved = await fill(counter.headers, 4, "Count");
  const used = await call(packHandler, "POST", counter.headers, { action: "install-pack", id: published.body.pack.id });
  if (counterSaved.some(function (r) { return r.statusCode !== 200 || !r.body.ok; }) || used.statusCode !== 200 || !used.body.ok) {
    fail("install-pack count " + used.statusCode + " " + JSON.stringify(used.body));
  } else if (JSON.stringify(used.body.notFitted) !== "[]" || namesOf(counter.desk).length !== 6) {
    fail("install-pack should add the pack's two AIs " + JSON.stringify(namesOf(counter.desk)) + " " + JSON.stringify(used.body.notFitted));
  } else if ((used.body.note || "").indexOf("2 desk AIs attached.") < 0 || /[456] desk AIs attached/.test(used.body.note || "")) {
    fail("install-pack counted the desk " + used.body.note);
  } else if (!holdOk(used) || (used.body.note || "").indexOf(used.body.collectHold.note) < 0) {
    fail("install-pack must keep the Collect note");
  } else pass("install-pack counts this pack, not the desk");

  const buyer = await openDesk("cap-buyer");
  await fill(buyer.headers, 3, "Buy");
  const bought = await call(packHandler, "POST", buyer.headers, { action: "buy-pack", id: published.body.pack.id });
  if (bought.statusCode !== 200 || !bought.body.ok || (bought.body.note || "").indexOf("2 desk AIs attached.") < 0 || /5 desk AIs attached/.test(bought.body.note || "")) {
    fail("buy-pack count " + (bought.body && bought.body.note));
  } else pass("buy-pack counts this pack, not the desk");

  const fullPrivate = await openDesk("cap-private");
  await fill(fullPrivate.headers, 6, "Priv");
  const priv = await call(packHandler, "POST", fullPrivate.headers, {
    action: "private-pack",
    name: "Private full",
    aia: "private-full.aia",
    does: "Draft.",
    visibility: "private",
    ais: rows(["Skip A", "Skip B", "Skip C"])
  });
  if (priv.statusCode !== 200 || !priv.body.ok || successClaim(priv.body.note) || (priv.body.note || "").indexOf("No Desk AIs from this pack were attached. This desk already has 6 Desk AIs. These didn't fit: Skip A, Skip B, Skip C.") < 0) {
    fail("private none " + (priv.body && priv.body.note) + " " + JSON.stringify(priv.body && priv.body.notFitted));
  } else if ((priv.body.note || "").indexOf("Private on this desk.") < 0 || (priv.body.note || "").indexOf("Yes / Stop / Kill stay human.") < 0 || !holdOk(priv)) {
    fail("private none dropped a non-AI line " + priv.body.note);
  } else pass("private-pack none fit drops bound here");

  const fullPublish = await openDesk("cap-pub");
  await fill(fullPublish.headers, 6, "Pub");
  const pub = await call(packHandler, "POST", fullPublish.headers, {
    action: "publish-pack",
    name: "Publish full",
    aia: "publish-full.aia",
    does: "Draft.",
    ask: 1,
    ais: rows(["Miss A", "Miss B"])
  });
  if (pub.statusCode !== 200 || !pub.body.ok || successClaim(pub.body.note) || (pub.body.note || "").indexOf("No Desk AIs from this pack were attached. This desk already has 6 Desk AIs. These didn't fit: Miss A, Miss B.") < 0) {
    fail("publish none " + (pub.body && pub.body.note));
  } else if ((pub.body.note || "").indexOf("Collect stays HOLD until Yes and a money pipe.") < 0 || (pub.body.note || "").indexOf("World desks can Buy / install.") < 0) {
    fail("publish none dropped Collect " + pub.body.note);
  } else pass("publish-pack none fit drops land on this desk");

  const fullSubmit = await openDesk("cap-submit");
  await fill(fullSubmit.headers, 6, "Sub");
  const submitted = await call(packHandler, "POST", fullSubmit.headers, {
    action: "submit-pack",
    name: "Submit full",
    aia: "submit-full.aia",
    does: "Draft.",
    ais: rows(["Sub A"])
  });
  if (submitted.statusCode !== 200 || !submitted.body.ok || /land on this desk|bound here|Named AIs attached/i.test(submitted.body.note || "") || (submitted.body.note || "").indexOf("These didn't fit: Sub A.") < 0) {
    fail("submit none " + (submitted.body && submitted.body.note));
  } else pass("submit-pack none fit names the AI that did not fit");

  const fullList = await openDesk("cap-list");
  await fill(fullList.headers, 6, "List");
  const listed = await call(packHandler, "POST", fullList.headers, {
    action: "list-pack",
    name: "List full",
    aia: "list-full.aia",
    does: "Draft.",
    status: "listed",
    ais: rows(["List A"])
  });
  if (listed.statusCode !== 200 || !listed.body.ok || /land on this desk/i.test(listed.body.note || "") || (listed.body.note || "").indexOf("These didn't fit: List A.") < 0) {
    fail("list none " + (listed.body && listed.body.note));
  } else pass("list-pack none fit names the AI that did not fit");

  const fullTest = await openDesk("cap-test");
  await fill(fullTest.headers, 6, "Test");
  const tested = await call(packHandler, "POST", fullTest.headers, {
    action: "test-pack",
    name: "Test full",
    aia: "test-full.aia",
    does: "Draft.",
    ais: rows(["Test A"])
  });
  if (tested.statusCode !== 200 || !tested.body.ok || /Named AIs attach|bound here|land on this desk/i.test(tested.body.note || "") || (tested.body.note || "").indexOf("Open Drop or Queue.") < 0 || (tested.body.note || "").indexOf("These didn't fit: Test A.") < 0) {
    fail("test-pack none " + (tested.body && tested.body.note));
  } else pass("test-pack none fit keeps the non-AI lines");

  const imported = await openDesk("cap-import");
  const importRes = await installAia(imported.headers, "import-pack", "import-lane.aia", rows(["Import A"]));
  if (importRes.statusCode !== 200 || !importRes.body.ok || (importRes.body.note || "").indexOf("Named AIs attached.") < 0 || JSON.stringify(importRes.body.notFitted) !== "[]") {
    fail("import-pack all fit " + (importRes.body && importRes.body.note));
  } else pass("import-pack all fit keeps Named AIs attached");

  const filed = await openDesk("cap-file");
  await fill(filed.headers, 6, "File");
  const fileRes = await installAia(filed.headers, "install-file", "file-lane.aia", rows(["File A", "File B"]));
  if (fileRes.statusCode !== 200 || !fileRes.body.ok || successClaim(fileRes.body.note) || (fileRes.body.note || "").indexOf("These didn't fit: File A, File B.") < 0) {
    fail("install-file none " + (fileRes.body && fileRes.body.note));
  } else pass("install-file none fit drops the attached sentence");

  const again = await openDesk("cap-again");
  await fill(again.headers, 3, "Again");
  const firstUse = await call(packHandler, "POST", again.headers, { action: "use-pack", id: published.body.pack.id });
  const secondUse = await call(packHandler, "POST", again.headers, { action: "use-pack", id: published.body.pack.id });
  if (firstUse.statusCode !== 200 || secondUse.statusCode !== 200 || !secondUse.body.already) {
    fail("use-pack again " + JSON.stringify(secondUse.body));
  } else if (/desk AIs attached/i.test(secondUse.body.note || "") || (secondUse.body.note || "").indexOf("Already on this desk.") < 0) {
    fail("second use changed the already note " + secondUse.body.note);
  } else pass("use-pack that already fits keeps the existing note");

  await save();
  try { if (fs.existsSync(store)) fs.unlinkSync(store); } catch (e) {}
  if (failed) {
    console.error(failed + " failed");
    process.exit(1);
  }
  console.log("check-pack-install-cap ok");
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
