#!/usr/bin/env node
require("./_env-guard");
const fs = require("fs");
const os = require("os");
const path = require("path");

const store = path.join(os.tmpdir(), "aia-implement-check-" + Date.now() + ".json");
process.env.AIA_STORE_PATH = store;

const root = path.join(__dirname, "..");
let failed = 0;
function fail(m) { failed += 1; console.error("FAIL " + m); }
function pass(m) { console.log("ok   " + m); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const file = path.join(root, "packs", "aia-implement.json");
if (!fs.existsSync(file)) {
  fail("missing packs/aia-implement.json");
  process.exit(1);
}
const raw = fs.readFileSync(file, "utf8");
let pack;
try { pack = JSON.parse(raw); } catch (e) {
  fail("aia-implement.json is not JSON");
  process.exit(1);
}

if (pack.id !== "aia-implement") fail("id must be aia-implement"); else pass("id aia-implement");
if (pack.name !== "Four steps on this desk") fail("name Four steps on this desk"); else pass("name");
if (pack.family !== "Automate It Away") fail("family Automate It Away"); else pass("family");

["capture", "qualify", "do", "collect", "follow", "taps", "kill", "pipes", "artifacts"].forEach(function (k) {
  if (!Array.isArray(pack[k]) || !pack[k].length) fail("missing Packer key " + k);
  else pass("packer " + k);
});

["Find the leaks", "Hook the pipes", "Name a desk AI", "You still tap"].forEach(function (bit) {
  if (!JSON.stringify(pack).includes(bit)) fail("pack missing " + bit);
  else pass("pack " + bit);
});

if (!Array.isArray(pack.rules) || pack.rules.length) fail("rules stay empty — path lives in rails/help");
else pass("empty rules");

if (/\$250|over \$250|placeholder=.?250/i.test(raw)) fail("no fake $250");
else pass("no $250");
if (/seed money|demo seed|Labeled DEMO/i.test(raw)) fail("no demo seed money");
else pass("no demo seed");
if (/White House|Action Plan|executive order/i.test(raw)) fail("must not reprint policy");
else pass("desk language, not a reprint");
if (/on-chain|blockchain|nft|wallet owned|minted/i.test(raw) && !/No fake on-chain/.test(raw)) fail("no fake on-chain");
else pass("no fake on-chain claim");

const pipes = (pack.pipes || []).map(function (p) { return String(p).toLowerCase(); });
if (pipes.indexOf("ebay") >= 0 || pipes.indexOf("mail") >= 0 || pipes.indexOf("gmail") >= 0) fail("no live eBay/mail pipes");
else pass("pipes webhook-only");
if (pipes.indexOf("webhook") < 0) fail("webhook pipe required");
else pass("webhook pipe");
if (!/Collect stays HOLD/.test(raw)) fail("Collect HOLD");
else pass("Collect HOLD");

const never = (pack.queue && pack.queue.never) || [];
["send", "stop", "pay"].forEach(function (w) {
  if (never.indexOf(w) < 0) fail("queue.never missing " + w);
  else pass("never " + w);
});

["leak", "pipe", "agent", "guard"].forEach(function (k) {
  if ((pack.kinds || []).indexOf(k) < 0) fail("kind " + k);
  else pass("kind " + k);
});

const playbook = read("desk-playbook.js");
["Find the leaks", "Hook up connections", "Name a desk AI", "You still tap"].forEach(function (bit) {
  if (!playbook.includes(bit)) fail("desk-playbook.js missing " + bit);
  else pass("playbook " + bit);
});
if (!playbook.includes('href: "/drop"') || !playbook.includes('href: "/pipes"')) fail("playbook missing Drop/Pipes links");
else pass("playbook Drop + Pipes");
if (!playbook.includes("/create?kind=ai") || !playbook.includes("/studio")) fail("playbook missing Create/Studio AI links");
else pass("playbook Create + Studio");
if (playbook.includes('tag: "Agents"')) fail("playbook step 3 still says Agents");
else pass("playbook step 3 is Desk AI");
const peopleJs = read("people.js");
if (peopleJs.indexOf('if (k === "agent") return "Desk AI"') < 0) fail("people.js still paints agent seats as agent");
else pass("people.js labels agent seats Desk AI");
const themeJs = read("theme.js");
if (themeJs.indexOf('if (r === "agent") return "Agent"') >= 0) fail("theme.js who-chip still says Agent");
else pass("theme.js who-chip is not Agent");
if (themeJs.indexOf('if (r === "agent") return "Desk AI"') < 0) fail("theme.js who-chip must say Desk AI");
else pass("theme.js who-chip maps agent to Desk AI");
const handoff = read("desk-handoff.js");
if (handoff.indexOf("Hand to a person or an agent.") >= 0) fail("handoff still says an agent");
else pass("handoff does not say an agent");
if (handoff.indexOf("Hand to a person or a Desk AI.") < 0) fail("handoff must say Desk AI");
else pass("handoff names Desk AI");
const inbox = read("desk-inbox.js");
if (inbox.indexOf("Humans, agents, and connections") >= 0) fail("inbox still says Humans, agents");
else pass("inbox does not say Humans, agents");
if (inbox.indexOf("Humans, Desk AIs, and connections") < 0) fail("inbox must name Desk AIs");
else pass("inbox names Desk AIs");
const peopleDesk = read("people-desk.js");
if (peopleDesk.indexOf("human, agent, or pipe") >= 0) fail("people-desk Say still says agent");
else pass("people-desk Say does not say agent");
if (peopleDesk.indexOf("human, Desk AI, or pipe") < 0) fail("people-desk Say must name Desk AI");
else pass("people-desk Say names Desk AI");
if (peopleJs.indexOf('bits.push("agents")') >= 0) fail("people logicLine still says agents");
else pass("people logicLine does not say agents");
if (peopleJs.indexOf('bits.push("Desk AIs")') < 0) fail("people logicLine must say Desk AIs");
else pass("people logicLine names Desk AIs");
const helpSrc = read("help.html");
if (helpSrc.indexOf("Agents, bots, guardrails") >= 0) fail("help still says Agents, bots");
else pass("help Talk does not say Agents, bots");
if (!playbook.includes('tag: "Desk AI"')) fail("playbook must tag step 3 Desk AI");
else pass("playbook tags Desk AI");
if (playbook.includes("It categorizes, drafts, summarizes")) fail("playbook still uses MVP bot does");
else pass("playbook dropped MVP bot does");
if (playbook.includes("The desk asks")) fail("playbook Audit still says The desk asks");
else pass("playbook Audit does not say The desk asks");
if (!playbook.includes("A Desk AI drafts the card")) fail("playbook Audit must say A Desk AI drafts the card");
else pass("playbook Audit says A Desk AI drafts the card");
if (!playbook.includes('href: "/rules"')) fail("playbook missing Rules");
else pass("playbook Rules");
if (!playbook.includes("/desk")) fail("playbook missing Qualify/Queue");
else pass("playbook Qualify on Queue");
if (playbook.includes("$250")) fail("playbook invented $250");
else pass("playbook no $250");
if (!playbook.includes("ai.aia") || !/orange until DNS|DNS stays orange/i.test(playbook)) fail("playbook must name ai.aia as orange HOLD");
else pass("playbook ai.aia is orange HOLD");
if (!playbook.includes("www.ai.aia")) fail("playbook missing www.ai.aia door");
else pass("playbook names www.ai.aia");
if (/ai\.aia is live|DNS is live|www\.ai\.aia is live/i.test(playbook)) fail("must not claim ai.aia is live");
else pass("playbook does not claim ai.aia live");

const pages = {
  "help.html": read("help.html"),
  "how.html": read("how.html"),
  "onboard.html": read("onboard.html"),
  "developer.html": read("developer.html"),
  "developer.js": read("developer.js")
};
const zlib = require("zlib");
function decodeStudio(raw) {
  try { return zlib.gunzipSync(Buffer.from(String(raw).replace(/\s+/g, ""), "base64")).toString("utf8"); }
  catch (e) { return ""; }
}
const studioJs = pages["developer.js"];
const studio = decodeStudio(read("developer.z64.txt"));
if (studioJs.indexOf('fetch("/developer.z64.txt"') < 0 || studioJs.indexOf('DecompressionStream("gzip")') < 0) fail("Studio loader must unpack developer.z64.txt");
else pass("Studio loader unpacks the pack");
if (!studio || studio.indexOf("Creators Studio") < 0) fail("developer.z64.txt must decode as Creators Studio");
else pass("Studio pack decodes");
["help.html", "how.html", "onboard.html", "developer.html"].forEach(function (name) {
  if (!pages[name].includes("desk-playbook.js")) fail(name + " must load desk-playbook.js");
  else pass(name + " loads playbook");
  if (!/data-aia-playbook|AIAPlaybook/.test(pages[name]) && name !== "developer.html") fail(name + " must mount the playbook");
  else if (name !== "developer.html") pass(name + " mounts playbook");
});
if (!studio.includes("AIAPlaybook") || !studio.includes("Four steps on this desk")) {
  fail("Studio must paint the four steps");
} else pass("Studio paints four steps");
if (!studio.includes("aia-implement") || !studio.includes("Four steps pack")) fail("Studio missing aia-implement");
else pass("Studio links aia-implement");

["help.html", "how.html", "onboard.html"].forEach(function (name) {
  ["Find the leaks", "Hook the pipes", "Name a desk AI", "You still tap"].forEach(function (bit) {
    if (!pages[name].includes(bit) && !pages[name].includes("desk-playbook.js")) fail(name + " missing " + bit);
  });
  if (/White House|Action Plan/i.test(pages[name])) fail(name + " reprinted policy");
  else pass(name + " is desk language");
  // how.html is a public page in plain words: no .aia door, and no mint at all. In place of the
  // old "ai.aia is the door, not a mint lesson" pin, the lead must still say where desk AI names
  // live and where the live desk is, word for word, in the same four-steps lead.
  if (name === "how.html") {
    const lead = (pages[name].match(/<p class="lead">One AIA account\.[^<]*<\/p>/) || [""])[0];
    if (!lead) fail(name + " missing the One AIA account lead");
    else if (!lead.includes("Desk AI names stay on this desk.")) fail(name + " lead must say Desk AI names stay on this desk.");
    else pass(name + " lead says Desk AI names stay on this desk");
    if (!lead.includes("Live desk is automateitaway.com.")) fail(name + " lead must name the live desk");
    else pass(name + " lead names the live desk");
    if (/ai\.aia|not a mint lesson/i.test(pages[name])) fail(name + " must not teach the ai.aia door or mint lesson to strangers");
    else pass(name + " keeps the ai.aia door and mint lesson off the public page");
    if (/\bmint/i.test(pages[name])) fail(name + " must not teach mint");
    else pass(name + " does not teach mint");
    if (!pages[name].includes("SI · si.aia")) fail(name + " must name SI · si.aia");
    else pass(name + " names SI · si.aia");
    if (!pages[name].includes("A human still taps Yes.") || !pages[name].includes("A human owner unlocks those pauses.") || !pages[name].includes("It pauses before money, deletes, or messaging someone new.")) fail(name + " SI must stay Yes-gated");
    else pass(name + " SI stays Yes-gated");
    return;
  }
  if (!pages[name].includes("ai.aia")) fail(name + " missing ai.aia door");
  else pass(name + " names ai.aia");
  if (!pages[name].includes("not a mint lesson")) fail(name + " must not teach mint");
  else pass(name + " does not teach mint");
});
if (/implementation path/.test(pages["help.html"])) fail("help must not teach implementation path");
else pass("help drops implementation path");
if (!pages["developer.html"].includes("ai.aia")) fail("Studio missing ai.aia door");
else pass("Studio names ai.aia");

const catalog = read("api/_packs.js");
if (!catalog.includes("aia-implement")) fail("_packs.js catalog missing aia-implement");
else pass("catalog lists aia-implement");

const engineSrc = read("api/_engine.js");
if (!engineSrc.includes('"aia-implement":') && !engineSrc.includes('FACES["aia-implement"]')) fail("engine missing aia-implement face");
else pass("engine face source");
if (!engineSrc.includes('pack === "aia-implement"') && !engineSrc.includes('face.id === "aia-implement"')) fail("engine missing aia-implement brain/recs");
else pass("engine brain/recs");
if (/PACKS\s*=\s*\[[^\]]*aia-implement/.test(engineSrc.replace(/\s+/g, " "))) fail("PACKS must stay five engines");
else pass("PACKS stays five engines");

["create-desk.js", "pack-card.js", "drop-packs.js", "drop-pack.js", "drop-agent.js", "desk-queue-packs.js"].forEach(function (name) {
  const src = read(name);
  if (!src.includes("aia-implement")) fail(name + " missing aia-implement");
  else pass(name + " lists aia-implement");
});

const more = read("more.html");
if (!more.includes("Four steps") && !more.includes("desk-playbook.js")) fail("more.html missing four steps");
else pass("More shows the path");

const adoption = read("packs/aia-adoption.json");
if (!/Four steps|find the leaks/i.test(adoption)) fail("aia-adoption should point at the four steps");
else pass("adoption points at the path");

const engine = require("../api/_engine");
const face = engine.packFace("aia-implement");
if (!face || face.id !== "aia-implement" || face.family !== "Automate It Away") fail("engine face aia-implement");
else pass("engine face");
if (engine.PACKS.indexOf("aia-implement") >= 0) fail("aia-implement must not join PACKS engines");
else pass("not an engine");
if (engine.detectPack({ pack: "aia-implement", title: "Friday leak" }) !== "aia-implement") fail("stamped aia-implement must stay");
else pass("stamped pack stays");
const q = engine.qualifyJob({ pack: "aia-implement", title: "Oil-change lane", notes: "high volume low complexity" }, { slug: "path-desk", rules: [] });
if (q.pack !== "aia-implement") fail("qualify pack " + q.pack);
else if (/vita/i.test(JSON.stringify(q))) fail("Vita leaked");
else if (/\$250/.test(JSON.stringify(q))) fail("$250 leaked onto implement card");
else if (q.waitingOn === "owner" && /kid or school/i.test(q.next || q.why || "")) fail("empty desk inherited a pack example rule");
else pass("qualify implement card");
if (!/HOLD|tap|draft/i.test([q.draft, q.next].join(" "))) fail("implement draft should stay human-tap");
else pass("implement draft is human-tap");

function unique(rows) {
  const out = [];
  rows.forEach(function (row) { if (out.indexOf(row) < 0) out.push(row); });
  return out;
}
function fourStepsLead(how) {
  return (how.match(/<p class="lead">One AIA account\.[^<]*<\/p>/) || [""])[0];
}
function buildFaults(files) {
  const bad = [];
  const hasLoader = files.loader.indexOf('fetch("/developer.z64.txt"') >= 0 && files.loader.indexOf('DecompressionStream("gzip")') >= 0;
  if (!hasLoader || !files.pack || files.pack.indexOf("Creators Studio") < 0 || files.pack.indexOf("AIAPlaybook") < 0 || files.pack.indexOf("Four steps on this desk") < 0 || files.pack.indexOf("aia-implement") < 0 || files.pack.indexOf("Four steps pack") < 0) {
    bad.push("Studio four-steps copy gone");
  }
  const lead = fourStepsLead(files.how);
  if (!lead || !lead.includes("Desk AI names stay on this desk.") || !lead.includes("Live desk is automateitaway.com.")) {
    bad.push("how four-steps lead gone");
  }
  if (/ai\.aia|not a mint lesson/i.test(files.how) || /\bmint/i.test(files.how)) {
    bad.push("public how teaches ai.aia door or mint");
  }
  if (files.how.indexOf("SI · si.aia") < 0 || files.how.indexOf("A human still taps Yes.") < 0 || files.how.indexOf("A human owner unlocks those pauses.") < 0 || files.how.indexOf("It pauses before money, deletes, or messaging someone new.") < 0) {
    bad.push("SI Yes-gating gone");
  }
  if (files.how.indexOf("Payments are off for now.") < 0 || (files.packJson && files.packJson.indexOf("Collect stays HOLD") < 0) || /charged:\s*true/.test(files.pack) || /charged:\s*true/.test(files.packJson) || /action:\s*"payout"/.test(files.pack) || /action:\s*"payout"/.test(files.packJson)) {
    bad.push("charge without Yes");
  }
  return unique(bad);
}
function applyMutant(kind, files) {
  const next = { loader: files.loader, pack: files.pack, how: files.how, packJson: files.packJson };
  if (kind === "Studio four-steps copy gone") {
    next.pack = next.pack
      .replace(/AIAPlaybook/g, "GoneBook")
      .replace(/Four steps on this desk/g, "Skip the steps")
      .replace(/Four steps pack/g, "Skip pack")
      .replace(/aia-implement/g, "gone-implement");
  } else if (kind === "how four-steps lead gone") {
    next.how = next.how
      .replace(/Desk AI names stay on this desk\./g, "Names can leave this desk.")
      .replace(/Live desk is automateitaway.com\./g, "The live desk is somewhere else.");
  } else if (kind === "public how teaches ai.aia door or mint") {
    next.how = next.how.replace(/Desk AI names stay on this desk\./g, "ai.aia is the door, not a mint lesson. Desk AI names stay on this desk.");
  } else if (kind === "SI Yes-gating gone") {
    next.how = next.how
      .replace(/SI · si\.aia/g, "SI seat")
      .replace(/A human still taps Yes\./g, "It goes out on its own.")
      .replace(/A human owner unlocks those pauses\./g, "Pauses unlock themselves.")
      .replace(/It pauses before money, deletes, or messaging someone new\./g, "It can pay, delete, or message someone new.");
  } else if (kind === "charge without Yes") {
    next.how = next.how.replace(/Payments are off for now\./g, "It is charged now.");
    next.packJson = next.packJson.replace(/Collect stays HOLD/g, "Collect is open");
    next.pack = next.pack + "\ncharged: true\n{ action: \"payout\" }";
  }
  return next;
}

const files = { loader: studioJs, pack: studio, how: pages["how.html"], packJson: raw };
const live = buildFaults(files);
if (live.length) fail("implement behaviour drifted: " + live.join("; "));
else pass("Studio four-steps, how lead, SI Yes-gating, and no-charge still hold");

const mutants = [
  "Studio four-steps copy gone",
  "how four-steps lead gone",
  "public how teaches ai.aia door or mint",
  "SI Yes-gating gone",
  "charge without Yes"
];
let caught = 0;
mutants.forEach(function (kind) {
  const faults = buildFaults(applyMutant(kind, files));
  if (faults.indexOf(kind) < 0) fail("mutant missed: " + kind + " (got " + JSON.stringify(faults) + ")");
  else { caught += 1; pass("mutant caught: " + kind); }
});
if (caught !== mutants.length) fail("mutants: " + caught + "/" + mutants.length + " caught");
else pass("mutants: " + caught + "/" + mutants.length + " caught");

try {
  if (fs.existsSync(store)) fs.unlinkSync(store);
} catch (e) {}

if (failed) {
  console.error(failed + " failed");
  process.exit(1);
}
console.log("check-aia-implement ok");
