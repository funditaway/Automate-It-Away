/* Simple Create: say it (or talk it out) in everyday words, get a draft Desk AI, try it on made-up cards, then Yes, Stop or Kill.
   No template or action list: steps and lists can be as long as the person wants. Text is only cut where the server cuts it (LIMITS).
   Server calls: studio-draft (draft only) and save-ai (Yes) on /api/desks. Nothing here sends, pays or charges.
   Built with textContent only. */
(function () {
  var STEP_WORDS = {
    qualify: "Sorts what came in and what it still needs",
    do: "Drafts the next step and the words, for you to check",
    follow: "Drafts a follow-up when a card is waiting"
  };

  /* Server limits on this branch's api/ (not UI caps): studio-draft reads the first 800 characters of the brief
     (api/_grok.js studioDraft), save-ai keeps name 40, does 160 and prompt 400 (api/_ais.js normalizeAi). */
  var LIMITS = { brief: 800, name: 40, does: 160, prompt: 400, planSteps: 200, planChars: 500 };

  function clean(s, n) {
    var t = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
    if (!n || t.length <= n) return t;
    return t.slice(0, n).replace(/\s+\S*$/, "").replace(/[.,;:]+$/, "");
  }

  /* Edited lists: one item per line, as many lines as the person writes. Commas inside a line stay. No length cap. */
  function linesOf(v) {
    if (Array.isArray(v)) return v.map(function (x) { return clean(x); }).filter(Boolean);
    return String(v == null ? "" : v).split(/\r?\n/).map(function (x) { return clean(x); }).filter(Boolean);
  }

  /* The person's own steps: one per typed line, any number. Lines are split on line breaks only (same rule as edited lists),
     so "then", "Ms. Lee" and commas stay inside their step. Blank lines are ignored. */
  function planFrom(words) {
    return linesOf(words);
  }

  /* Only for the short comma lists the studio-draft reply itself uses (kinds, fields, steps). Never for edited text. */
  function studioCsv(v) {
    if (Array.isArray(v)) return v.map(function (x) { return clean(x); }).filter(Boolean);
    return String(v == null ? "" : v).split(",").map(function (x) { return clean(x); }).filter(Boolean);
  }

  function nameFrom(words) {
    /* A short suggested name from the first three words. Only a suggestion; the person can type any name. */
    var bits = clean(words).replace(/[^A-Za-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean).slice(0, 3);
    if (!bits.length) return "My Desk AI";
    return clean("Helper: " + bits.join(" "));
  }

  function starterDraft(words) {
    var w = clean(words);
    return {
      source: "words",
      name: nameFrom(w),
      job: w,
      plan: planFrom(words),
      watches: ["New cards on this desk about: " + w],
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
        if (r && r.contains) watches.push("Cards that mention " + clean(r.contains));
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
      name: clean(ai.name || pack.name) || base.name,
      job: clean(ai.does || pack.does) || base.job,
      plan: base.plan,
      watches: watches.length ? watches : base.watches,
      drafts: drafts.length ? drafts : base.drafts,
      needs: needs.length > 1 ? needs : base.needs,
      steps: steps.length ? steps : base.steps
    };
  }

  /* The summary save-ai keeps (first 400 characters): the draft-only lead, then what it needs, then the job and
     what it watches and drafts. The steps are not in it: they go to the desk as their own list (plan). */
  function promptParts(d) {
    return [
      "Draft only. The person presses Yes, Stop, or Kill.",
      "Needs from the person: " + linesOf(d && d.needs).join("; ") + ".",
      "Job: " + serverJob(d) + ".",
      "Watches: " + linesOf(d && d.watches).join("; ") + ".",
      "Drafts: " + linesOf(d && d.drafts).join("; ") + "."
    ];
  }
  /* The job exactly as the server keeps it (trim, first 160 characters), so the summary matches what is saved. */
  function serverJob(d) {
    return clean(String((d && d.job) == null ? "" : d.job).trim().slice(0, LIMITS.does));
  }
  function promptOf(d) {
    return clean(promptFull(promptParts(d)), LIMITS.prompt);
  }
  function promptFull(parts) { return clean(parts.filter(Boolean).join(" ")); }
  /* Whole summary before the server's cut, so the page can say how much will be kept. */
  function promptLength(d) {
    return promptFull(promptParts(d)).length;
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
    var plan = linesOf(d && d.plan);
    return [
      plan.length ? "Would follow " + plan.length + (plan.length === 1 ? " step" : " steps") + ", starting with: " + plan[0].charAt(0).toLowerCase() + plan[0].slice(1) + "." : "",
      "Would draft: " + main.charAt(0).toLowerCase() + main.slice(1) + ".",
      "Would ask you for: " + ask.charAt(0).toLowerCase() + ask.slice(1) + ".",
      "Waits for you. Nothing is sent."
    ].filter(Boolean);
  }

  /* Browser speech-to-text, feature-detected. Returns null when the browser has none. */
  function speechApi(w) {
    var win = w || window;
    return (win && (win.SpeechRecognition || win.webkitSpeechRecognition)) || null;
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
    return { action: "save-ai", id: "", name: d.name, does: d.job, prompt: promptOf(d), steps: (d.steps || []).slice(), rules: rulesText(), plan: linesOf(d && d.plan) };
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

  /* After Yes: echo what the desk actually saved (out.ai), not what was typed, and say plainly where it cut. */
  function cutNote(typed, saved, n, what) {
    var t = clean(typed), v = clean(saved);
    if (!v || t.length <= v.length || t.indexOf(v) !== 0) return "";
    return "AIA kept the first " + n + " characters of the " + what + ".";
  }
  /* Where each piece sits in the full summary. Each piece's own text starts after its label (after "Watches: "),
     and that is what the note compares with the length really saved, so a saved label alone counts as lost. */
  var PIECE_NAMES = ["what it needs from you", "the job", "what it watches", "what it drafts"];
  function summaryMap(d) {
    var parts = promptParts(d).map(function (x) { return clean(x); });
    var pieces = [], cursor = 0, chunks = [];
    parts.forEach(function (text, i) {
      if (!text) return;
      var start = cursor, end = start + text.length;
      if (i > 0) {
        var label = text.indexOf(": ") + 2;
        /* A piece's closing period is not content: the page's word trim may drop it. */
        var textEnd = /\.$/.test(text) ? end - 1 : end;
        pieces.push({ name: PIECE_NAMES[i - 1], labelStart: start, start: start + label, end: textEnd });
      }
      chunks.push(text);
      cursor = end + 1;
    });
    return { full: chunks.join(" "), pieces: pieces };
  }
  /* The length the desk really kept: the saved prompt when the server sent it back (and it is this summary),
     otherwise what the page sends (the page trims to the last whole word within 400). */
  function savedLength(d, savedPrompt) {
    var full = summaryMap(d).full;
    var saved = typeof savedPrompt === "string" ? savedPrompt : "";
    if (saved && full.indexOf(saved) === 0) return saved.length;
    return promptOf(d).length;
  }
  function andList(xs) {
    if (xs.length < 2) return xs.join("");
    return xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1];
  }
  function trimNote(d, savedPrompt) {
    var map = summaryMap(d);
    var kept = savedLength(d, savedPrompt);
    var lost = [], partly = [];
    map.pieces.forEach(function (piece) {
      if (piece.end <= piece.start) return; /* nothing typed there */
      if (piece.end <= kept) return;
      if (piece.start >= kept) { lost.push(piece.name); return; }
      partly.push("Only part of " + piece.name + " fit.");
    });
    if (!lost.length && !partly.length) return "";
    var out = ["AIA kept the first " + kept + " characters of the summary."];
    partly.forEach(function (x) { out.push(x); });
    if (lost.length) {
      var list = andList(lost);
      out.push(list.charAt(0).toUpperCase() + list.slice(1) + " didn't fit.");
    }
    return out.join(" ");
  }
  /* Steps, people-numbered (1-based), as short ranges: "Step 3", "Steps 201 to 230". */
  function stepRanges(indexes) {
    var nums = (indexes || []).map(function (i) { return Number(i) + 1; }).filter(function (n) { return n > 0; }).sort(function (x, y) { return x - y; });
    var out = [], i = 0;
    while (i < nums.length) {
      var j = i;
      while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j += 1;
      out.push(i === j ? String(nums[i]) : nums[i] + " to " + nums[j]);
      i = j + 1;
    }
    return { count: nums.length, text: (nums.length === 1 ? "Step " : "Steps ") + andList(out) };
  }
  /* The steps note comes only from the server's planCut. Nothing when it is null. */
  function planNote(planCut) {
    if (!planCut || typeof planCut !== "object") return "";
    var out = [];
    var dropped = stepRanges(planCut.droppedIndexes), trimmed = stepRanges(planCut.trimmedIndexes);
    var kept = Number(planCut.kept) || 0;
    if (dropped.count) {
      out.push(kept === 1 ? "AIA kept the first step." : "AIA kept the first " + kept + " steps.");
      out.push(dropped.text + " didn't fit.");
    }
    if (trimmed.count) out.push(trimmed.text + (trimmed.count === 1 ? " was" : " were") + " shortened to " + LIMITS.planChars + " characters.");
    return out.join(" ");
  }
  /* The steps as the desk stored them (out.ai.plan). If the desk sent none back, say so plainly. */
  function planLines(d, out) {
    var ai = (out && out.ai) || {};
    var typed = linesOf(d && d.plan);
    if (!Array.isArray(ai.plan)) return typed.length ? ["The desk did not save the steps. This desk does not keep steps yet."] : [];
    if (!ai.plan.length) return typed.length ? ["The desk did not keep any of the steps."] : [];
    var lines = ["Its steps, as saved:"];
    ai.plan.forEach(function (x, i) { lines.push((i + 1) + ") " + x); });
    var note = planNote(out && out.planCut);
    if (note) lines.push(note);
    return lines;
  }
  function savedLine(d, out) {
    var ai = (out && out.ai) || {};
    var name = clean(ai.name) || clean(d && d.name);
    var does = typeof ai.does === "string" ? ai.does : "";
    var head = [name + " is named on this desk."];
    /* The saved job is shown exactly as stored (a trailing space kept too), on its own line, with nothing added. */
    var jobLine = clean(does) ? "Its job, as saved: " + does : "";
    var rest = ["It drafts only. Nothing was sent or charged."];
    rest.push(cutNote(d && d.name, ai.name, LIMITS.name, "name"));
    rest.push(cutNote(d && d.job, ai.does, LIMITS.does, "job"));
    rest.push(trimNote(d, typeof ai.prompt === "string" ? ai.prompt : ""));
    return [head.join(" "), jobLine].concat(planLines(d, out)).concat([rest.filter(Boolean).join(" ")]).filter(Boolean).join("\n");
  }

  var api = { starterDraft: starterDraft, fromStudio: fromStudio, promptOf: promptOf, sampleCards: sampleCards, sampleDraft: sampleDraft, linesOf: linesOf, planFrom: planFrom, promptLength: promptLength, LIMITS: LIMITS, speechApi: speechApi, rules: rules, rulesText: rulesText, saveBody: saveBody, rulesStored: rulesStored, rulesLine: rulesLine, savedLine: savedLine, promptParts: promptParts, trimNote: trimNote, summaryMap: summaryMap, savedLength: savedLength, planNote: planNote, planLines: planLines };
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
    paintPlan(d.plan || []);
    el("cs-watches").value = (d.watches || []).join("\n");
    el("cs-drafts").value = (d.drafts || []).join("\n");
    el("cs-needs").value = (d.needs || []).join("\n");
  }

  function readForm() {
    return {
      source: current ? current.source : "words",
      name: clean(el("cs-name").value),
      job: clean(el("cs-job").value),
      plan: readPlan(),
      watches: linesOf(el("cs-watches").value),
      drafts: linesOf(el("cs-drafts").value),
      needs: linesOf(el("cs-needs").value),
      steps: current && current.steps ? current.steps : ["qualify", "do", "follow"]
    };
  }

  function showDraft(d, why) {
    current = d;
    fill(d);
    saveCount();
    el("cs-src").textContent = d.source === "aia"
      ? "AIA drafted this from your words. Change anything in plain words."
      : why || "This starter is made from your words. Change anything in plain words.";
    step(2);
  }

  async function draftIt() {
    /* Keep the line breaks for the starter draft (one typed line = one step); squash them only for the studio-draft brief. */
    var raw = String(el("cs-words").value || "");
    var words = clean(raw);
    if (!words) return note("cs-note", "Say what you want automated first.", "ask");
    if (listening && rec) rec.stop();
    note("cs-note", "", "");
    var btn = el("cs-draft");
    btn.disabled = true;
    if (!deskOpen()) {
      btn.disabled = false;
      showDraft(starterDraft(raw), "Your desk is not open, so AIA did not draft this. This starter is made from your words. Change anything in plain words.");
      el("cs-open").hidden = false;
      return;
    }
    try {
      var r = await fetch("/api/desks", { method: "POST", headers: hdr(), body: JSON.stringify({ action: "studio-draft", brief: words, kind: "ai", plan: planFrom(raw) }) });
      var d = await r.json().catch(function () { return {}; });
      if (r.ok && d && d.ok && d.pack) showDraft(fromStudio(raw, d.pack));
      else if (d && d.grok === "off") showDraft(starterDraft(raw), "AIA drafting is not on for this desk yet, so this starter is made from your words. Change anything in plain words.");
      else showDraft(starterDraft(raw), (d && d.error ? d.error + " " : "AIA did not draft this time. ") + "This starter is made from your words.");
    } catch (e) {
      showDraft(starterDraft(raw), "Could not reach the desk. This starter is made from your words.");
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
      done.style.whiteSpace = "pre-line";
      done.textContent = savedLine(d, out) + " " + rulesLine(out);
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
    current = null;
    step(1);
    note("cs-note", "Stopped. The draft is cleared. Your words are still here.", "ok");
  }

  function kill() {
    current = null;
    el("cs-words").value = "";
    fill({ name: "", job: "", plan: [], watches: [], drafts: [], needs: [] });
    var box = el("cs-samples");
    while (box.firstChild) box.removeChild(box.firstChild);
    step(1);
    note("cs-note", "Killed. Everything is thrown away. Nothing was saved or sent.", "ok");
  }

  /* Steps: any number, added and removed freely. */
  function planRow(text) {
    var li = doc.createElement("li");
    var row = doc.createElement("div");
    row.className = "cs-plan-row";
    var input = doc.createElement("input");
    input.className = "cs-plan-step";
    input.value = text || "";
    var rm = doc.createElement("button");
    rm.type = "button";
    rm.className = "link";
    rm.textContent = "Remove";
    rm.addEventListener("click", function () {
      li.parentNode.removeChild(li);
      relabelPlan();
      saveCount();
    });
    input.addEventListener("input", saveCount);
    row.appendChild(input);
    row.appendChild(rm);
    li.appendChild(row);
    return li;
  }
  function relabelPlan() {
    var rows = el("cs-plan").querySelectorAll("input.cs-plan-step");
    for (var i = 0; i < rows.length; i++) rows[i].setAttribute("aria-label", "Step " + (i + 1));
  }
  function paintPlan(list) {
    var box = el("cs-plan");
    while (box.firstChild) box.removeChild(box.firstChild);
    (list || []).forEach(function (t) { box.appendChild(planRow(t)); });
    relabelPlan();
  }
  function readPlan() {
    var rows = el("cs-plan").querySelectorAll("input.cs-plan-step");
    var out = [];
    for (var i = 0; i < rows.length; i++) { var t = clean(rows[i].value); if (t) out.push(t); }
    return out;
  }
  function addStep() {
    var li = planRow("");
    el("cs-plan").appendChild(li);
    relabelPlan();
    var input = li.querySelector("input");
    if (input && input.focus) input.focus();
  }
  function saveCount() {
    var n = promptLength(readForm());
    var out = el("cs-save-count");
    if (!out) return;
    out.textContent = n > LIMITS.prompt
      ? "Right now it is " + n + " characters, so the last " + (n - LIMITS.prompt) + " will not be saved. They still shape this page and the sample test."
      : "Right now it is " + n + " characters.";
  }

  /* Talk it out: the browser's own speech-to-text fills the same box. Hidden when the browser has none. */
  var SR = speechApi(window);
  var rec = null;
  var listening = false;
  function setListening(on, msg) {
    listening = on;
    var mic = el("cs-mic");
    mic.setAttribute("aria-pressed", on ? "true" : "false");
    mic.classList.toggle("is-listening", on);
    mic.textContent = on ? "Stop listening" : "Talk";
    var status = el("cs-listen");
    status.textContent = msg || (on ? "Listening. Talk, then tap Stop listening." : "");
    status.hidden = !status.textContent;
  }
  function micToggle() {
    if (listening && rec) { rec.stop(); return; }
    var box = el("cs-words");
    var before = box.value ? box.value.replace(/\s+$/, "") + " " : "";
    try {
      rec = new SR();
    } catch (e) {
      setListening(false, "Talk did not start in this browser. You can type instead.");
      return;
    }
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = doc.documentElement.lang || "en-US";
    rec.onresult = function (ev) {
      var finals = "";
      var interim = "";
      for (var i = 0; i < ev.results.length; i++) {
        var r = ev.results[i];
        if (r.isFinal) finals += r[0].transcript;
        else interim += r[0].transcript;
      }
      box.value = before + (finals + interim).replace(/^\s+/, "");
    };
    rec.onerror = function (ev) {
      var why = ev && ev.error;
      setListening(false, why === "not-allowed" || why === "service-not-allowed"
        ? "The browser did not allow the mic. You can type instead."
        : "Talk stopped. You can type or try again.");
    };
    rec.onend = function () {
      /* Keep exactly what is in the box: everything heard, ready to edit. */
      if (listening) setListening(false, "Done listening. Fix the words if you like, then press Draft it.");
    };
    try {
      rec.start();
      setListening(true);
    } catch (e2) {
      setListening(false, "Talk did not start in this browser. You can type instead.");
    }
  }
  if (SR) {
    el("cs-mic").hidden = false;
    el("cs-mic-note").hidden = false;
    el("cs-mic").addEventListener("click", micToggle);
  }

  el("cs-plan-add").addEventListener("click", addStep);
  ["cs-name", "cs-job", "cs-watches", "cs-drafts", "cs-needs"].forEach(function (id) {
    el(id).addEventListener("input", saveCount);
  });
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
