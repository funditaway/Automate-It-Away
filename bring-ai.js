// Bring your AI (slice 1) on /account: read an AI's export file on this device, show what would come
// in, and send it to AIA only after one Yes.
// - The file is read here, in the browser. Nothing from it is sent, beaconed or stored (no fetch, no
//   sendBeacon, no localStorage, sessionStorage, IndexedDB or cookies) before Yes.
// - Yes sends only the ticked chats to POST /api/account, action "import-ai" (Switch's slice; until it
//   lands the server says no and nothing is saved). Unticked chats never leave the device.
// - Today it reads ChatGPT's conversations.json, on its own or inside the export ZIP (unzipped with the
//   browser's own DecompressionStream; no library). Other AIs: their official export page only.
// - Projects become desks only when the file names a project; otherwise one desk named after the AI.
// - One chat is one card: one topic per card, two chats are never merged.
// - Every value from the file is set with textContent, never as HTML.
(function () {
  "use strict";
  var root = document.getElementById("acct-bring-ai");
  if (!root) return;

  var AIS = [
    { id: "chatgpt", name: "ChatGPT", reads: true, href: "https://help.openai.com/en/articles/7260999-how-do-i-export-my-chatgpt-history-and-data" },
    { id: "claude", name: "Claude", href: "https://support.anthropic.com/en/articles/9450526-how-can-i-export-my-claude-ai-data" },
    { id: "grok", name: "Grok", href: "https://x.ai/legal/faq" },
    { id: "gemini", name: "Gemini", href: "https://support.google.com/accounts/answer/3024190" },
    { id: "perplexity", name: "Perplexity", href: "https://www.perplexity.ai/hub/legal/self-serve-data-options" },
    { id: "copilot", name: "Copilot", href: "https://support.microsoft.com/en-us/privacy/manage-your-copilot-activity-history-in-the-privacy-dashboard" }
  ];
  var MAX_BYTES = 200 * 1024 * 1024;
  var CHUNK_CHATS = 200, CHUNK_BYTES = 3 * 1024 * 1024;
  var EXCERPT = 280, MSG_TEXT = 20000, MSGS = 2000;
  var CANT = "We can't read this file. Nothing was kept.";
  var NOZIP = "This browser can't open ZIP files. Unzip it, then drop conversations.json.";
  var BIG = "This file is too big for now. Nothing was kept.";

  var ai = null, got = null, off = {}, sending = false;
  var parts = {};

  function ls(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function signedIn() { return !!(ls("aia_ws") && (ls("aia_session") || ls("aia_pin"))); }
  function hdr() {
    var h = { "Content-Type": "application/json" };
    var ws = ls("aia_ws"), tok = ls("aia_session"), pin = ls("aia_pin");
    if (ws) h["X-Workspace"] = ws;
    if (tok) h["X-Session"] = tok;
    if (pin) h["X-Pin"] = pin;
    return h;
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }
  function clear(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }
  function button(label, cls, run) {
    var b = el("button", cls, label);
    b.type = "button";
    b.addEventListener("click", run);
    return b;
  }
  function say(t) { if (parts.status) parts.status.textContent = t || ""; }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

  // ---- ChatGPT conversations.json -> { provider, projects: [{ name, chats: [...] }] } ----
  function cleanText(s, max) {
    if (typeof s !== "string") return "";
    s = s.replace(/\s+/g, " ").trim();
    return max && s.length > max ? s.slice(0, max) : s;
  }
  function projectOf(c) {
    var p = c && c.project;
    if (typeof p === "string") return cleanText(p, 80);
    if (p && typeof p === "object" && typeof p.name === "string") return cleanText(p.name, 80);
    if (c && typeof c.project_name === "string") return cleanText(c.project_name, 80);
    return "";
  }
  function textOf(m) {
    var c = m && m.content;
    if (!c) return "";
    if (Array.isArray(c.parts)) return c.parts.filter(function (x) { return typeof x === "string"; }).join("\n").trim();
    if (typeof c.text === "string") return c.text.trim();
    return "";
  }
  function messagesOf(c) {
    var map = c.mapping, nodes = [];
    if (c.current_node && map[c.current_node]) {
      var seen = {}, at = c.current_node;
      while (at && map[at] && !seen[at]) { seen[at] = 1; nodes.push(map[at]); at = map[at].parent; }
      nodes.reverse();
    } else {
      Object.keys(map).forEach(function (k) { if (map[k] && map[k].message) nodes.push(map[k]); });
      nodes.sort(function (a, b) { return ((a.message.create_time || 0) - (b.message.create_time || 0)); });
    }
    var out = [];
    nodes.forEach(function (n) {
      var m = n && n.message, role = m && m.author && m.author.role;
      if (role !== "user" && role !== "assistant") return;
      var t = textOf(m);
      if (!t || out.length >= MSGS) return;
      out.push({ role: role, text: t.length > MSG_TEXT ? t.slice(0, MSG_TEXT) : t });
    });
    return out;
  }
  function whenOf(t) {
    if (typeof t !== "number" || !isFinite(t) || t <= 0) return "";
    try { return new Date(t * 1000).toISOString(); } catch (e) { return ""; }
  }
  function parseChatGPT(data, aiName) {
    if (!Array.isArray(data) || !data.length) return null;
    for (var i = 0; i < data.length; i++) {
      var c0 = data[i];
      if (!c0 || typeof c0 !== "object" || !c0.mapping || typeof c0.mapping !== "object" || Array.isArray(c0.mapping)) return null;
    }
    var named = data.some(function (c) { return !!projectOf(c); });
    var desks = [], byName = {}, seen = {};
    data.forEach(function (c, i) {
      var id = String(c.conversation_id || c.id || "");
      if (!id) id = "at-" + i + "-" + (c.create_time || "");
      if (seen[id]) return;
      seen[id] = 1;
      var msgs = messagesOf(c);
      var first = "";
      msgs.some(function (m) { if (m.role === "user") { first = m.text; return true; } return false; });
      var title = cleanText(c.title, 120) || cleanText(first, 60) || "Untitled chat";
      var name = (named && projectOf(c)) || aiName;
      if (!byName[name]) { byName[name] = { name: name, chats: [] }; desks.push(byName[name]); }
      byName[name].chats.push({ id: id, title: title, createdAt: whenOf(c.create_time), messages: msgs });
    });
    return { provider: "chatgpt", projects: desks };
  }

  // ---- ZIP: find conversations.json with the browser's own inflate ----
  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
  function isZip(b) { return b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4; }
  function zipEntry(b, want) {
    var end = -1;
    for (var i = b.length - 22; i >= 0 && i >= b.length - 65557; i--) { if (u32(b, i) === 0x06054b50) { end = i; break; } }
    if (end < 0) return null;
    var count = u16(b, end + 10), at = u32(b, end + 16), best = null;
    for (var k = 0; k < count && at + 46 <= b.length; k++) {
      if (u32(b, at) !== 0x02014b50) return null;
      var method = u16(b, at + 10), size = u32(b, at + 20), full = u32(b, at + 24);
      var nl = u16(b, at + 28), xl = u16(b, at + 30), cl = u16(b, at + 32), local = u32(b, at + 42);
      var name = "";
      for (var j = 0; j < nl; j++) name += String.fromCharCode(b[at + 46 + j]);
      if ((name === want || name.slice(-want.length - 1) === "/" + want) && (!best || name.length < best.name.length)) {
        best = { name: name, method: method, size: size, full: full, local: local };
      }
      at += 46 + nl + xl + cl;
    }
    if (!best || u32(b, best.local) !== 0x04034b50) return null;
    best.start = best.local + 30 + u16(b, best.local + 26) + u16(b, best.local + 28);
    return best;
  }
  function unzipText(b, want) {
    var e = zipEntry(b, want);
    if (!e) return Promise.resolve({ error: CANT });
    if (e.full > MAX_BYTES) return Promise.resolve({ error: BIG });
    var data = b.subarray(e.start, e.start + e.size);
    if (e.method === 0) return Promise.resolve({ text: new TextDecoder().decode(data) });
    if (e.method !== 8) return Promise.resolve({ error: CANT });
    if (typeof DecompressionStream !== "function" || typeof Response !== "function" || typeof Blob !== "function") return Promise.resolve({ error: NOZIP });
    var stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Response(stream).arrayBuffer().then(function (buf) {
      return { text: new TextDecoder().decode(new Uint8Array(buf)) };
    }, function () { return { error: CANT }; });
  }
  function bytesOf(file) {
    if (file && typeof file.arrayBuffer === "function") return file.arrayBuffer();
    return new Promise(function (ok, no) {
      var r = new FileReader();
      r.onload = function () { ok(r.result); };
      r.onerror = function () { no(r.error); };
      r.readAsArrayBuffer(file);
    });
  }
  function readFile(file) {
    if (!file) return Promise.resolve({ error: CANT });
    if (file.size > MAX_BYTES) return Promise.resolve({ error: BIG });
    return bytesOf(file).then(function (buf) {
      var b = new Uint8Array(buf);
      if (isZip(b)) return unzipText(b, "conversations.json");
      return { text: new TextDecoder().decode(b) };
    }, function () { return { error: CANT }; }).then(function (r) {
      if (r.error) return r;
      var data;
      try { data = JSON.parse(r.text); } catch (e) { return { error: CANT }; }
      var out = parseChatGPT(data, ai ? ai.name : "ChatGPT");
      return out ? { got: out } : { error: CANT };
    });
  }

  // ---- what Yes sends: only ticked chats, in parts under the size caps ----
  function key(d, c) { return d + "\u0000" + c; }
  function ticked() {
    var out = [];
    (got ? got.projects : []).forEach(function (d) {
      var chats = d.chats.filter(function (c) { return !off[key(d.name, c.id)]; });
      if (chats.length) out.push({ name: d.name, chats: chats });
    });
    return out;
  }
  function cardOf(c) {
    var first = c.messages.length ? c.messages[0].text : "";
    return { conversationId: c.id, title: c.title, createdAt: c.createdAt, messageCount: c.messages.length, excerpt: first.slice(0, EXCERPT), messages: c.messages };
  }
  function chunks(desks) {
    var out = [], cur = null, n = 0, size = 0;
    function start() { cur = []; out.push(cur); n = 0; size = 0; }
    start();
    desks.forEach(function (d) {
      var slot = null;
      d.chats.forEach(function (c) {
        var card = cardOf(c), s = JSON.stringify(card).length;
        if (n && (n >= CHUNK_CHATS || size + s > CHUNK_BYTES)) { start(); slot = null; }
        if (!slot) { slot = { name: d.name, chats: [] }; cur.push(slot); }
        slot.chats.push(card);
        n += 1; size += s;
      });
    });
    return out.filter(function (p) { return p.length; });
  }
  function send() {
    if (sending || !got) return;
    var desks = ticked();
    if (!desks.length) { say("Nothing is ticked. Nothing was sent."); return; }
    var list = chunks(desks), total = 0;
    desks.forEach(function (d) { total += d.chats.length; });
    sending = true;
    if (parts.yes) parts.yes.disabled = true;
    say("Sending " + plural(total, "chat", "chats") + "...");
    var i = 0;
    function next() {
      if (i >= list.length) {
        sending = false;
        say("Brought in " + plural(total, "chat", "chats") + " on " + plural(desks.length, "desk", "desks") + ".");
        return;
      }
      var body = { action: "import-ai", provider: got.provider, part: i + 1, parts: list.length, projects: list[i] };
      return fetch("/api/account", { method: "POST", headers: hdr(), body: JSON.stringify(body) }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d || {} }; });
      }, function () { return { ok: false, d: {}, offline: true }; }).then(function (x) {
        if (!x.ok || x.d.ok === false || x.d.saved === false) {
          sending = false;
          if (parts.yes) parts.yes.disabled = false;
          if (i === 0) say(x.offline ? "Could not reach AIA. Nothing was saved." : "AIA could not take these yet. Nothing was saved.");
          else say("Saved " + i + " of " + list.length + " parts. Tap Yes again for the rest.");
          return;
        }
        i += 1;
        return next();
      });
    }
    return next();
  }

  // ---- paint ----
  function ensureCss() {
    if (document.getElementById("bring-ai-css")) return;
    var s = document.createElement("style");
    s.id = "bring-ai-css";
    s.textContent =
      "#acct-bring-ai .bring-ai-steps{list-style:none;margin:0;padding:0}" +
      "#acct-bring-ai .bring-ai-step{margin:0 0 14px}" +
      "#acct-bring-ai .bring-ai-step h3{margin:0 0 6px;font-size:15px}" +
      "#acct-bring-ai .bring-ai-picks{display:flex;flex-wrap:wrap;gap:8px}" +
      "#acct-bring-ai button,#acct-bring-ai .bring-ai-link,#acct-bring-ai .bring-ai-file,#acct-bring-ai .bring-ai-row{min-height:44px;min-width:44px;box-sizing:border-box}" +
      "#acct-bring-ai .bring-ai-link,#acct-bring-ai .bring-ai-file{display:inline-flex;align-items:center;padding:10px 12px}" +
      "#acct-bring-ai .bring-ai-row{display:flex;align-items:center;gap:10px;padding:6px 0}" +
      "#acct-bring-ai .bring-ai-row input{width:22px;height:22px;flex:0 0 auto}" +
      "#acct-bring-ai .bring-ai-drop{border:2px dashed var(--line,#999);border-radius:10px;padding:14px;margin-top:8px}" +
      "#acct-bring-ai .bring-ai-desk{border:1px solid var(--line,#999);border-radius:10px;padding:8px 12px;margin:0 0 10px}" +
      "#acct-bring-ai .bring-ai-chats{margin:0 0 0 18px}" +
      "#acct-bring-ai button[aria-pressed=true]{outline:3px solid var(--orange,#f59e0b)}";
    document.head.appendChild(s);
  }
  function step(n, title) {
    var li = el("li", "bring-ai-step");
    li.appendChild(el("h3", null, n + ". " + title));
    return li;
  }
  function pick(a) {
    ai = a; got = null; off = {};
    paint();
    say(a.reads ? "" : "We can read ChatGPT files today. Get your " + a.name + " export ready; reading it comes later.");
  }
  function take(file) {
    if (!ai || !ai.reads) return;
    got = null; off = {};
    say("Reading the file on this device...");
    return readFile(file).then(function (r) {
      if (r.error) { got = null; paintPreview(); say(r.error); return; }
      got = r.got;
      paintPreview();
      say("");
    });
  }
  function count() {
    var n = 0, d = 0;
    ticked().forEach(function (x) { d += 1; n += x.chats.length; });
    return { chats: n, desks: d };
  }
  function paintCount() {
    var c = count();
    if (parts.sum) parts.sum.textContent = plural(c.chats, "chat", "chats") + " on " + plural(c.desks, "desk", "desks") + " will come in. Each chat becomes one card.";
    if (parts.yes) { parts.yes.textContent = "Yes, bring in " + plural(c.chats, "chat", "chats"); parts.yes.disabled = !c.chats || sending; }
  }
  function box(label, on, run) {
    var row = el("label", "bring-ai-row");
    var i = document.createElement("input");
    i.type = "checkbox";
    i.checked = !!on;
    i.addEventListener("change", function () { run(i.checked); });
    row.appendChild(i);
    row.appendChild(el("span", null, label));
    return row;
  }
  function paintPreview() {
    var host = parts.preview;
    if (!host) return;
    clear(host);
    if (!got) { host.appendChild(el("p", "meta", "Drop a file to see what would come in. Nothing is sent until you tap Yes.")); return; }
    got.projects.forEach(function (d) {
      var desk = el("div", "bring-ai-desk");
      var all = d.chats.every(function (c) { return !off[key(d.name, c.id)]; });
      desk.appendChild(box("Desk: " + d.name + " (" + plural(d.chats.length, "chat", "chats") + ")", all, function (on) {
        d.chats.forEach(function (c) { if (on) delete off[key(d.name, c.id)]; else off[key(d.name, c.id)] = 1; });
        paintPreview();
      }));
      var ul = el("div", "bring-ai-chats");
      d.chats.forEach(function (c) {
        ul.appendChild(box(c.title + " · " + plural(c.messages.length, "message", "messages"), !off[key(d.name, c.id)], function (on) {
          if (on) delete off[key(d.name, c.id)]; else off[key(d.name, c.id)] = 1;
          paintPreview();
        }));
      });
      desk.appendChild(ul);
      host.appendChild(desk);
    });
    parts.sum = el("p", "meta");
    host.appendChild(parts.sum);
    var row = el("div", "bring-ai-yes");
    parts.yes = button("Yes", "go bring-ai-go", function () { send(); });
    row.appendChild(parts.yes);
    row.appendChild(button("Start over", "ghost bring-ai-reset", function () { got = null; off = {}; if (parts.file) parts.file.value = ""; paintPreview(); say("Cleared. Nothing was sent."); }));
    host.appendChild(row);
    paintCount();
  }
  function paint() {
    ensureCss();
    clear(root);
    parts = {};
    root.appendChild(el("h2", null, "Bring your AI"));
    root.appendChild(el("p", "sub", "Bring your chats from another AI. Projects become desks. Each chat becomes one card. We read the file on this device. Nothing is sent until you tap Yes."));
    var ol = el("ol", "bring-ai-steps");
    var s1 = step(1, "Pick your AI");
    var picks = el("div", "bring-ai-picks");
    AIS.forEach(function (a) {
      var b = button(a.name, "edit bring-ai-pick", function () { pick(a); });
      b.setAttribute("aria-pressed", ai === a ? "true" : "false");
      b.setAttribute("data-ai", a.id);
      picks.appendChild(b);
    });
    s1.appendChild(picks);
    ol.appendChild(s1);
    var s2 = step(2, "Get your export");
    if (ai) {
      var a2 = el("a", "bring-ai-link", "Open " + ai.name + "'s export page");
      a2.href = ai.href;
      a2.target = "_blank";
      a2.rel = "noopener noreferrer";
      s2.appendChild(a2);
      s2.appendChild(el("p", "meta", "Ask for your export there. When it arrives, come back here with the file."));
    } else s2.appendChild(el("p", "meta", "Pick your AI first."));
    ol.appendChild(s2);
    var s3 = step(3, "Drop the ZIP or JSON");
    if (ai && ai.reads) {
      var drop = el("div", "bring-ai-drop");
      var lab = el("label", "bring-ai-file edit");
      lab.appendChild(el("span", null, "Pick the file"));
      var input = document.createElement("input");
      input.type = "file";
      input.accept = ".zip,.json,application/zip,application/json";
      input.className = "bring-ai-input";
      input.addEventListener("change", function () { take(input.files && input.files[0]); });
      lab.appendChild(input);
      parts.file = input;
      drop.appendChild(lab);
      drop.appendChild(el("p", "meta", "Or drop the ZIP or conversations.json here."));
      drop.addEventListener("dragover", function (e) { e.preventDefault(); });
      drop.addEventListener("drop", function (e) { e.preventDefault(); var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; take(f); });
      s3.appendChild(drop);
    } else s3.appendChild(el("p", "meta", ai ? "Reading " + ai.name + " files comes later." : "Pick your AI first."));
    ol.appendChild(s3);
    var s4 = step(4, "Check what comes in");
    parts.preview = el("div", "bring-ai-preview");
    s4.appendChild(parts.preview);
    ol.appendChild(s4);
    root.appendChild(ol);
    parts.status = el("p", "meta bring-ai-status");
    parts.status.setAttribute("role", "status");
    root.appendChild(parts.status);
    paintPreview();
  }
  function boot() {
    if (!signedIn()) { root.hidden = true; return; }
    root.hidden = false;
    paint();
  }
  window.AIABringAI = { parse: parseChatGPT, read: readFile, payload: function () { return chunks(ticked()); } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
