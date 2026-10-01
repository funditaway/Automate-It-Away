const params = new URLSearchParams(location.search);
    const embed = window !== window.parent || params.get("embed") === "1";
    if (embed) {
      document.documentElement.classList.add("embed");
      document.body.classList.add("embed");
    }
    if (document.documentElement.classList.contains("widget")) document.body.classList.add("widget");
    let desk = (window.AIADesks && AIADesks.captureDesk) ? AIADesks.captureDesk() : null;
    let ws = (desk && desk.slug) || "";
    if (ws) window.ws = ws;
    let pin = localStorage.getItem("aia_pin") || "";
    let deskOpen = (window.AIADesks && AIADesks.shopOpen) ? !!AIADesks.shopOpen() : !!(ws && (pin || localStorage.getItem("aia_session")));
    const authWs = localStorage.getItem("aia_ws");
    if (deskOpen && ws && authWs && ws !== authWs) deskOpen = false;
    if (deskOpen) document.body.classList.add("desk-open");
    let mode = params.get("mode") || "quick";
    let whoKind = params.get("who") || "helper";
    let FIELDS = [];
    function headers() {
      const h = { "Content-Type": "application/json" };
      if (ws) h["X-Workspace"] = ws;
      if (pin) h["X-Pin"] = pin;
      return h;
    }
    function showMode(next) {
      mode = embed ? "quick" : (next === "agent" ? "agent" : next === "custom" ? "custom" : "quick");
      document.querySelectorAll("#modes button").forEach(function (b) {
        const on = b.getAttribute("data-mode") === mode;
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
      const modesEl = document.getElementById("modes");
      if (modesEl) modesEl.hidden = !!embed;
      const waysEl = document.getElementById("drop-ways");
      if (waysEl) waysEl.hidden = !!embed;
      const agent = mode === "agent";
      document.getElementById("pane-work").hidden = agent;
      document.getElementById("pane-agent").hidden = !agent;
      const customPane = document.getElementById("pane-custom");
      if (customPane) customPane.hidden = mode !== "custom";
      document.getElementById("lane-title").textContent = agent ? "Paste the data. A Desk AI drafts the card. You still tap Yes, then Start." : mode === "custom" ? "Name your own drop. It becomes a card." : "Drop anything. Tap a kind. It becomes a card.";
      document.getElementById("drop-send").textContent = agent ? "Put this on the desk" : "Drop it";
      paintWays(mode);
      if (mode === "custom" && window.AIADropAgent && AIADropAgent.applyQuick) AIADropAgent.applyQuick("custom");
    }
    function paintWays(active) {
      const chips = document.getElementById("ways-chips");
      if (!chips) return;
      chips.querySelectorAll("[data-way]").forEach(function (b) {
        const w = b.getAttribute("data-way");
        const on = w === active || (active === "agent" && w === "agent") || (active === "quick" && w === "quick") || (active === "custom" && w === "custom");
        b.classList.toggle("on", !!on && (w === "quick" || w === "custom" || w === "agent"));
      });
    }
    function goWay(way) {
      if (way === "quick" || way === "custom" || way === "agent") {
        if (window.AIADropSteps && AIADropSteps.go) AIADropSteps.go("card");
        showMode(way);
        const send = document.getElementById("drop-send");
        if (send && send.scrollIntoView) send.scrollIntoView({ block: "nearest", behavior: "smooth" });
        return;
      }
      if (way === "talk") {
        if (window.AIADropSteps && AIADropSteps.go) AIADropSteps.go("tell");
        const bar = document.getElementById("talkBar");
        if (bar) {
          bar.hidden = false;
          if (bar.scrollIntoView) bar.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
        const talk = document.getElementById("talkBtn");
        if (talk) talk.focus();
        return;
      }
      if (way === "files") {
        if (window.AIADropSteps && AIADropSteps.go) AIADropSteps.go("card");
        showMode(mode === "agent" ? "quick" : mode);
        const photo = document.getElementById("photo");
        if (photo) {
          if (photo.scrollIntoView) photo.scrollIntoView({ block: "nearest", behavior: "smooth" });
          try { photo.focus(); } catch (e) {}
        }
        return;
      }
      if (way === "share") {
        if (window.AIADropSteps && AIADropSteps.go) AIADropSteps.go("share");
        const card = document.getElementById("embed-card");
        if (card && card.scrollIntoView) card.scrollIntoView({ block: "nearest", behavior: "smooth" });
        return;
      }
    }
    function esc(s) {
      return String(s || "").replace(/[&<>"']/g, function (c) {
        return ({ "&": "\u0026amp;", "<": "\u0026lt;", ">": "\u0026gt;", "\"": "\u0026quot;", "'": "\u0027" })[c];
      });
    }
    function deskNameOf() {
      return (desk && (desk.name || desk.slug)) || ws || "";
    }
    function shareUrl() {
      return ws ? ("https://www.automateitaway.com/drop?ws=" + encodeURIComponent(ws)) : "";
    }
    function sendLabel() {
      return mode === "agent" ? "Put this on the desk" : "Drop it";
    }
    function showNote(el, text, isHtml) {
      if (!el) return;
      el.style.display = "block";
      if (isHtml) el.innerHTML = text;
      else el.textContent = text;
      if (window.AIADropSteps && AIADropSteps.reveal) AIADropSteps.reveal(el);
      if (el.scrollIntoView) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    function paintDeskOn() {
      const el = document.getElementById("desk-on");
      if (!el) return;
      const name = deskNameOf();
      if (name) {
        el.classList.remove("off");
        el.textContent = "This drop goes to " + name + ". Lands on that queue. You still tap Yes, then Start.";
      } else {
        el.classList.add("off");
        el.textContent = "No desk yet. Pick a saved desk, add one you already opened, or create a new desk.";
      }
    }
    function paintFiles() {
      const photo = document.getElementById("photo");
      const list = document.getElementById("file-list");
      if (!list) return;
      const files = photo && photo.files ? [].slice.call(photo.files, 0, 8) : [];
      if (!files.length) {
        list.textContent = "Optional. Up to 8 files. Each under 8MB.";
        return;
      }
      const bits = files.map(function (f) {
        return f.name + (f.size > 8000000 ? " · too big" : "");
      });
      const over = files.some(function (f) { return f.size > 8000000; });
      list.textContent = files.length + (files.length === 1 ? " file rides on the card: " : " files ride on the card: ") + bits.join(", ") + (over ? ". Each file must stay under 8MB." : ".");
    }
    function paintShare() {
      const el = document.getElementById("drop-link");
      const copyBtn = document.getElementById("share-copy");
      const shareBtn = document.getElementById("share-native");
      const url = shareUrl();
      if (el) el.textContent = url || "Pick a desk first. Then this link appears.";
      if (copyBtn) copyBtn.disabled = !url;
      if (shareBtn) {
        shareBtn.hidden = !url || !navigator.share;
        shareBtn.disabled = !url;
      }
    }
    function paintEmbed() {
      const name = deskNameOf() || "a desk";
      document.getElementById("drop-title").textContent = ws ? ("Drop anything · " + name) : "Drop anything";
      paintDeskOn();
      paintShare();
    }
    async function bootDesk() {
      if (!ws) return;
      try {
        const r = await fetch("/api/auth", { headers: headers() });
        const data = await r.json().catch(function () { return {}; });
        const shop = data.workspace || {};
        if ((shop.biz || shop.name) && desk) desk.name = shop.biz || shop.name;
        FIELDS = shop.fields || [];
        window.__aiaDeskPack = shop.pack ? { id: shop.pack, name: shop.packName || shop.pack } : null;
        if (window.AIADropAgent && AIADropAgent.applyInstalledPack) AIADropAgent.applyInstalledPack(window.__aiaDeskPack);
        const nouns = (window.AIADesks && AIADesks.nounsOf) ? AIADesks.nounsOf(shop.nouns) : null;
        const sub = document.getElementById("drop-sub");
        if (sub && ws && shop.pack) {
          const packName = shop.packName || "This pack";
          const cap = (nouns && nouns.capture && !/^capture$/i.test(nouns.capture)) ? (nouns.capture + " lands here. ") : "";
          sub.textContent = cap + packName + " is on this desk. Drop many easy ways — the queue card already uses that pack. You don't pick a pack each time. You still tap Yes, then Start. Nobody sends money from here.";
        } else if (nouns && nouns.capture && !/^capture$/i.test(nouns.capture)) {
          if (sub && ws) sub.textContent = nouns.capture + " lands here — many easy ways in. You still tap Yes, then Start. Nobody sends money from here.";
        }
      } catch (e) {}
      paintEmbed();
      if (window.AIADropNow && AIADropNow.banner) AIADropNow.banner();
    }
    whoKind = (window.AIADropAgent && AIADropAgent.paintWho(whoKind)) || whoKind;
    const whoBox = document.getElementById("who-chips");
    if (whoBox) whoBox.addEventListener("click", function (e) {
      const btn = e.target.closest("[data-who]");
      if (!btn) return;
      whoKind = btn.getAttribute("data-who");
      AIADropAgent.paintWho(whoKind);
    });
    document.getElementById("modes").hidden = !!embed;
    const waysBox = document.getElementById("drop-ways");
    if (waysBox) waysBox.hidden = !!embed;
    showMode(mode);
    document.getElementById("modes").addEventListener("click", function (e) {
      const btn = e.target.closest("[data-mode]");
      if (btn) showMode(btn.getAttribute("data-mode"));
    });
    const waysChips = document.getElementById("ways-chips");
    if (waysChips) waysChips.addEventListener("click", function (e) {
      const btn = e.target.closest("[data-way]");
      if (btn) goWay(btn.getAttribute("data-way"));
    });
    const implementEl = document.getElementById("implement");
    if (implementEl) implementEl.addEventListener("input", function () {
      if (window.AIADropAgent) AIADropAgent.paintPreview(AIADropAgent.implementFromText(implementEl.value, FIELDS));
    });
    paintEmbed();
    bootDesk();
    const photoEl = document.getElementById("photo");
    if (photoEl) photoEl.addEventListener("change", paintFiles);
    async function attachFiles(item, err) {
      const photo = document.getElementById("photo");
      const picked = photo && photo.files ? [].slice.call(photo.files, 0, 8) : [];
      if (!picked.length) return true;
      for (let i = 0; i < picked.length; i++) {
        if (picked[i].size > 8000000) {
          showNote(err, "Each file must stay under 8MB.");
          return false;
        }
      }
      function readFile(file) {
        return new Promise(function (resolve, reject) {
          const r = new FileReader();
          r.onload = function () { resolve(r.result); };
          r.onerror = reject;
          r.readAsDataURL(file);
        });
      }
      const btn = document.getElementById("drop-send");
      if (btn) btn.textContent = picked.length === 1 ? "Saving file…" : "Saving files…";
      const packed = [];
      for (let j = 0; j < picked.length; j++) {
        packed.push({ name: picked[j].name, type: picked[j].type, data: await readFile(picked[j]) });
      }
      const up = await fetch("/api/upload", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(packed.length === 1 ? packed[0] : { files: packed })
      });
      const data = await up.json().catch(function () { return {}; });
      if (!up.ok) {
        showNote(err, data.error || "File did not save.");
        return false;
      }
      if (data.photoUrl) item.photoUrl = data.photoUrl;
      if (Array.isArray(data.files) && data.files.length) item.files = data.files;
      return true;
    }
    async function send() {
      const ok = document.getElementById("ok");
      const err = document.getElementById("err");
      const btn = document.getElementById("drop-send");
      ok.style.display = "none"; err.style.display = "none";
      if (!ws) { showNote(err, embed ? "This drop is missing a desk." : "Pick a desk above, add a saved one, or create a new desk."); return; }
      const agentOn = mode === "agent";
      const implement = ((document.getElementById("implement") && document.getElementById("implement").value) || "").trim();
      const mapped = (window.AIADropAgent && agentOn) ? AIADropAgent.implementFromText(implement, FIELDS) : {};
      const note = agentOn ? implement : document.getElementById("note").value;
      const title = document.getElementById("title").value || mapped.title || note || ((document.getElementById("custom-name") && document.getElementById("custom-name").value) || "");
      const tell = agentOn ? (((document.getElementById("agent-tell") && document.getElementById("agent-tell").value) || "").trim()) : "";
      if (!String(title || tell || implement).trim()) { showNote(err, agentOn ? "Paste the data to put on the desk." : "Say what you need."); return; }
      const item = {
        action: "capture",
        kind: agentOn ? "note" : document.getElementById("kind").value,
        title: title, from: "widget",
        contactName: document.getElementById("who").value || mapped.contactName,
        phone: document.getElementById("phone").value || mapped.phone,
        email: mapped.email, notes: note, tell: tell,
        implement: agentOn ? implement : undefined,
        mode: agentOn ? "agent" : (mode === "custom" ? "custom" : "quick"),
        droppedByKind: whoKind, whoKind: whoKind, lane: agentOn ? "ops" : "work",
        custom: Object.assign({}, mapped.custom || {}, { mode: agentOn ? "agent" : (mode === "custom" ? "custom" : "quick"), droppedByKind: whoKind })
      };
      if (agentOn && mapped.amount != null) item.amount = mapped.amount;
      if (agentOn && mapped.timing) item.timing = mapped.timing;
      if (btn) { btn.disabled = true; btn.textContent = "Dropping…"; }
      try {
        if (!(await attachFiles(item, err))) return;
        if (btn) btn.textContent = "Dropping…";
        const r = await fetch("/api/jobs", { method: "POST", headers: headers(), body: JSON.stringify(item) });
        const out = await r.json().catch(function () { return {}; });
        if (r.ok) {
          const name = deskNameOf();
          const dropped = String(title || "").trim().slice(0, 80);
          const n = (out.jobs && out.jobs.length) || 1;
          const fan = n > 1 ? (" as " + n + " cards") : "";
          showNote(ok, "On the queue" + fan + (name ? " · " + esc(name) : "") + (dropped ? " · " + esc(dropped) : "") + ". You still tap Yes, then Start" + (n > 1 ? " on each" : "") + ". Nothing silent." + (embed ? "" : " <a href=\"/desk\">Open the queue →</a>"), true);
          if (window.AIASpeech) AIASpeech.speak(n > 1 ? ("On the queue as " + n + " cards.") : "On the queue.");
          document.getElementById("title").value = ""; document.getElementById("note").value = "";
          if (document.getElementById("implement")) document.getElementById("implement").value = "";
          if (document.getElementById("agent-tell")) document.getElementById("agent-tell").value = "";
          if (document.getElementById("photo")) document.getElementById("photo").value = "";
          paintFiles();
          if (window.AIADropAgent) AIADropAgent.paintPreview({});
        } else { showNote(err, out.error || "Could not send."); }
      } catch (ex) { showNote(err, "Could not reach the desk."); }
      finally { if (btn) { btn.disabled = false; btn.textContent = sendLabel(); } }
    }
    document.getElementById("drop-send").addEventListener("click", function () { send(); });
    function copyDropShare() {
      const url = shareUrl();
      const note = document.getElementById("share-ok");
      if (!url) { showNote(note, "Pick a desk first. Then this link appears."); return; }
      function copied() {
        showNote(note, "Drop link copied. Anyone with it can send work to this desk. They never see money, Stop, or People.");
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(copied).catch(function () {
          showNote(note, "Copy the link above.");
        });
        return;
      }
      const el = document.getElementById("drop-link");
      try {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand("copy");
        copied();
      } catch (e) { showNote(note, "Copy the link above."); }
    }
    function shareDrop() {
      const url = shareUrl();
      const note = document.getElementById("share-ok");
      if (!url) { showNote(note, "Pick a desk first. Then this link appears."); return; }
      if (!navigator.share) { copyDropShare(); return; }
      navigator.share({
        title: "Drop on " + (deskNameOf() || "this desk"),
        text: "Drop a task on this desk. You still tap Yes, then Start. Nobody sends money from here.",
        url: url
      }).then(function () {
        showNote(note, "Share sheet opened. Public drop never sees money, Stop, or People.");
      }).catch(function () {});
    }
    const shareCopy = document.getElementById("share-copy");
    const shareNative = document.getElementById("share-native");
    if (shareCopy) shareCopy.addEventListener("click", function () { copyDropShare(); });
    if (shareNative) shareNative.addEventListener("click", function () { shareDrop(); });
    window.copyDropShare = copyDropShare;
    window.AIADropWell = { filesFromInput: function () {
      const photo = document.getElementById("photo");
      return photo && photo.files ? [].slice.call(photo.files, 0, 8) : [];
    }, paint: paintFiles };
    window.AIADropOn = { paint: paintDeskOn, name: deskNameOf };
    window.AIADropWays = { go: goWay, paint: paintWays };
