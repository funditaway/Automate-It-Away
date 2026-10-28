/* Simple Create: say it in everyday words, start from a pack, show an example,
   pick what it watches and what it drafts, say it also talks to an AI or a site,
   or bring in a text or JSON file. Save a file keeps a copy on this phone.
   Then Draft it, try it on made-up cards, and tap Yes, Stop, or Kill.
   A pack only fills the words box. An example shows one walkthrough on this phone.
   A when and a then only build the words in the box. The person can still edit them.
   A name and an address can be added to those words. A secret stays in its hidden field.
   A file only fills the words, and draft fields when the file has them. It is not uploaded.
   Saving a file downloads on this phone. It does not post. A secret is left out unless
   the person already put it in the words or the draft.
   It does not draft, save, or buy. Draft it still posts studio-draft. Yes still posts save-ai.
   Both go only to /api/desks. Nothing here sends, pays, or charges. Nothing calls that address.
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

  /* A when (what it watches) and a then (what it drafts) only build #cs-words.
     Choosing does not draft, save, or buy. The sentence is not a pack and not the example. */
  var WHENS = [
    { id: "note", label: "A school note arrives", phrase: "a school note arrives" },
    { id: "meeting", label: "A meeting time moves", phrase: "a meeting time moves" },
    { id: "favor", label: "A friend asks for a favor", phrase: "a friend asks for a favor" },
    { id: "trash", label: "Trash day changes", phrase: "trash day changes" }
  ];
  var THENS = [
    { id: "reply", label: "A short reply for me", phrase: "a short reply for me" },
    { id: "reminder", label: "A reminder with the date", phrase: "a reminder with the date" },
    { id: "list", label: "A list of what to bring", phrase: "a list of what to bring" },
    { id: "later", label: "A note I can check later", phrase: "a note I can check later" }
  ];
  var WHEN_NOTE = "These words come from what it watches and what it drafts. Change them if you want, then tap Draft it.";

  /* An AI, an agent, a site, or a hook only adds a sentence to #cs-words.
     The secret stays in the hidden field. It is not added to the words, the draft, or any post. */
  var LINKS = [
    { id: "ai", label: "An AI", phrase: "an AI" },
    { id: "agent", label: "An agent", phrase: "an agent" },
    { id: "site", label: "A site", phrase: "a site" },
    { id: "hook", label: "A hook a site can call", phrase: "a hook" }
  ];
  var LINK_NOTE = "These words now say where it talks. A secret stays on this phone and is not saved. Change the words if you want, then tap Draft it.";
  var LINK_ADDRESS_NOTE = "Use a full address that starts with https://. Put a secret in the secret field, not in the address.";

  function safeAddress(raw) {
    var t = String(raw == null ? "" : raw).trim();
    if (!t || t.length > 200) return "";
    var m = /^https:\/\/([^\/?#\s]+)(\/[^?#\s]*)?/.exec(t);
    if (!m) return "";
    var host = m[1];
    if (!host || host.length > 80 || host.indexOf("@") >= 0) return "";
    if (!/^[A-Za-z0-9.-]+(?::\d+)?$/.test(host)) return "";
    var path = m[2] || "";
    path = path.replace(/\.+$/, "");
    if (path.length > 80) path = path.slice(0, 80).replace(/\.+$/, "");
    if (path && !/^\/[A-Za-z0-9._~!$&'()*+,;=%/-]*$/.test(path)) return "";
    return "https://" + host + path;
  }

  function linkChoices() {
    return LINKS.map(copyChoice);
  }

  function linkSentence(kindId, name, address) {
    var kind = choiceById(LINKS, kindId);
    var who = clean(name, 40);
    var site = safeAddress(address);
    if (!kind || !who || !site) return "";
    return "It also talks to " + kind.phrase + " named " + who + " at " + site + ".";
  }

  function copyChoice(item) {
    return { id: item.id, label: item.label, phrase: item.phrase };
  }

  function whenChoices() {
    return WHENS.map(copyChoice);
  }

  function thenChoices() {
    return THENS.map(copyChoice);
  }

  function choiceById(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function whenThenWords(whenId, thenId) {
    var w = choiceById(WHENS, whenId);
    var t = choiceById(THENS, thenId);
    if (!w || !t) return "";
    return "When " + w.phrase + ", draft " + t.phrase + ".";
  }

  function pairFromWords(words) {
    for (var i = 0; i < WHENS.length; i++) {
      for (var j = 0; j < THENS.length; j++) {
        if (whenThenWords(WHENS[i].id, THENS[j].id) === words) return { when: WHENS[i].id, then: THENS[j].id };
      }
    }
    return null;
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

  /* A text or JSON file can fill the words. Known draft fields can fill the draft.
     Anything else in the file, including a secret, is left out. Nothing is uploaded. */
  var FILE_MAX = 8000;
  var BROUGHT = "Brought in from your file. Change any words you want. Then tap Draft it.";
  var BROUGHT_SHORT = "Brought in from your file. Long text was shortened so it fits. Change any words you want. Then tap Draft it.";
  var FILE_KIND = "Use a plain text or JSON file.";
  var FILE_BIG = "That file is too big. Use a short text or JSON file.";
  var FILE_EMPTY = "That file had no words to use.";
  var FILE_JSON = "That JSON file could not be read. Use plain text, or a file with words in it.";

  function allowedFile(name, mime) {
    var n = String(name || "").toLowerCase().trim();
    var m = String(mime || "").toLowerCase().split(";")[0].trim();
    if (/\.(html?|xhtml|svg|js|mjs|cjs|exe|dll|bat|cmd|ps1|sh|php|pdf|zip|png|jpe?g|gif|webp|mp3|mp4|wav|bin)$/.test(n)) return false;
    if (/\.(txt|text|md|markdown|json|csv)$/.test(n)) return true;
    if (m === "text/plain" || m === "text/markdown" || m === "text/csv" || m === "application/json" || m === "text/json" || m === "application/ld+json") return true;
    if (m.indexOf("text/") === 0) return true;
    if (/^image\/|^audio\/|^video\/|javascript|html|pdf|zip|octet-stream/.test(m)) return false;
    if (!m && (!n || n.indexOf(".") < 0)) return true;
    return false;
  }

  function fileKind(name, mime, raw) {
    if (!allowedFile(name, mime)) return "no";
    var n = String(name || "").toLowerCase();
    var m = String(mime || "").toLowerCase();
    if (/\.json$/.test(n) || m.indexOf("json") >= 0) return "json";
    var lead = String(raw || "").trim();
    if (lead.charAt(0) === "{" || lead.charAt(0) === "[") return "json";
    return "text";
  }

  function pickDraft(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    var name = clean(data.name, 40);
    var job = clean(data.job || data.does, 160);
    var watches = linesOf(data.watches);
    var drafts = linesOf(data.drafts);
    var needs = linesOf(data.needs);
    if (!name && !job && !watches.length && !drafts.length && !needs.length) return null;
    return { source: "words", name: name, job: job, watches: watches, drafts: drafts, needs: needs, steps: ["qualify", "do", "follow"] };
  }

  function flatFile(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) return data;
    if (!data.draft || typeof data.draft !== "object" || Array.isArray(data.draft)) return data;
    var src = {};
    ["words", "text", "brief", "name", "job", "does", "watches", "drafts", "needs"].forEach(function (key) {
      if (data[key] != null) src[key] = data[key];
      else if (data.draft[key] != null) src[key] = data.draft[key];
    });
    return src;
  }

  function wordsFromFile(data) {
    if (!data || typeof data !== "object") return "";
    if (typeof data.words === "string") return data.words;
    if (typeof data.text === "string") return data.text;
    if (typeof data.brief === "string") return data.brief;
    if (typeof data.job === "string") return data.job;
    if (typeof data.does === "string") return data.does;
    return "";
  }

  function textImport(raw) {
    var full = clean(raw, 0);
    var words = clean(raw, 600);
    if (!words) return { ok: false, note: FILE_EMPTY };
    return { ok: true, words: words, draft: null, shortened: full.length > words.length };
  }

  function readJsonImport(raw) {
    var data;
    try { data = JSON.parse(raw); } catch (e) { return { ok: false, note: FILE_JSON }; }
    if (typeof data === "string") return textImport(data);
    if (Array.isArray(data)) {
      var lines = [];
      data.forEach(function (item) { if (typeof item === "string" && clean(item, 600)) lines.push(clean(item, 600)); });
      return textImport(lines.join(" "));
    }
    data = flatFile(data);
    if (!data || typeof data !== "object") return { ok: false, note: FILE_EMPTY };
    var draft = pickDraft(data);
    var rawWords = wordsFromFile(data);
    var words = clean(rawWords, 600);
    if (!words && draft && draft.job) words = clean(draft.job, 600);
    if (!words) return { ok: false, note: FILE_EMPTY };
    return { ok: true, words: words, draft: draft, shortened: clean(rawWords || words, 0).length > words.length };
  }

  function readImportText(text, name, mime) {
    var raw = String(text == null ? "" : text).replace(/^\uFEFF/, "");
    if (raw.indexOf("\0") >= 0) return { ok: false, note: FILE_KIND };
    if (raw.length > FILE_MAX) return { ok: false, note: FILE_BIG };
    if (/^\s*<(?:!doctype|html|script|svg)\b/i.test(raw)) return { ok: false, note: FILE_KIND };
    var kind = fileKind(name, mime, raw);
    if (kind === "no") return { ok: false, note: FILE_KIND };
    if (kind === "json") return readJsonImport(raw);
    return textImport(raw);
  }

  /* Download text for the words and, when present, the draft fields only.
     A secret field is never copied. Keys other than these are left out. */
  function exportText(words, draft) {
    var out = {};
    var said = clean(words, 600);
    if (said) out.words = said;
    if (draft && typeof draft === "object") {
      var name = clean(draft.name, 40);
      var job = clean(draft.job, 160);
      var watches = linesOf(draft.watches);
      var drafts = linesOf(draft.drafts);
      var needs = linesOf(draft.needs);
      if (name) out.name = name;
      if (job) out.job = job;
      if (watches.length) out.watches = watches;
      if (drafts.length) out.drafts = drafts;
      if (needs.length) out.needs = needs;
    }
    return JSON.stringify(out, null, 2) + "\n";
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

  var api = { starterPacks: starterPacks, workedExample: workedExample, whenChoices: whenChoices, thenChoices: thenChoices, whenThenWords: whenThenWords, linkChoices: linkChoices, safeAddress: safeAddress, linkSentence: linkSentence, starterDraft: starterDraft, fromStudio: fromStudio, promptOf: promptOf, sampleCards: sampleCards, sampleDraft: sampleDraft, linesOf: linesOf, rules: rules, rulesText: rulesText, saveBody: saveBody, rulesStored: rulesStored, rulesLine: rulesLine, allowedFile: allowedFile, readImportText: readImportText, exportText: exportText };
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
  var appliedLink = "";
  var broughtWords = "";
  var broughtDraft = null;
  var draftedWords = "";

  function forgetBrought() {
    broughtWords = "";
    broughtDraft = null;
  }

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
    var shown = n === 1 ? el("cs-ask") : n === 2 ? el("cs-review") : el("cs-test");
    if (shown && typeof shown.scrollIntoView === "function") {
      try { shown.scrollIntoView({ block: "start" }); } catch (e) { /* the card still shows */ }
    }
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

  function showFromWords(words, why) {
    if (broughtDraft && words === broughtWords) {
      var base = starterDraft(words);
      showDraft({
        source: "words",
        name: broughtDraft.name || base.name,
        job: broughtDraft.job || base.job,
        watches: linesOf(broughtDraft.watches).length ? linesOf(broughtDraft.watches) : base.watches,
        drafts: linesOf(broughtDraft.drafts).length ? linesOf(broughtDraft.drafts) : base.drafts,
        needs: linesOf(broughtDraft.needs).length ? linesOf(broughtDraft.needs) : base.needs,
        steps: base.steps
      }, why);
      return;
    }
    showDraft(starterDraft(words), why);
  }

  function showDraft(d, why) {
    current = d;
    draftedWords = clean(el("cs-words") ? el("cs-words").value : "", 600);
    fill(d);
    el("cs-src").textContent = d.source === "aia"
      ? "AIA drafted this from your words. Change anything in plain words."
      : why || "This starter is made from your words. Change anything in plain words.";
    paintLinkReview();
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
      showFromWords(words, "Your desk is not open, so AIA did not draft this. This starter is made from your words. Change anything in plain words.");
      el("cs-open").hidden = false;
      return;
    }
    try {
      var r = await fetch("/api/desks", { method: "POST", headers: hdr(), body: JSON.stringify({ action: "studio-draft", brief: words, kind: "ai" }) });
      var d = await r.json().catch(function () { return {}; });
      if (r.ok && d && d.ok && d.pack) showDraft(fromStudio(words, d.pack));
      else if (d && d.grok === "off") showFromWords(words, "AIA drafting is not on for this desk yet, so this starter is made from your words. Change anything in plain words.");
      else showFromWords(words, (d && d.error ? d.error + " " : "AIA did not draft this time. ") + "This starter is made from your words.");
    } catch (e) {
      showFromWords(words, "Could not reach the desk. This starter is made from your words.");
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
      var wordsEl = el("cs-words");
      var info = linkShown(wordsEl ? wordsEl.value : "");
      if (info) {
        var extra = doc.createElement("p");
        extra.textContent = "Would talk to " + info.label + " named " + info.name + " at " + info.address + ". Nothing is called.";
        card.appendChild(extra);
      }
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
    draftedWords = "";
    forgetBrought();
    step(1);
    note("cs-note", "Stopped. The draft is cleared. Your words are still here.", "ok");
  }

  function kill() {
    stopVoice();
    current = null;
    draftedWords = "";
    forgetBrought();
    el("cs-words").value = "";
    markPack("");
    setExampleOpen(false);
    closeWhenPick(true);
    fill({ name: "", job: "", watches: [], drafts: [], needs: [] });
    clearLink();
    var file = el("cs-import-file");
    if (file) file.value = "";
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
    syncWhenThen();
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
    closeWhenPick(true);
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
    closeWhenPick(true);
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

  function closeWhenPick(close) {
    var whenSel = el("cs-when");
    var thenSel = el("cs-then");
    if (whenSel) whenSel.value = "";
    if (thenSel) thenSel.value = "";
    if (close) {
      var pick = el("cs-when-pick");
      if (pick) pick.open = false;
    }
    var n = el("cs-note");
    if (n && String(n.textContent || "").indexOf("These words come from what it watches") === 0) note("cs-note", "", "");
  }

  function syncWhenThen() {
    var box = el("cs-words");
    var whenSel = el("cs-when");
    var thenSel = el("cs-then");
    if (!box || !whenSel || !thenSel) return;
    var hit = pairFromWords(String(box.value || ""));
    if (hit) {
      whenSel.value = hit.when;
      thenSel.value = hit.then;
      return;
    }
    closeWhenPick(false);
  }

  function chooseWhenThen() {
    var whenSel = el("cs-when");
    var thenSel = el("cs-then");
    var box = el("cs-words");
    if (!whenSel || !thenSel || !box) return;
    var sentence = whenThenWords(whenSel.value, thenSel.value);
    if (!sentence) {
      if (pairFromWords(String(box.value || ""))) closeWhenPick(false);
      return;
    }
    var talkBtn = el("cs-talk");
    var talking = !!(talkBtn && String(talkBtn.className || "").indexOf("on") >= 0);
    stopVoice();
    box.value = sentence;
    syncPack();
    note("cs-note", WHEN_NOTE, "ask");
    if (talking) heardNote("Quiet. Type what you want automated, or tap Talk.");
    focusWords();
  }

  function fillSelect(id, blankLabel, list) {
    var sel = el(id);
    if (!sel) return;
    while (sel.firstChild) sel.removeChild(sel.firstChild);
    var blank = doc.createElement("option");
    blank.value = "";
    if (blank.setAttribute) blank.setAttribute("value", "");
    blank.textContent = blankLabel;
    sel.appendChild(blank);
    list.forEach(function (item) {
      var opt = doc.createElement("option");
      opt.value = item.id;
      if (opt.setAttribute) opt.setAttribute("value", item.id);
      opt.textContent = item.label;
      sel.appendChild(opt);
    });
    sel.value = "";
  }

  function secretFilled() {
    var box = el("cs-webhook-secret");
    return !!(box && String(box.value || "").replace(/\s+/g, "").length);
  }

  function linkPublic() {
    var kindEl = el("cs-webhook-kind");
    var nameEl = el("cs-webhook-name");
    var urlEl = el("cs-webhook-url");
    if (!kindEl || !nameEl || !urlEl) return null;
    var kind = choiceById(LINKS, kindEl.value);
    var name = clean(nameEl.value, 40);
    var address = safeAddress(urlEl.value);
    if (!kind || !name || !address) return null;
    return { id: kind.id, label: kind.phrase, name: name, address: address, secret: secretFilled() };
  }

  function linkShown(words) {
    var info = linkPublic();
    if (!info) return null;
    var sentence = linkSentence(info.id, info.name, info.address);
    if (!sentence || String(words || "").indexOf(sentence) < 0) return null;
    return info;
  }

  function paintLinkReview() {
    var line = el("cs-webhook-review");
    if (!line) return;
    var words = el("cs-words");
    var info = linkShown(words ? words.value : "");
    if (!info) {
      line.textContent = "";
      line.hidden = true;
      return;
    }
    var secretBit = info.secret
      ? "A secret is filled in on this phone. It is not shown or saved."
      : "No secret was added.";
    line.textContent = "It would talk to " + info.label + " named " + info.name + " at " + info.address + ". " + secretBit + " This page does not call that address.";
    line.hidden = false;
  }

  function hideUnsafeAddress() {
    var urlEl = el("cs-webhook-url");
    if (!urlEl) return;
    var raw = String(urlEl.value || "");
    var safe = safeAddress(raw);
    if (safe && raw.trim() !== safe) urlEl.value = safe;
    else if (!safe && /[@?#]/.test(raw)) urlEl.value = "";
  }

  function withoutApplied(words) {
    var base = String(words || "");
    if (appliedLink && base.indexOf(appliedLink) >= 0) base = base.split(appliedLink).join(" ");
    return clean(base, 600);
  }

  function clearLink() {
    appliedLink = "";
    ["cs-webhook-kind", "cs-webhook-name", "cs-webhook-url", "cs-webhook-secret"].forEach(function (id) {
      var node = el(id);
      if (node) node.value = "";
    });
    var box = el("cs-webhook");
    if (box) box.open = false;
    var line = el("cs-webhook-review");
    if (line) {
      line.textContent = "";
      line.hidden = true;
    }
  }

  function addLink() {
    var kindEl = el("cs-webhook-kind");
    var nameEl = el("cs-webhook-name");
    var urlEl = el("cs-webhook-url");
    var box = el("cs-words");
    if (!kindEl || !nameEl || !urlEl || !box) return;
    var talkBtn = el("cs-talk");
    var talking = !!(talkBtn && String(talkBtn.className || "").indexOf("on") >= 0);
    stopVoice();
    hideUnsafeAddress();
    if (!kindEl.value) {
      if (talking) heardNote("Quiet. Type what you want automated, or tap Talk.");
      return note("cs-note", "Choose what it talks to.", "ask");
    }
    if (!clean(nameEl.value, 40)) {
      if (talking) heardNote("Quiet. Type what you want automated, or tap Talk.");
      return note("cs-note", "Give it a name.", "ask");
    }
    var address = safeAddress(urlEl.value);
    if (!address) {
      if (talking) heardNote("Quiet. Type what you want automated, or tap Talk.");
      return note("cs-note", LINK_ADDRESS_NOTE, "ask");
    }
    var sentence = linkSentence(kindEl.value, nameEl.value, address);
    var next = withoutApplied(box.value);
    next = next ? next.replace(/[.\s]+$/, "") + ". " + sentence : sentence;
    if (!sentence || next.length > 600) {
      if (talking) heardNote("Quiet. Type what you want automated, or tap Talk.");
      return note("cs-note", "Shorten your words a little so this line can fit.", "ask");
    }
    appliedLink = sentence;
    box.value = next;
    syncPack();
    note("cs-note", LINK_NOTE, "ask");
    if (talking) heardNote("Quiet. Type what you want automated, or tap Talk.");
    focusWords();
  }

  function paintLink() {
    fillSelect("cs-webhook-kind", "Choose what it talks to", linkChoices());
    var box = el("cs-webhook");
    if (box) box.open = false;
    var line = el("cs-webhook-review");
    if (line) line.hidden = true;
  }

  function paintWhenThen() {
    fillSelect("cs-when", "Choose what it watches", whenChoices());
    fillSelect("cs-then", "Choose what it drafts", thenChoices());
    var pick = el("cs-when-pick");
    if (pick) pick.open = false;
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

  function exportDraft() {
    var review = el("cs-review");
    var test = el("cs-test");
    var words = clean(el("cs-words") ? el("cs-words").value : "", 600);
    if ((review && review.hidden === false) || (test && test.hidden === false)) return readForm();
    if (current && words && words === draftedWords) return readForm();
    if (broughtDraft && words === broughtWords) return broughtDraft;
    return null;
  }

  function putFile(got) {
    var box = el("cs-words");
    if (!box || !got) return;
    var talkBtn = el("cs-talk");
    var talking = !!(talkBtn && String(talkBtn.className || "").indexOf("on") >= 0);
    stopVoice();
    box.value = got.words || "";
    broughtWords = got.words || "";
    if (got.draft) {
      broughtDraft = got.draft;
      current = got.draft;
      fill(got.draft);
    } else {
      broughtDraft = null;
      current = null;
    }
    draftedWords = "";
    syncPack();
    if (el("cs-ask") && el("cs-ask").hidden) step(1);
    note("cs-note", got.shortened ? BROUGHT_SHORT : BROUGHT, "ask");
    if (talking) heardNote("Quiet. Type what you want automated, or tap Talk.");
    focusWords();
  }

  function takeFile(file) {
    if (!file) return;
    var name = file.name || "";
    var mime = file.type || "";
    if (!allowedFile(name, mime)) return note("cs-note", FILE_KIND, "ask");
    if (typeof file.size === "number" && file.size > 20000) return note("cs-note", FILE_BIG, "ask");
    if (typeof FileReader !== "function") return note("cs-note", "This phone cannot read a file here. Type the words instead.", "err");
    var reader = new FileReader();
    reader.onload = function () {
      var text = reader.result == null ? "" : String(reader.result);
      var got = readImportText(text, name, mime);
      if (!got.ok) return note("cs-note", got.note || FILE_EMPTY, "ask");
      putFile(got);
    };
    reader.onerror = function () {
      note("cs-note", "That file could not be read. Try a text or JSON file.", "err");
    };
    reader.readAsText(file);
  }

  function armFileInput() {
    var node = el("cs-import-file");
    if (!node || (node.getAttribute && node.getAttribute("data-ready") === "yes")) return node;
    node.type = "file";
    if (node.setAttribute) {
      node.setAttribute("type", "file");
      node.setAttribute("data-ready", "yes");
    }
    if (node.addEventListener) node.addEventListener("change", function () {
      var list = node.files;
      var file = list && list[0];
      if (!file) return;
      takeFile(file);
      try { node.value = ""; } catch (e) { /* the same file can be chosen again next time */ }
    });
    return node;
  }

  function pickFile() {
    stopVoice();
    var node = armFileInput();
    if (!node || typeof node.click !== "function") return note("cs-note", "This phone cannot bring in a file here. Type the words instead.", "err");
    node.click();
  }

  function saveFile() {
    stopVoice();
    var words = clean(el("cs-words") ? el("cs-words").value : "", 600);
    var draft = exportDraft();
    var text = exportText(words, draft);
    if (text === "{}\n") return note("cs-note", "Nothing to save yet. Type some words, or bring in a file.", "ask");
    var urlApi = typeof URL !== "undefined" && URL && typeof URL.createObjectURL === "function" ? URL : null;
    if (typeof Blob !== "function" || !urlApi) return note("cs-note", "This phone could not save a file. Your words are still here.", "err");
    var blob = new Blob([text], { type: "application/json" });
    var url = urlApi.createObjectURL(blob);
    var a = doc.createElement("a");
    a.href = url;
    a.download = "aia-words.json";
    if (a.setAttribute) {
      a.setAttribute("href", url);
      a.setAttribute("download", "aia-words.json");
    }
    var body = doc.body;
    if (body && typeof body.appendChild === "function") body.appendChild(a);
    if (typeof a.click === "function") a.click();
    if (body && a.parentNode && typeof body.removeChild === "function") body.removeChild(a);
    if (typeof urlApi.revokeObjectURL === "function") urlApi.revokeObjectURL(url);
    note("cs-note", "Saved a file on this phone. Nothing was uploaded.", "ok");
  }

  function armDrop(node) {
    if (!node || !node.addEventListener) return;
    node.addEventListener("dragover", function (e) {
      if (e && e.preventDefault) e.preventDefault();
      if (e && e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      var box = el("cs-words");
      if (box) box.className = "dropping";
    });
    node.addEventListener("dragleave", function () {
      var box = el("cs-words");
      if (box && box.className === "dropping") box.className = "";
    });
    node.addEventListener("drop", function (e) {
      if (e && e.preventDefault) e.preventDefault();
      var box = el("cs-words");
      if (box) box.className = "";
      var dt = e && e.dataTransfer;
      var files = dt && dt.files;
      var file = files && (files[0] || files.item && files.item(0));
      if (file) takeFile(file);
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
  paintWhenThen();
  paintLink();
  armFileInput();
  armDrop(el("cs-ask"));
  if (el("cs-import")) el("cs-import").addEventListener("click", pickFile);
  if (el("cs-export")) el("cs-export").addEventListener("click", saveFile);
  if (el("cs-webhook-add")) el("cs-webhook-add").addEventListener("click", addLink);
  if (el("cs-when")) el("cs-when").addEventListener("change", chooseWhenThen);
  if (el("cs-then")) el("cs-then").addEventListener("change", chooseWhenThen);

  var params = new URLSearchParams(location.search);
  if (params.get("kind") || params.get("idea") || location.hash) {
    var more = el("more-ways");
    if (more) more.open = true;
  }
  paintRules();
  step(1);
})();
