    const TYPES = [
      { id: "job", name: "Job", hint: "A piece of work in the queue" },
      { id: "capture", name: "Capture", hint: "Photo, call, form — not shipped" },
      { id: "ai", name: "Desk AI", hint: "Name an AI bound to this desk" },
      { id: "pack", name: "Pack", hint: "Search, Use, or install a .aia pack on AIA Internet" },
      { id: "model", name: "Automation", hint: "Your pack. Keep, list, or price it." },
      { id: "teammate", name: "Teammate", hint: "Who can tap on this shop" },
      { id: "rule", name: "Guardrail", hint: "Ask me if…" },
      { id: "workspace", name: "Workspace", hint: "Open another shop" }
    ];
    let kind = "job";
    let advanced = false;
    let PACKS = [];
    let packQ = "";
    let packChip = "all";
    const picks = document.getElementById("picks");
    const form = document.getElementById("form");
    const ok = document.getElementById("ok");
    const err = document.getElementById("err");
    const mine = document.getElementById("mine");
    function headers() {
      const h = { "Content-Type": "application/json" };
      const ws = localStorage.getItem("aia_ws");
      const pin = localStorage.getItem("aia_pin");
      if (ws) h["X-Workspace"] = ws;
      if (pin) h["X-Pin"] = pin;
      return h;
    }
    function deskOpen() {
      if (window.AIADesks && typeof AIADesks.shopOpen === "function") return !!AIADesks.shopOpen();
      return !!(localStorage.getItem("aia_ws") && (localStorage.getItem("aia_session") || localStorage.getItem("aia_pin")));
    }
    function packSelect() {
      return `<label class="adv">Pack</label><select class="adv" name="pack"><option value="">This desk / let the engine pick</option><option value="home">Home</option><option value="consign">Consign</option><option value="vita">Insurance</option><option value="fund">Fund</option><option value="land">Land</option><option value="aia-adoption">AIA · Try it on this desk</option><option value="aia-implement">AIA · Four steps on this desk</option></select>`;
    }
    function kindSelect() {
      return `<label class="adv">What is it?</label><select class="adv" name="dropKind"><option value="task">A task</option><option value="chore">An errand</option><option value="list">A list</option><option value="idea">An idea</option><option value="project">A project</option><option value="build">A build</option><option value="request">A request</option><option value="note">A note</option><option value="call">Missed call</option><option value="message">A message to send</option><option value="pickup">Pickup / drop-off</option><option value="ride">A ride</option><option value="reminder">A reminder</option><option value="book">Book a time</option><option value="form">Form / paper</option><option value="photo">A photo</option><option value="quote">Need a quote</option><option value="follow">Follow up</option><option value="walk-in">Walk-in job</option></select>`;
    }
    function outcomeSelect() {
      return `<label class="adv">Preferred outcome</label><select class="adv" name="outcome"><option value="wait">Owner decides</option><option value="text">Text them</option><option value="email">Email them</option><option value="call">Call them back</option><option value="book">Put it on the calendar</option><option value="hand">Hand it to someone</option><option value="list">Draft a list</option><option value="quote">Draft a quote</option><option value="note">Just keep the note</option></select><p class="hint adv">Draft only. An AI agent or a human still taps Yes or No before anything leaves.</p>`;
    }
    function packRows() {
      const rows = PACKS.filter((p) => {
        if (packChip === "free" && p.priced) return false;
        if (packChip === "official" && !p.official) return false;
        if (packChip === "listed" && p.official) return false;
        if (packChip === "market" && !p.priced) return false;
        if (["home","consign","insurance","fund","land","aia"].indexOf(packChip) >= 0) {
          const blob = [p.id, p.name, p.family, p.aisle].join(" ").toLowerCase();
          if (packChip === "insurance") return blob.indexOf("insurance") >= 0 || blob.indexOf("vita") >= 0 || blob.indexOf("quote") >= 0;
          if (packChip === "aia") return blob.indexOf("aia") >= 0 || p.id === "aia-adoption" || p.id === "aia-implement";
          return blob.indexOf(packChip) >= 0;
        }
        return true;
      });
      if (!rows.length) return `<p class="hint">No pack matches. Try home, consign, insurance, fund, land, or AIA.</p>`;
      return rows.map((p) => {
        const tag = p.priced ? ("Ask $" + p.ask + " · Collect HOLD") : (p.official ? "Free official" : "Free listed");
        const btn = p.wanted
          ? `<a class="use" href="/create?kind=pack&idea=${encodeURIComponent(p.id)}">Make this pack</a>`
          : `<button type="button" data-use="${esc(p.id)}">Use on this desk</button>`;
        return `<div class="pack-row"><b>${esc(p.name)}</b><span class="hint">${esc(p.family)} · ${esc(tag)}</span><p class="hint">${esc(p.does || "")}</p>${btn}</div>`;
      }).join("");
    }
    function packFields() {
      return `<label>Search packs</label><input id="pack-q" name="q" value="${esc(packQ)}" placeholder="find flood · home · oil change"><div class="chips">
        <button type="button" data-chip="all" class="${packChip === "all" ? "on" : ""}">All</button>
        <button type="button" data-chip="official" class="${packChip === "official" ? "on" : ""}">Official</button>
        <button type="button" data-chip="free" class="${packChip === "free" ? "on" : ""}">Free</button>
        <button type="button" data-chip="listed" class="${packChip === "listed" ? "on" : ""}">Listed</button>
        <button type="button" data-chip="market" class="${packChip === "market" ? "on" : ""}">Ask</button>
        <button type="button" data-chip="home" class="${packChip === "home" ? "on" : ""}">Home</button>
        <button type="button" data-chip="consign" class="${packChip === "consign" ? "on" : ""}">Consign</button>
        <button type="button" data-chip="insurance" class="${packChip === "insurance" ? "on" : ""}">Insurance</button>
        <button type="button" data-chip="fund" class="${packChip === "fund" ? "on" : ""}">Fund</button>
        <button type="button" data-chip="land" class="${packChip === "land" ? "on" : ""}">Land</button>
        <button type="button" data-chip="aia" class="${packChip === "aia" ? "on" : ""}">AIA</button>
      </div>
      <div id="pack-list">${packRows()}</div>
      <p class="hint">Packs copy rules onto this desk. They do not send money. A priced pack still installs — Collect stays HOLD until Yes. Download and install use .aia files on AIA Internet. <button type="button" class="ghost" data-copy-link="1">Copy pack link</button></p>
      <label>Install a .aia pack</label>
      <input id="aia-file" type="file" accept=".aia,application/json">
      <p class="cta"><button type="button" class="use" id="install-aia">Install .aia on this desk</button></p>
      <label class="adv">List your own pack</label>
      <input class="adv" name="listName" placeholder="Saturday oil-change lane">
      <label class="adv">What it does</label>
      <input class="adv" name="listDoes" placeholder="Photo in. Draft the title. Wait on payout.">
      <label class="adv">Ask (tag only)</label>
      <input class="adv" name="listAsk" inputmode="decimal" placeholder="Leave blank to list free">`;
    }
    function fields() {
      if (kind === "job") return `<label>What is the work?</label><input name="title" required placeholder="Grocery list · porch idea · Friday ride"><label>Notes</label><textarea name="notes" rows="3" placeholder="Anything this desk should run"></textarea>${packSelect()}${kindSelect()}${outcomeSelect()}<label class="adv">Ask / amount</label><input class="adv" name="amount" inputmode="decimal" placeholder="85"><label class="adv">When</label><input class="adv" name="timing" placeholder="Friday 3pm"><label class="adv">Hand to</label><input class="adv" name="assignee" placeholder="Name already on People"><label class="adv">Custom fields</label><input class="adv" name="customLine" placeholder="Patient: Rex, due date: Friday"><label class="adv">Tell AIA</label><textarea class="adv" name="tell" rows="2" placeholder="What Worker and Doer should know before they draft"></textarea>`;
      if (kind === "capture") return `<label>What came in?</label><textarea name="notes" rows="3" required placeholder="Photo of the porch lamp, pickup Thursday"></textarea>${kindSelect()}${outcomeSelect()}<label class="adv">From</label><input class="adv" name="from" placeholder="Counter · Thursday"><label class="adv">I am</label><select class="adv" name="whoKind"><option value="helper">Helper</option><option value="family">Family</option><option value="friend">Friend</option><option value="staff">Staff</option></select><label class="adv">Name</label><input class="adv" name="contactName" placeholder="Taylor"><label class="adv">Phone</label><input class="adv" name="phone" placeholder="417-555-0100"><label class="adv">When</label><input class="adv" name="timing" placeholder="Thursday 3pm"><label class="adv">Tell AIA</label><textarea class="adv" name="tell" rows="2" placeholder="Not shipped. Qualify first."></textarea>`;
      if (kind === "ai") {
        if (!deskOpen()) {
          return `<p class="aia-line off">Open or unlock this desk first. A desk AI binds to this desk — not a stranger form. Name it here after the desk is open, or in Creators Studio.</p>
      <p class="cta"><a class="use" href="/desk">Open this desk</a><a class="use ghost" href="/onboard">Unlock this desk</a><a class="use ghost" href="/studio">Name a desk AI in Studio</a></p>
      <p class="hint">Yes / Stop / Kill stay human. Collect stays HOLD. No silent money or mail.</p>`;
        }
        return `<label>Name this desk AI</label><input name="name" required placeholder="James’s AI"><label>AIA Internet name</label><input name="aia" placeholder="james.aia"><label>Role</label><select name="role"><option>Doer</option><option>Worker</option><option>Rail</option><option>Packer</option><option>Mapper</option></select><label>What it drafts</label><input name="does" placeholder="Drafts desk work for this project"><label>Steps it may draft</label><input name="steps" placeholder="qualify, do, follow"><label>Draft line</label><textarea name="prompt" rows="2" placeholder="Do not send. Do not invent money. Wait on Yes."></textarea><p class="hint">Bound to this desk on AIA Internet as a .aia name. Never Yes, Stop, money, or mail. Collect stays HOLD. Pack it in Studio to list or keep private. Wallet / registry connect later as a Pipe HOLD.</p>`;
      }
      if (kind === "pack") return packFields();
      if (kind === "model") return `<label>Name this automation</label><input name="name" required placeholder="Lawn route"><label>What the desk does</label><input name="does" placeholder="Call in → schedule → invoice"><label>Share</label><select name="share"><option value="private">This desk only</option><option value="listed">Public — show in pack search</option><option value="market">Market — set an ask</option></select><label>Ask if this is a market pack</label><input name="price" inputmode="decimal" placeholder="0 means free. No card taken today."><p class="hint">Listed packs are free in search. A market ask is a tag. AIA does not take a card for packs yet.</p><label class="adv">How unique is it?</label><select class="adv" name="complexity"><option value="simple">Simple — same five steps</option><option value="custom">Custom — this desk only</option><option value="unique">Unique — own fields</option><option value="complex">Complex — fields + a first card</option></select><label class="adv">Fields on a card</label><input class="adv" name="fields" placeholder="Patient, due date, ask"><label class="adv">First card on the queue</label><input class="adv" name="firstWork" placeholder="Recall Rex Friday">`;
      if (kind === "teammate") return `<label>Name</label><input name="name" required placeholder="Sam"><label>Who they are</label><select name="kind"><option value="helper">Helper</option><option value="family">Family</option><option value="friend">Friend</option><option value="staff">Staff</option></select><label>Their desk code</label><input name="pin" required inputmode="numeric" minlength="4" placeholder="4+ digits"><label class="adv">Phone</label><input class="adv" name="phone" inputmode="tel" placeholder="417-555-0100"><label class="adv">Email</label><input class="adv" name="email" inputmode="email" placeholder="sam@shop.com">`;
      if (kind === "rule") return `<label>Ask me if…</label><input name="text" required placeholder="Ask me if money out waits on the owner"><label>When · Trigger</label><select name="when"><option value="drop">Drop</option><option value="pipe">Pipe event</option><option value="inbound">Inbound name@account.aia</option><option value="status">Status change</option><option value="qualify">Qualify</option></select><label>If · tagged</label><input name="ifTag" placeholder="Lead"><label>If the card contains</label><input name="contains" placeholder="click, international"><label>Then · Action</label><select name="then"><option value="draft">Desk AI drafts</option><option value="queue">Queue card / alert</option><option value="notify">Notify — draft HOLD</option><option value="tag">Tag the card</option><option value="escalate">Escalate priority</option><option value="wait">Wait for owner</option><option value="stop">Stop</option><option value="note">Note only</option></select><label>Then tag</label><input name="tag" placeholder="Interested"><label class="adv">If money is at least</label><input class="adv" name="ifMoney" inputmode="decimal" placeholder="Leave blank unless this is a money wait"><label class="adv">If field</label><input class="adv" name="ifField" placeholder="city"><label class="adv">equals or has</label><input class="adv" name="ifValue" placeholder="international"><p class="hint">One When → If → Then on this desk. A pack workflow strings rules. Collect stays HOLD.</p>`;
      return `<label>Your name</label><input name="name" required><label>Desk name</label><input name="biz" required placeholder="Rivera Resale"><label>Desk code</label><input name="pin" required inputmode="numeric" minlength="4"><label class="adv">City</label><input class="adv" name="city" placeholder="Springfield"><label class="adv">What this desk is for</label><input class="adv" name="model" placeholder="Trades"><label class="adv">Fields on a card</label><input class="adv" name="fields" placeholder="Job, when, ask"><label class="adv">First card</label><input class="adv" name="firstWork" placeholder="First thing on the queue">`;
    }
    function goLabel() {
      if (kind === "job") return "Put the job on the queue";
      if (kind === "capture") return "Capture it — not shipped";
      if (kind === "ai") return "Bind this AI to the desk";
      if (kind === "pack") return "List this pack";
      if (kind === "model") return "Save this automation";
      if (kind === "teammate") return "Add this teammate";
      if (kind === "rule") return "Add this guardrail";
      if (kind === "workspace") return "Open this shop";
      return "Save";
    }
    function renderPicks() {
      picks.innerHTML = TYPES.map(t => "<button type=\"button\" class=\"pick " + (t.id === kind ? "on" : "") + "\" data-kind=\"" + t.id + "\"><b>" + t.name + "</b><span>" + t.hint + "</span></button>").join("");
      const gated = kind === "ai" && !deskOpen();
      form.innerHTML = fields() + (gated ? "" : "<button class=\"go\" type=\"submit\">" + goLabel() + "</button>") + "<p class=\"hint\">Same five steps: Capture, Qualify, Do, Collect, Follow. You still tap Yes or No on anything that needs a yes or no from an AI agent or a human.</p>";
      ok.style.display = "none"; err.style.display = "none";
      wirePackSearch();
    }
    function wirePackSearch() {
      const q = document.getElementById("pack-q");
      if (!q) return;
      q.addEventListener("input", () => {
        packQ = q.value || "";
        loadPacks();
      });
    }
    function setMode(on) {
      advanced = !!on;
      document.body.classList.toggle("show-adv", advanced);
      document.getElementById("mode-simple").classList.toggle("on", !advanced);
      document.getElementById("mode-advanced").classList.toggle("on", advanced);
    }
    function esc(s) {
      return String(s || "").replace(/[&<>\"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\\\"":"&quot;","'":"&#39;" }[c]));
    }
    picks.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-kind]"); if (!btn) return;
      kind = btn.getAttribute("data-kind"); renderPicks();
      if (kind === "pack") loadPacks();
    });
    document.querySelector(".modes").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-mode]"); if (!btn) return;
      setMode(btn.getAttribute("data-mode") === "advanced");
    });
    form.addEventListener("click", async (e) => {
      const chip = e.target.closest("[data-chip]");
      if (chip) {
        packChip = chip.getAttribute("data-chip");
        renderPicks();
        return;
      }
      const use = e.target.closest("[data-use]");
      if (use) {
        e.preventDefault();
        await usePack(use.getAttribute("data-use"));
        return;
      }
      const preview = e.target.closest("[data-preview]");
      if (preview) {
        e.preventDefault();
        await usePack(preview.getAttribute("data-preview"), true);
        return;
      }
      const unlist = e.target.closest("[data-unlist]");
      if (unlist) {
        e.preventDefault();
        await unlistPack(unlist.getAttribute("data-unlist"));
        return;
      }
      const copy = e.target.closest("[data-copy-link]");
      if (copy) {
        e.preventDefault();
        const url = location.origin + "/market?kind=pack&q=" + encodeURIComponent(packQ || "");
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).catch(function(){});
        done("Pack link copied. Open /market to search.");
        return;
      }
      const buy = e.target.closest("[data-buy]");
      if (buy) {
        e.preventDefault();
        await usePack(buy.getAttribute("data-buy"));
        return;
      }
      const inst = e.target.closest("#install-aia");
      if (inst) {
        e.preventDefault();
        await installAiaFile();
      }
    });
    function fail(msg) { err.style.display = "block"; err.textContent = msg; ok.style.display = "none"; }
    function done(msg) { ok.style.display = "block"; ok.innerHTML = msg + ' <a href="desk.html">Open the desk →</a>'; err.style.display = "none"; form.reset(); }
    function parseCustom(line) {
      const custom = {};
      String(line || "").split(/[,;]+/).forEach((part) => {
        const m = part.split(":"); if (m.length < 2) return;
        const key = m[0].trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const val = m.slice(1).join(":").trim();
        if (key && val) custom[key] = val;
      });
      return custom;
    }
    async function loadPacks() {
      try {
        const q = String(packQ || "").replace(/^find\\s+/i, "").trim();
        const r = await fetch("/api/desks?packs=1&q=" + encodeURIComponent(q), { headers: headers() });
        const data = await r.json().catch(() => ({}));
        PACKS = data.packs || [];
        const box = document.getElementById("pack-list");
        if (box) box.innerHTML = packRows();
        if (mine) {
          const mineRows = PACKS.filter((p) => !p.official);
          if (mineRows.length) {
            mine.style.display = "block";
            mine.innerHTML = "<p class=\"hint\">Listed from desks</p>" + mineRows.map((p) => "<p><b>" + esc(p.name) + "</b> · " + (p.priced ? ("ask $" + p.ask) : "free") + ' <button type="button" class="ghost" data-unlist="' + esc(p.id) + '">Unlist</button></p>').join("");
          } else mine.style.display = "none";
        }
      } catch (e) {
        PACKS = [];
      }
    }
    async function unlistPack(id) {
      const r = await fetch("/api/desks", { method: "POST", headers: headers(), body: JSON.stringify({ action: "unlist-pack", id }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return fail(data.error || "Could not unlist that pack.");
      await loadPacks();
      done(data.note || "Pack is private again.");
    }
    async function usePack(id, preview) {
      const r = await fetch("/api/desks", { method: "POST", headers: headers(), body: JSON.stringify({ action: preview ? "preview-pack" : "use-pack", id }) });
      const data = await r.json().catch(() => ({}));
      if (r.status === 409) return fail(data.error || "Make this pack first.");
      if (!r.ok) return fail(data.error || "Could not put that pack on this desk.");
      const hold = data.collectHold && data.collectHold.note ? " " + data.collectHold.note : "";
      done((data.note || "Pack is on this desk.") + " Rules added: " + (data.added || 0) + "." + hold);
    }
    async function installAiaFile() {
      const input = document.getElementById("aia-file");
      const file = input && input.files && input.files[0];
      if (!file) return fail("Pick a .aia pack file first.");
      if (file.name && !/\.aia$/i.test(file.name)) return fail("Use a .aia pack file.");
      let parsed;
      try { parsed = JSON.parse(await file.text()); } catch (e) { return fail("That .aia file is not JSON."); }
      const r = await fetch("/api/desks", { method: "POST", headers: headers(), body: JSON.stringify({ action: "install-aia", filename: file.name, pack: parsed }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return fail(data.error || "Could not install that .aia pack.");
      done((data.note || "Installed .aia onto this desk.") + " Rules added: " + (data.added || 0) + ".");
    }
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const go = form.querySelector(".go");
      if (go) go.disabled = true;
      try {
        if (kind === "ai") {
          if (!deskOpen()) return fail("Open or unlock this desk first.");
          const name = String(f.get("name") || "").trim();
          if (!name) return fail("Name the desk AI first.");
          const r = await fetch("/api/desks", { method: "POST", headers: headers(), body: JSON.stringify({ action: "save-ai", name: name, aia: f.get("aia") || "", role: f.get("role") || "Doer", does: f.get("does") || "", prompt: f.get("prompt") || "", steps: f.get("steps") || "qualify, do, follow" }) });
          const data = await r.json().catch(() => ({}));
          if (!r.ok) return fail(data.error || "Could not bind that AI.");
          return done((data.note || (name + " is bound to this desk.")) + " Guardrails: Yes / Stop / Kill stay human. Pack it in Studio to list or keep private.");
        }
        if (kind === "pack") {
          const name = String(f.get("listName") || "").trim();
          if (!name) return fail("Name the pack to list, or tap Use on a free pack.");
          const r = await fetch("/api/desks", { method: "POST", headers: headers(), body: JSON.stringify({ action: "list-pack", name, does: f.get("listDoes") || "", ask: f.get("listAsk") || 0 }) });
          const data = await r.json().catch(() => ({}));
          if (!r.ok) return fail(data.error || "Could not list that pack.");
          await loadPacks();
          return done(data.note || "Pack is listed. Collect stays HOLD. No silent charge.");
        }
        if (kind === "job" || kind === "capture") {
          const title = kind === "job" ? (f.get("title") || f.get("notes")) : (f.get("notes") || "");
          if (!String(title || "").trim()) return fail("Say what to put on the queue.");
          const custom = parseCustom(f.get("customLine"));
          if (f.get("outcome")) custom.outcome = f.get("outcome");
          const body = {
            action: "capture", title: String(title).slice(0, 160),
            pack: f.get("pack") || undefined, amount: f.get("amount") || undefined, timing: f.get("timing") || undefined,
            notes: f.get("notes") || "", tell: f.get("tell") || "",
            kind: f.get("dropKind") || (kind === "capture" ? "note" : "request"),
            outcome: f.get("outcome") || "wait", wanted: f.get("outcome") || "wait",
            from: f.get("from") || "create", contactName: f.get("contactName") || "", phone: f.get("phone") || "",
            assignee: f.get("assignee") || "", droppedByKind: f.get("whoKind") || undefined, whoKind: f.get("whoKind") || undefined,
            custom: custom, whoTapped: localStorage.getItem("aia_name") || "desk"
          };
          const r = await fetch("/api/jobs", { method: "POST", headers: headers(), body: JSON.stringify(body) });
          const data = await r.json().catch(() => ({}));
          if (!r.ok) return fail(data.error || "Could not put that on the queue.");
          return done(kind === "capture" ? "Captured. Not shipped. Qualify first. You still tap Yes or No." : "Job is on the queue. Same five steps. You still tap Yes or No.");
        }
        if (kind === "model") {
          const r = await fetch("/api/auth", { method: "POST", headers: headers(), body: JSON.stringify({ action: "create", kind: "model", complexity: f.get("complexity") || (advanced ? "custom" : "simple"), name: f.get("name"), does: f.get("does"), fields: f.get("fields"), firstWork: f.get("firstWork"), share: f.get("share") || "private", price: f.get("price") || 0 }) });
          const data = await r.json().catch(() => ({}));
          if (!r.ok) return fail(data.error || "Could not save that creation.");
          if (f.get("name")) localStorage.setItem("aia_model", f.get("name"));
          const share = f.get("share") || "private";
          let extra = share === "listed" ? " Listed in pack search." : share === "market" ? " Market ask is on the listing. No card taken." : " This desk only.";
          if (share === "listed" || share === "market") {
            const listed = await fetch("/api/desks", { method: "POST", headers: headers(), body: JSON.stringify({ action: "list-pack", name: f.get("name"), does: f.get("does") || "", ask: share === "market" ? (f.get("price") || 0) : 0 }) });
            const pack = await listed.json().catch(() => ({}));
            if (!listed.ok) extra = " Saved on this desk. " + (pack.error || "Could not list it for search.");
            else extra = " " + (pack.note || extra);
          }
          return done((data.job ? "Automation saved. First card is on the queue." : "This automation is on the desk.") + extra + " You still tap Yes or No.");
        }
        if (kind === "teammate") {
          const r = await fetch("/api/auth", { method: "POST", headers: headers(), body: JSON.stringify({ action: "invite", name: f.get("name"), role: "employee", kind: f.get("kind") || "helper", pin: f.get("pin"), phone: f.get("phone") || "", email: f.get("email") || "" }) });
          const data = await r.json().catch(() => ({}));
          if (!r.ok) return fail(data.error || "Could not add that person.");
          return done("Teammate can open this shop with their own code. Same queue. They tap work. They do not send money.");
        }
        if (kind === "rule") {
          const r = await fetch("/api/rules", { method: "POST", headers: headers(), body: JSON.stringify({ action: "add", text: f.get("text"), when: f.get("when") || "drop", then: f.get("then") || "draft", ifMoney: f.get("ifMoney"), contains: f.get("contains"), ifField: f.get("ifField"), ifValue: f.get("ifValue"), ifTag: f.get("ifTag"), tag: f.get("tag") }) });
          const data = await r.json().catch(() => ({}));
          if (!r.ok) return fail(data.error || "Could not add that rule.");
          return done("Guardrail is on. Ask me if… New cards honor it. You still tap Yes or No.");
        }
        const pin = String(f.get("pin") || "");
        if (pin.length < 4) return fail("Pick a desk code with at least 4 digits.");
        const slug = String(f.get("biz") || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
        const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json", "X-Workspace": slug, "X-Pin": pin }, body: JSON.stringify({ action: "open", name: f.get("name"), biz: f.get("biz"), city: f.get("city"), model: f.get("model") || "Something else", customName: f.get("model") || "", fields: f.get("fields"), firstWork: f.get("firstWork"), pin }) });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) return fail(data.error || "Could not open that desk.");
        localStorage.setItem("aia_ws", slug); localStorage.setItem("aia_pin", pin); localStorage.setItem("aia_role", "owner"); localStorage.setItem("aia_name", f.get("name") || ""); localStorage.setItem("aia_desk_name", String(f.get("biz") || slug));
        return done("Workspace is open. Same five steps on this shop. Drop work next.");
      } catch (ex) { fail("Could not reach the desk."); }
      finally { if (go) go.disabled = false; }
    });
    let startDraft = null;
    let grokOn = false;
    function startBody() {
      const what = String((document.getElementById("start-what") || {}).value || "").trim();
      const dropKind = String((document.getElementById("start-kind") || {}).value || "task");
      return {
        title: what.slice(0, 160),
        notes: what,
        kind: dropKind,
        dropKind: dropKind,
        from: "create",
        outcome: "wait",
        wanted: "wait",
        whoTapped: localStorage.getItem("aia_name") || "desk"
      };
    }
    function paintCites(el, rows) {
      if (!el) return;
      const links = (rows || []).map(function (c) {
        if (!c) return "";
        const url = String(typeof c === "string" ? c : (c.url || "")).trim();
        if (!/^https?:\/\//i.test(url)) return "";
        const title = String((c && c.title) || url).slice(0, 80);
        return "<a href=\"" + esc(url) + "\" target=\"_blank\" rel=\"noopener\">" + esc(title) + "</a>";
      }).filter(Boolean);
      el.classList.toggle("on", !!links.length);
      el.innerHTML = links.join("");
    }
    async function paintAia() {
      const el = document.getElementById("aia-line");
      if (!el) return;
      try {
        const r = await fetch("/api/health");
        const h = await r.json().catch(function () { return {}; });
        const g = h && h.automation && h.automation.grok;
        grokOn = !!(g && g.on);
        el.classList.toggle("off", !grokOn);
        el.textContent = grokOn
          ? "Grok drafts are on. They land on the card. You still tap Yes or Stop. AIA does not send."
          : "Drafts are off — no XAI_API_KEY on this box. Orange copy only. You can still put work on the queue.";
      } catch (e) {
        grokOn = false;
        el.classList.add("off");
        el.textContent = "Could not reach this box. Drafts stay off. You can still put work on the queue.";
      }
    }
    function showStartDraft(data) {
      const box = document.getElementById("start-draft-box");
      const decide = document.getElementById("start-decide");
      const cites = document.getElementById("start-cites");
      if (!box || !decide) return;
      startDraft = data || null;
      const text = data && (data.draft || data.next);
      if (text) {
        box.classList.add("on");
        box.textContent = text + (data.next && data.draft && data.next !== data.draft ? "\n\nNext: " + data.next : "");
        decide.hidden = false;
      } else {
        box.classList.add("on");
        box.textContent = (data && data.note) || (grokOn
          ? "No draft this time. You can still put the work on the queue."
          : "Drafts are off. No invented copy. Put the work on the queue, or Stop.");
        decide.hidden = false;
      }
      paintCites(cites, data && data.citations);
    }
    function clearStartDraft() {
      startDraft = null;
      const box = document.getElementById("start-draft-box");
      const decide = document.getElementById("start-decide");
      const cites = document.getElementById("start-cites");
      if (box) { box.classList.remove("on"); box.textContent = ""; }
      if (decide) decide.hidden = true;
      paintCites(cites, []);
    }
    async function suggestStart() {
      const body = startBody();
      if (!body.title) return fail("Say what the desk should do.");
      const go = document.getElementById("start-draft");
      if (go) go.disabled = true;
      try {
        const r = await fetch("/api/jobs", { method: "POST", headers: headers(), body: JSON.stringify(Object.assign({ action: "suggest" }, body)) });
        const data = await r.json().catch(function () { return {}; });
        if (r.status === 400 && /Open a desk first/i.test(data.error || "")) return fail("Open a desk on this phone first.");
        if (!r.ok) return fail(data.error || "Could not ask the desk.");
        showStartDraft(data);
        if (data.grok === "no-key" || data.grok === "off") {
          const line = document.getElementById("aia-line");
          if (line) { line.classList.add("off"); line.textContent = data.note || "Drafts are off — no XAI_API_KEY on this box. Orange copy only."; }
        }
      } catch (e) {
        fail("Could not reach the desk.");
      } finally {
        if (go) go.disabled = false;
      }
    }
    async function queueStart(useDraft) {
      const body = startBody();
      if (!body.title) return fail("Say what the desk should do.");
      if (useDraft && startDraft) {
        if (startDraft.draft) body.draft = startDraft.draft;
        if (startDraft.next) body.why = startDraft.next;
        if (startDraft.citations && startDraft.citations.length) body.citations = startDraft.citations;
        if (startDraft.recs) body.recs = startDraft.recs;
      }
      const go = document.getElementById("start-queue");
      const yes = document.getElementById("start-yes");
      if (go) go.disabled = true;
      if (yes) yes.disabled = true;
      try {
        const r = await fetch("/api/jobs", { method: "POST", headers: headers(), body: JSON.stringify(Object.assign({ action: "capture" }, body)) });
        const data = await r.json().catch(function () { return {}; });
        if (r.status === 400 && /Open a desk first/i.test(data.error || "")) return fail("Open a desk on this phone first.");
        if (!r.ok) return fail(data.error || "Could not put that on the queue.");
        clearStartDraft();
        document.getElementById("start-what").value = "";
        return done("On the queue. Same Drop card. You still tap Yes or Stop.");
      } catch (e) {
        fail("Could not reach the desk.");
      } finally {
        if (go) go.disabled = false;
        if (yes) yes.disabled = false;
      }
    }
    function wireStart() {
      const draft = document.getElementById("start-draft");
      const queue = document.getElementById("start-queue");
      const yes = document.getElementById("start-yes");
      const stop = document.getElementById("start-stop");
      if (draft) draft.addEventListener("click", function () { suggestStart(); });
      if (queue) queue.addEventListener("click", function () { queueStart(false); });
      if (yes) yes.addEventListener("click", function () { queueStart(true); });
      if (stop) stop.addEventListener("click", function () { clearStartDraft(); });
    }
    (function boot() {
      const params = new URLSearchParams(location.search);
      const want = params.get("kind") || (location.hash || "").replace("#", "");
      if (want === "pack" || want === "packs" || want === "market") kind = "pack";
      if (want === "ai" || want === "desk-ai") kind = "ai";
      if (want === "automation" || want === "model") kind = "model";
      renderPicks();
      setMode(false);
      if (kind === "pack") loadPacks();
      wireStart();
      paintAia();
    })();
