/* Simple Create: say it in everyday words, start from a pack, or show an example.
   Then Draft it, try it on made-up cards, and tap Yes, Stop, or Kill.
   A pack only fills the words box. An example shows one walkthrough on this phone.
   It does not draft, save, or buy. Draft it still posts studio-draft. Yes still posts save-ai.
   Both go only to /api/desks. Nothing here sends, pays, or charges.
   Built with textContent only. */
(function () {
  var STEP_WORDS = {
    qualify: "Sorts what came in and what it still needs",
    do: "Drafts the next step and the words, for you to check",
    follow: "Drafts a follow-up when a card is waiting"
  };

  function clean(s, n) {
    var t = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
    if (!n || t.length <= n) return t;
    return t.slice(0, n).replace(/\s+\S*$/, "").replace(/[.,;:]+$/, "");
  }

  /* Edited lists: one item per line. Commas inside a line stay. */
  function linesOf(v) {
    if (Array.isArray(v)) return v.map(function (x) { return clean(x, 120); }).filter(Boolean);
    return String(v == null ? "" : v).split(/\r?\n/).map(function (x) { return clean(x, 120); }).filter(Boolean);
  }

  /* Only for the short comma lists the studio-draft reply itself uses (kinds, fields, steps). Never for edited text. */
  function studioCsv(v) {
    if (Array.isArray(v)) return v.map(function (x) { return clean(x, 60); }).filter(Boolean);
    return String(v == null ? "" : v).split(",").map(function (x) { return clean(x, 60); }).filter(Boolean);
  }

  function nameFrom(words) {
    var bits = clean(words, 200).replace(/[^A-Za-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean).slice(0, 3);
    if (!bits.length) return "My Desk AI";
    return clean("Helper: " + bits.join(" "), 40);
  }

  /* One worked example. Showing it fills #cs-words and paints a walkthrough on this phone.
     It does not draft, save, or buy. The words are not one of the pack chips. */
  var EXAMPLE_WORDS = "When the school moves pickup to 3:30, draft a note and a reply for me.";
  var EXAMPLE_LEAD = "Here is one example. It stays on this phone. Nothing is saved or sent.";
  var EXAMPLE_NOTE = "This is an example. Change any words you want. Then tap Draft it.";

  function workedExample() {
    return { words: EXAMPLE_WORDS };
  }

  /* A few everyday packs. Choosing one fills #cs-words. It does not draft, save, or buy. */
  function starterPacks() {
    return [
      { id: "pickup", name: "Pickup changes", words: "When a parent asks to change pickup, draft a reply and a reminder for me." },
      { id: "bill", name: "A bill due", words: "When a bill is due, draft a reminder with the date and what it is for." },
      { id: "neighbor", name: "Neighbor help", words: "When a neighbor asks for help, draft a short reply and a time that works." },
      { id: "plants", name: "Water the plants", words: "Remind me to water the plants every Tuesday, and draft a note if a day gets missed." }
    ];
  }

  function starterDraft(words) {
    var w = clean(words, 160);
    return {
      source: "words",
      name: nameFrom(w),
      job: w,
      watches: ["New cards on this desk about: " + clean(w, 70)],
      drafts: [STEP_WORDS.do, STEP_WORDS.follow],
      needs: ["Your Yes before anything is used", "Names, dates, or details only you know"],
      steps: ["qualify", "do", "follow"]
    };
  }

  function fromStudio(words, pack) {
    var base = starterDraft(words);
    if (!pack || typeof pack !== "object") return base;
    var rows = Array.isArray(pack.ais) && pack.ais.length ? pack.ais : (Array.isArray(pack.bots) ? pack.bots : []);
    var ai = rows[0] && typeof rows[0] === "object" ? rows[0] : {};
    var watches = studioCsv(pack.kinds).map(function (k) { return "New " + k + " cards on this desk"; });
    (Array.isArray(pack.workflows) ? pack.workflows : []).forEach(function (wf) {
      (wf && Array.isArray(wf.rules) ? wf.rules : []).forEach(function (r) {
        if (r && r.contains) watches.push("Cards that mention " + clean(r.contains, 40));
      });
    });
    var steps = studioCsv(ai.steps).map(function (s) { return s.toLowerCase(); }).filter(function (s) { return STEP_WORDS[s]; });
    var drafts = steps.map(function (s) { return STEP_WORDS[s]; });
    var needs = studioCsv(pack.fields).map(function (f) {
      var key = clean(String(f).split(":")[0], 30);
      return key ? "The " + key : "";
    }).filter(Boolean);
    needs.unshift("Your Yes before anything is used");
    return {
      source: "aia",
      name: clean(ai.name || pack.name, 40) || base.name,
      job: clean(ai.does || pack.does, 160) || base.job,
      watches: watches.length ? watches.slice(0, 5) : base.watches,
      drafts: drafts.length ? drafts : base.drafts,
      needs: needs.length > 1 ? needs.slice(0, 5) : base.needs,
      steps: steps.length ? steps : base.steps
    };
  }

  function promptOf(d) {
    var parts = [
      "Job: " + clean(d && d.job, 160) + ".",
      "Watches: " + linesOf(d && d.watches).join("; ") + ".",
      "Drafts: " + linesOf(d && d.drafts).join("; ") + ".",
      "Needs from the person: " + linesOf(d && d.needs).join("; ") + ".",
      "Draft only. The person presses Yes, Stop, or Kill."
    ];
    return clean(parts.join(" "), 400);
  }

  function sampleCards() {
    return [
      { title: "A parent asks to move Friday pickup to 4 pm" },
      { title: "The water bill is due on the 15th" },
      { title: "A neighbor asks for help moving a couch on Saturday" }
    ];
  }

  function sampleDraft(d, card) {
    var drafts = linesOf(d && d.drafts);
    var needs = linesOf(d && d.needs);
    var main = drafts.filter(function (x) { return /^Drafts/.test(x); })[0] || drafts[0] || "the next step";
    var ask = needs[1] || needs[0] || "your Yes";
    return [
      "Would draft: " + main.charAt(0).toLowerCase() + main.slice(1) + ".",
      "Would ask you for: " + ask.charAt(0).toLowerCase() + ask.slice(1) + ".",
      "Waits for you. Nothing is sent."
    ];
  }

  function rules() {
    var list = window.AIACardRules;
    return Array.isArray(list) ? list.slice() : [];
  }

  /* The nine rules as one text, one rule per line, for the Desk AI rules field. Stored text only. */
  function rulesText() {
    return rules().join("\n");
  }

  function saveBody(d) {
    return { action: "save-ai", id: "", name: d.name, does: d.job, prompt: promptOf(d), steps: (d.steps || []).slice(), rules: rulesText() };
  }

  /* Honest line after Yes: only say the desk stored the rules if the saved Desk AI came back with them. */
  function rulesStored(out) {
    return !!(out && out.ai && typeof out.ai.rules === "string" && out.ai.rules.trim());
  }
  function rulesLine(out) {
    return rulesStored(out)
      ? "The desk stored the nine rules with it, as text. Nothing enforces them."
      : "The desk does not store the rules yet. Nothing enforces them.";
  }

  var api = { starterPacks: starterPacks, workedExample: workedExample, starterDraft: starterDraft, fromStudio: fromStudio, promptOf: promptOf, sampleCards: sampleCards, sampleDraft: sampleDraft, linesOf: linesOf, rules: rules, rulesText: rulesText, saveBody: saveBody, rulesStored: rulesStored, rulesLine: rulesLine };
  window.AIACreateSimple = api;

  var doc = window.document;
  if (!doc || typeof doc.getElementById !== "function") return;
  var root = doc.getElementById("cs");
  if (!root) return;

  function el(id) { return doc.getElementById(id); }
  function hdr() {
    var h = { "Content-Type": "application/json" };
    var ws = localStorage.getItem("aia_ws") || "";
    var pin = localStorage.getItem("aia_pin") || "";
    var tok = localStorage.getItem("aia_session") || "";
    if (ws) h["X-Workspace"] = String(ws).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    if (tok) h["X-Session"] = tok;
    if (pin) h["X-Pin"] = pin;
    return h;
  }
  function deskOpen() {
    return !!(localStorage.getItem("aia_ws") && (localStorage.getItem("aia_session") || localStorage.getItem("aia_pin")));
  }

  var current = null;

  function paintRules() {
    var list = el("cs-rules-list");
    if (!list) return;
    while (list.firstChild) list.removeChild(list.firstChild);
    rules().forEach(function (r) {
      var li = doc.createElement("li");
      li.textContent = r;
      list.appendChild(li);
    });
  }

  function note(id, text, tone) {
    var n = el(id);
    if (!n) return;
    n.textContent = text || "";
    n.hidden = !text;
    n.className = "cs-note" + (tone ? " is-" + tone : "");
  }

  function step(n) {
    el("cs-step").textContent = "Step " + n + " of 3";
    el("cs-ask").hidden = n !== 1;
    el("cs-review").hidden = n !== 2;
    el("cs-test").hidden = n !== 3;
    el("cs-done").hidden = true;
    el("cs-open").hidden = true;
  }

  function fill(d) {
    el("cs-name").value = d.name || "";
    el("cs-job").value = d.job || "";
    el("cs-watches").value = (d.watches || []).join("\n");
    el("cs-drafts").value = (d.drafts || []).join("\n");
    el("cs-needs").value = (d.needs || []).join("\n");
  }

  function readForm() {
    return {
      source: current ? current.source : "words",
      name: clean(el("cs-name").value, 40),
      job: clean(el("cs-job").value, 160),
      watches: linesOf(el("cs-watches").value),
      drafts: linesOf(el("cs-drafts").value),
      needs: linesOf(el("cs-needs").value),
      steps: current && current.steps ? current.steps : ["qualify", "do", "follow"]
    };
  }

  function showDraft(d, why) {
    current = d;
    fill(d);
    el("cs-src").textContent = d.source === "aia"
      ? "AIA drafted this from your words. Change anything in plain words."
      : why || "This starter is made from your words. Change anything in plain words.";
    step(2);
  }

  /* Voice stays in the browser. Heard words are text in #cs-words. No audio is posted.
     Draft it still posts studio-draft. Yes still posts save-ai. This page adds no server route. */
  var TYPE_INSTEAD = "This phone will not take speech here. Type what you want automated.";

  function voiceOn() {
    var speech = window.AIASpeech;
    return !!(speech && typeof speech.canListen === "function" && speech.canListen());
  }

  function heardNote(text) {
    var n = el("cs-heard");
    if (!n) return;
    n.textContent = text || "";
  }

  function stopVoice() {
    talkGen += 1;
    var speech = window.AIASpeech;
    if (speech && typeof speech.stopTalk === "function") speech.stopTalk();
    var btn = el("cs-talk");
    if (!btn) return;
    btn.className = "ghost";
    if (btn.setAttribute) btn.setAttribute("aria-pressed", "false");
  }

  function focusWords() {
    var box = el("cs-words");
    if (box && typeof box.focus === "function") box.focus();
  }

  var talkGen = 0;

  function putHeard(text) {
    var box = el("cs-words");
    if (!box) return "";
    var heard = clean(text, 600);
    var cur = String(box.value || "").replace(/\s+$/, "");
    if (!heard) return cur;
    if (!cur) {
      box.value = heard;
      syncPack();
      return heard;
    }
    var room = 600 - cur.length - 1;
    if (room <= 0) return cur;
    var extra = heard.length <= room ? heard : heard.slice(0, room).replace(/\s+\S*$/, "").replace(/[.,;:]+$/, "");
    if (!extra) return cur;
    var next = cur + " " + extra;
    box.value = next;
    syncPack();
    return next;
  }

  function talk() {
    if (!voiceOn()) {
      stopVoice();
      heardNote(TYPE_INSTEAD);
      focusWords();
      return;
    }
    var mine = ++talkGen;
    var btn = el("cs-talk");
    if (btn) {
      btn.className = "ghost on";
      if (btn.setAttribute) btn.setAttribute("aria-pressed", "true");
    }
    heardNote("Listening. Say what you want automated.");
    window.AIASpeech.listen(function (text) {
      if (mine !== talkGen) return;
      stopVoice();
      var next = putHeard(text);
      heardNote(next ? "Heard. Tap Draft it, or talk again to add more." : "Did not catch that. Tap Talk and say it again, or type it.");
    }, function (msg) {
      if (mine !== talkGen) return;
      stopVoice();
      heardNote(msg || "Could not hear that. Type it.");
      focusWords();
    });
  }

  function quiet() {
    stopVoice();
    heardNote("Quiet. Type what you want automated, or tap Talk.");
  }

  async function draftIt() {
    stopVoice();
    var words = clean(el("cs-words").value, 600);
    if (!words) return note("cs-note", "Say what you want automated first.", "ask");
    note("cs-note", "", "");
    var btn = el("cs-draft");
    btn.disabled = true;
    if (!deskOpen()) {
      btn.disabled = false;
      showDraft(starterDraft(words), "Your desk is not open, so AIA did not draft this. This starter is made from your words. Change anything in plain words.");
      el("cs-open").hidden = false;
      return;
    }
    try {
      var r = await fetch("/api/desks", { method: "POST", headers: hdr(), body: JSON.stringify({ action: "studio-draft", brief: words, kind: "ai" }) });
      var d = await r.json().catch(function () { return {}; });
      if (r.ok && d && d.ok && d.pack) showDraft(fromStudio(words, d.pack));
      else if (d && d.grok === "off") showDraft(starterDraft(words), "AIA drafting is not on for this desk yet, so this starter is made from your words. Change anything in plain words.");
      else showDraft(starterDraft(words), (d && d.error ? d.error + " " : "AIA did not draft this time. ") + "This starter is made from your words.");
    } catch (e) {
      showDraft(starterDraft(words), "Could not reach the desk. This starter is made from your words.");
    } finally {
      btn.disabled = false;
    }
  }

  function paintSamples(box, d) {
    if (!box) return;
    while (box.firstChild) box.removeChild(box.firstChild);
    sampleCards().forEach(function (c) {
      var card = doc.createElement("article");
      card.className = "cs-sample";
      var tag = doc.createElement("span");
      tag.className = "cs-tag";
      tag.textContent = "Sample, made up";
      var h = doc.createElement("b");
      h.textContent = c.title;
      card.appendChild(tag);
      card.appendChild(h);
      sampleDraft(d, c).forEach(function (line) {
        var p = doc.createElement("p");
        p.textContent = line;
        card.appendChild(p);
      });
      box.appendChild(card);
    });
  }

  function paintExampleDraft(box, d, words) {
    if (!box) return;
    while (box.firstChild) box.removeChild(box.firstChild);
    function group(label, items) {
      var h = doc.createElement("p");
      var b = doc.createElement("b");
      b.textContent = label;
      h.appendChild(b);
      box.appendChild(h);
      items.forEach(function (item) {
        var line = doc.createElement("p");
        line.textContent = item;
        box.appendChild(line);
      });
    }
    group("The words", [words]);
    group("Name", [d.name || ""]);
    group("One job", [d.job || ""]);
    group("What it watches", linesOf(d.watches));
    group("What it drafts", linesOf(d.drafts));
    group("What it needs from you", linesOf(d.needs));
  }

  function tryIt() {
    var d = readForm();
    if (!d.name || !d.job) return note("cs-review-note", "Give it a name and one job first.", "ask");
    note("cs-review-note", "", "");
    current = d;
    paintSamples(el("cs-samples"), d);
    note("cs-test-note", "", "");
    step(3);
  }

  async function yes() {
    var d = current || readForm();
    if (!deskOpen()) {
      note("cs-test-note", "Open your desk first. Nothing was saved.", "err");
      el("cs-open").hidden = false;
      return;
    }
    var btn = el("cs-yes");
    btn.disabled = true;
    try {
      var r = await fetch("/api/desks", {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify(saveBody(d))
      });
      var out = await r.json().catch(function () { return {}; });
      if (!r.ok || out.ok === false) {
        note("cs-test-note", ((out && out.error) || "The desk did not save it.") + " Nothing was saved.", "err");
        return;
      }
      el("cs-ask").hidden = true;
      el("cs-review").hidden = true;
      el("cs-test").hidden = true;
      el("cs-step").textContent = "Done";
      var done = el("cs-done");
      done.textContent = d.name + " is named on this desk. It drafts only. Nothing was sent or charged. " + rulesLine(out);
      if (rulesStored(out) && el("cs-rules-note")) el("cs-rules-note").textContent = "Shown so you know how it should act. The desk stored these rules with your Desk AI, as text. Nothing enforces them.";
      done.hidden = false;
      el("cs-open-desk").hidden = false;
    } catch (e) {
      note("cs-test-note", "Could not reach the desk. Nothing was saved.", "err");
    } finally {
      btn.disabled = false;
    }
  }

  function stop() {
    stopVoice();
    current = null;
    step(1);
    note("cs-note", "Stopped. The draft is cleared. Your words are still here.", "ok");
  }

  function kill() {
    stopVoice();
    current = null;
    el("cs-words").value = "";
    markPack("");
    setExampleOpen(false);
    fill({ name: "", job: "", watches: [], drafts: [], needs: [] });
    var box = el("cs-samples");
    while (box.firstChild) box.removeChild(box.firstChild);
    step(1);
    note("cs-note", "Killed. Everything is thrown away. Nothing was saved or sent.", "ok");
  }

  var packButtons = [];

  function packById(id) {
    var list = starterPacks();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function markPack(id) {
    (packButtons || []).forEach(function (b) {
      var on = !!(id && b.getAttribute("data-starter") === id);
      b.className = on ? "on" : "";
      if (b.setAttribute) b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function syncExample() {
    var box = el("cs-words");
    var walk = el("cs-example-walk");
    if (!box || !walk || walk.hidden) return;
    if (String(box.value || "") !== workedExample().words) {
      setExampleOpen(false);
      var n = el("cs-note");
      if (n && String(n.textContent || "").indexOf("This is an example.") === 0) note("cs-note", "", "");
    }
  }

  function syncPack() {
    var box = el("cs-words");
    if (!box) return;
    var words = String(box.value || "");
    var hit = null;
    starterPacks().forEach(function (s) { if (s.words === words) hit = s; });
    markPack(hit ? hit.id : "");
    syncExample();
  }

  function choosePack(id) {
    var s = packById(id);
    var box = el("cs-words");
    if (!s || !box) return;
    var talkBtn = el("cs-talk");
    var talking = !!(talkBtn && String(talkBtn.className || "").indexOf("on") >= 0);
    stopVoice();
    box.value = s.words;
    markPack(s.id);
    setExampleOpen(false);
    note("cs-note", "Change any words you want. Then tap Draft it.", "ask");
    if (talking) heardNote("Quiet. Type what you want automated, or tap Talk.");
    focusWords();
  }

  function setExampleOpen(open) {
    var walk = el("cs-example-walk");
    var btn = el("cs-example");
    if (walk) walk.hidden = !open;
    if (!btn) return;
    btn.textContent = open ? "Hide the example" : "Show an example";
    if (btn.setAttribute) btn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function showExample() {
    var box = el("cs-words");
    var walk = el("cs-example-walk");
    var btn = el("cs-example");
    if (!box || !walk || !btn) return;
    var words = workedExample().words;
    var talkBtn = el("cs-talk");
    var talking = !!(talkBtn && String(talkBtn.className || "").indexOf("on") >= 0);
    if (walk.hidden === false && String(box.value || "") === words) {
      stopVoice();
      setExampleOpen(false);
      if (talking) heardNote("Quiet. Type what you want automated, or tap Talk.");
      var n = el("cs-note");
      if (n && String(n.textContent || "").indexOf("This is an example.") === 0) note("cs-note", "", "");
      return;
    }
    stopVoice();
    box.value = words;
    syncPack();
    var d = starterDraft(words);
    var lead = el("cs-example-lead");
    if (lead) lead.textContent = EXAMPLE_LEAD;
    paintExampleDraft(el("cs-example-draft"), d, words);
    paintSamples(el("cs-example-samples"), d);
    setExampleOpen(true);
    note("cs-note", EXAMPLE_NOTE, "ask");
    if (talking) heardNote("Quiet. Type what you want automated, or tap Talk.");
  }

  function paintPacks() {
    var box = el("cs-starters");
    if (!box) return;
    packButtons = [];
    while (box.firstChild) box.removeChild(box.firstChild);
    starterPacks().forEach(function (s) {
      var b = doc.createElement("button");
      b.setAttribute("type", "button");
      b.setAttribute("data-starter", s.id);
      b.setAttribute("aria-pressed", "false");
      b.textContent = s.name;
      b.addEventListener("click", function () { choosePack(s.id); });
      box.appendChild(b);
      packButtons.push(b);
    });
  }

  el("cs-draft").addEventListener("click", draftIt);
  el("cs-try").addEventListener("click", tryIt);
  el("cs-edit").addEventListener("click", function () { step(2); });
  el("cs-back").addEventListener("click", function () { step(1); });
  el("cs-yes").addEventListener("click", yes);
  el("cs-stop").addEventListener("click", stop);
  el("cs-kill").addEventListener("click", kill);
  if (el("cs-talk")) el("cs-talk").addEventListener("click", talk);
  if (el("cs-quiet")) el("cs-quiet").addEventListener("click", quiet);
  if (el("cs-example")) {
    var exampleWalk = el("cs-example-walk");
    var exampleBtn = el("cs-example");
    if (exampleWalk) exampleWalk.hidden = true;
    if (!String(exampleBtn.textContent || "").trim()) exampleBtn.textContent = "Show an example";
    if (exampleBtn.getAttribute && exampleBtn.getAttribute("aria-expanded") == null) exampleBtn.setAttribute("aria-expanded", "false");
    exampleBtn.addEventListener("click", showExample);
  }
  heardNote(voiceOn() ? "Talk, or type in the box. Then tap Draft it." : TYPE_INSTEAD);
  var wordsBox = el("cs-words");
  if (wordsBox) wordsBox.addEventListener("input", syncPack);
  paintPacks();

  var params = new URLSearchParams(location.search);
  if (params.get("kind") || params.get("idea") || location.hash) {
    var more = el("more-ways");
    if (more) more.open = true;
  }
  paintRules();
  step(1);
})();
