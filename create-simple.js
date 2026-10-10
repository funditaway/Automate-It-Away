/* Simple Create: say it in everyday words, get a draft Desk AI, try it on made-up cards, then Yes, Stop or Kill.
   Server calls: studio-draft (draft only) and save-ai (Yes) on /api/desks. Nothing here sends, pays or charges.
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

  var api = { starterDraft: starterDraft, fromStudio: fromStudio, promptOf: promptOf, sampleCards: sampleCards, sampleDraft: sampleDraft, linesOf: linesOf, rules: rules };
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

  async function draftIt() {
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

  function tryIt() {
    var d = readForm();
    if (!d.name || !d.job) return note("cs-review-note", "Give it a name and one job first.", "ask");
    note("cs-review-note", "", "");
    current = d;
    var box = el("cs-samples");
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
        body: JSON.stringify({ action: "save-ai", id: "", name: d.name, does: d.job, prompt: promptOf(d), steps: (d.steps || []).slice() })
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
      done.textContent = d.name + " is named on this desk. It drafts only. Nothing was sent or charged.";
      done.hidden = false;
      el("cs-open-desk").hidden = false;
    } catch (e) {
      note("cs-test-note", "Could not reach the desk. Nothing was saved.", "err");
    } finally {
      btn.disabled = false;
    }
  }

  function stop() {
    current = null;
    step(1);
    note("cs-note", "Stopped. The draft is cleared. Your words are still here.", "ok");
  }

  function kill() {
    current = null;
    el("cs-words").value = "";
    fill({ name: "", job: "", watches: [], drafts: [], needs: [] });
    var box = el("cs-samples");
    while (box.firstChild) box.removeChild(box.firstChild);
    step(1);
    note("cs-note", "Killed. Everything is thrown away. Nothing was saved or sent.", "ok");
  }

  el("cs-draft").addEventListener("click", draftIt);
  el("cs-try").addEventListener("click", tryIt);
  el("cs-edit").addEventListener("click", function () { step(2); });
  el("cs-back").addEventListener("click", function () { step(1); });
  el("cs-yes").addEventListener("click", yes);
  el("cs-stop").addEventListener("click", stop);
  el("cs-kill").addEventListener("click", kill);

  var params = new URLSearchParams(location.search);
  if (params.get("kind") || params.get("idea") || location.hash) {
    var more = el("more-ways");
    if (more) more.open = true;
  }
  paintRules();
  step(1);
})();
