#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "data", "demo-world.json");
const raw = fs.readFileSync(file, "utf8");
const data = JSON.parse(raw);
const text = raw.toLowerCase();
let fails = 0;
function ok(cond, msg) {
  if (!cond) {
    fails += 1;
    console.error("FAIL " + msg);
  } else {
    console.log("ok   " + msg);
  }
}

const HOW = ["life","estate","assets","auto","vita","legal","land","btr","fund","storm","gc","practice","pm","storage"];
const EXTRA = ["church","repair","delivery","school","files"];
const ids = (data.desks || []).map((d) => d.id);

ok(data.seedLiveBlob === false, "seedLiveBlob is false");
ok(data.label === "DEMO", "label DEMO");
HOW.forEach((id) => ok(ids.includes(id), "how niche " + id));
EXTRA.forEach((id) => ok(ids.includes(id), "world extra " + id));

const ins = (data.desks || []).find((d) => d.id === "vita");
ok(ins && ins.label === "Insurance", "insurance desk label");
ok(ins && ins.family === "Quote It Away", "insurance family");
ok(ins && !(ins.cards || []).some((c) => c.step === "collect"), "no insurance collect step");
ok(ins && !(ins.cards || []).some((c) => /\$\s*\d|bind coverage|send an illustration|placed premium/i.test(JSON.stringify(c))), "no live premium or illustration send");

const ownerFacing = JSON.stringify({
  labels: (data.desks || []).map((d) => d.label + " " + (d.displayPack || "") + " " + d.deskName + " " + d.does),
  cards: (data.desks || []).flatMap((d) => d.cards || [])
});
ok(!/\bVita Financial\b/i.test(ownerFacing), "no Vita Financial on cards");
ok(!/@gmail\.com|@vita|@consignitaway/i.test(raw), "no live mailboxes");
ok(!/417-(?!555)/.test(raw.replace(/417-555/g, "")), "phones stay 555");
(data.desks || []).forEach((d) => {
  (d.cards || []).forEach((c) => {
    ok(String(c.title || "").startsWith("DEMO ·"), "title DEMO " + c.id);
    ok(/example\.com$/.test(c.email || ""), "example.com " + c.id);
    ok(/^417-555-01/.test(c.phone || ""), "555 phone " + c.id);
  });
});

const steps = (data.accountHowTo && data.accountHowTo.steps) || [];
["open","email","session","mfa","logout","taps"].forEach((id) => {
  ok(steps.some((s) => s.id === id), "account how-to " + id);
});
ok(/hold/i.test(JSON.stringify(steps)), "mfa HOLD in how-to");

ok(data.counts && data.counts.cards >= 40, "enough demo cards");
if (fails) {
  console.error(fails + " fail");
  process.exit(1);
}
console.log("demo-world ok · " + data.counts.desks + " desks · " + data.counts.cards + " cards");
