/* Creators Studio. Same login. Packs never Send, Stop, or pay. */
(function () {
  var view = document.getElementById("view");
  var errEl = document.getElementById("err");
  var okEl = document.getElementById("ok");
  if (!view) return;

  var tab = "home";
  var creator = false;
  var grokOn = false;
  var grokDraft = null;
  var formState = {};

  function slugify(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
  function hdr() {
    var h = { "Content-Type": "application/json" };
    var ws = localStorage.getItem("aia_ws") || "";
    var pin = localStorage.getItem("aia_pin") || "";
    var tok = localStorage.getItem("aia_session") || "";
    if (ws) h["X-Workspace"] = slugify(ws);
    if (tok) h["X-Session"] = tok;
    else if (pin) h["X-Pin"] = pin;
    return h;
  }
  function show(msg, good) {
    if (okEl) { okEl.style.display = good ? "block" : "none"; if (good) okEl.textContent = msg; }
    if (errEl) { errEl.style.display = good ? "none" : "block"; if (!good) errEl.textContent = msg; }
  }
  function val(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || "").trim() : "";
  }
  function snap() {
    view.querySelectorAll("input,select,textarea").forEach(function (el) {
      if (el.id) formState[el.id] = el.value;
    });
  }
  function restore() {
    Object.keys(formState).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = formState[id];
    });
  }
  function parseWorkflows(raw) {
    var t = String(raw || "").trim();
    if (!t) return [];
    try {
      var parsed = JSON.parse(t);
      return Array.isArray(parsed) ? parsed : (parsed && (parsed.workflows || parsed.sequences || parsed.rules) ? [].concat(parsed.workflows || parsed.sequences || [parsed]) : []);
    } catch (e) {
      return t.split(/\n+/).map(function (line) {
        line = String(line || "").trim();
        if (!line) return null;
        return { name: line.slice(0, 80), rules: [{ text: line.slice(0, 140) }] };
      }).filter(Boolean);
    }
  }
  function parseFields(line) {
    return String(line || "").split(/[,;\n]+/).map(function (part) {
      var bits = part.split(":");
      var label = String(bits[0] || "").trim();
      if (!label) return null;
      var type = String(bits[1] || "text").trim().toLowerCase();
      if (type !== "number" && type !== "yesno") type = "text";
      return { label: label.slice(0, 40), type: type };
    }).filter(Boolean);
  }
  function aisFromForm() {
    var out = [];
    var n1 = val("ai1-name") || formState["ai1-name"] || val("bot1-name") || formState["bot1-name"];
    if (n1) out.push({
      name: n1,
      aia: val("ai1-aia") || formState["ai1-aia"] || "",
      role: val("ai1-role") || formState["ai1-role"] || val("bot1-crew") || formState["bot1-crew"] || "Doer",
      does: val("ai1-does") || formState["ai1-does"] || val("bot1-does") || formState["bot1-does"] || "",
      prompt: val("ai1-prompt") || formState["ai1-prompt"] || val("bot1-prompt") || formState["bot1-prompt"] || "",
      steps: val("ai1-steps") || formState["ai1-steps"] || "qualify, do, follow",
      deny: ["send", "stop", "money", "mail", "yes", "kill"],
      draftOnly: true,
      bound: "desk"
    });
    var n2 = val("ai2-name") || formState["ai2-name"] || val("bot2-name") || formState["bot2-name"];
    if (n2) out.push({
      name: n2,
      aia: val("ai2-aia") || formState["ai2-aia"] || "",
      role: val("ai2-role") || formState["ai2-role"] || val("bot2-crew") || formState["bot2-crew"] || "Worker",
      does: val("ai2-does") || formState["ai2-does"] || val("bot2-does") || formState["bot2-does"] || "",
      prompt: val("ai2-prompt") || formState["ai2-prompt"] || val("bot2-prompt") || formState["bot2-prompt"] || "",
      steps: val("ai2-steps") || formState["ai2-steps"] || "qualify, follow",
      deny: ["send", "stop", "money", "mail", "yes", "kill"],
      draftOnly: true,
      bound: "desk"
    });
    return out.slice(0, 3);
  }
  function bots() {
    return aisFromForm().map(function (a) {
      return { name: a.name, crew: a.role, prompt: a.prompt, does: a.does, draftOnly: true, never: a.deny };
    });
  }
  function packBody(extra) {
    return Object.assign({
      name: val("name") || formState.name || "",
      aia: val("pack-aia") || formState["pack-aia"] || "",
      niche: val("niche") || formState.niche || "",
      family: val("niche") || formState.niche || "",
      does: val("does") || formState.does || "",
      fields: parseFields(val("fields") || formState.fields || ""),
      kinds: val("kinds") || formState.kinds || "",
      rules: (val("rule") || formState.rule) ? [{ text: val("rule") || formState.rule }] : [],
      workflows: parseWorkflows(val("workflows") || formState.workflows || ""),
      ask: Number(val("ask") || formState.ask || 0) || 0,
      bots: bots(),
      ais: aisFromForm(),
      dropHint: val("drop-hint") || formState["drop-hint"] || "",
      dropForm: { hint: val("drop-hint") || formState["drop-hint"] || "", kinds: val("drop-kinds") || formState["drop-kinds"] || "", public: false },
      pipes: val("pipes") || formState.pipes || "",
      ext: val("ext") || formState.ext || "",
      handTo: val("hand-to") || formState["hand-to"] || "",
      queue: {
        badge: val("q-badge") || formState["q-badge"] || "",
        empty: val("q-empty") || formState["q-empty"] || "",
        group: val("q-group") || formState["q-group"] || "none",
        sort: val("q-sort") || formState["q-sort"] || "cap-first",
        chips: val("q-chips") || formState["q-chips"] || "",
        taps: val("q-taps") || formState["q-taps"] || "copy,text,email,hand,cap",
        never: ["send", "stop", "pay", "bind"]
      },
      authoredBy: formState.authoredBy || "",
      creatorId: formState.authoredBy === "grok" ? "grok" : undefined,
      status: "draft"
    }, extra || {});
  }
  async function post(action, extra) {
    snap();
    var r = await fetch("/api/desks", { method: "POST", headers: hdr(), body: JSON.stringify(Object.assign(packBody(extra), { action: action })) });
    var d = await r.json().catch(function () { return {}; });
    return { ok: r.ok, status: r.status, data: d };
  }
  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  function tabs() {
    return [
      ["home", "Home"],
      ["grok", "Grok"],
      ["pack", "Pack"],
      ["ais", "Desk AIs"],
      ["mail", "Mail"],
      ["drop", "Drop form"],
      ["queue", "Queue"],
      ["pipes", "Pipes"],
      ["ext", "Ext"],
      ["test", "Test"],
      ["submit", "Submit"]
    ].map(function (row) {
      return "<button type=\"button\" data-tab=\"" + row[0] + "\" class=\"" + (tab === row[0] ? "on" : "") + "\">" + row[1] + "</button>";
    }).join("");
  }

  function pane() {
    if (tab === "grok") return (
      "<div class=\"card\"><h2>Ask Grok</h2>" +
      "<p class=\"hint\">Included drafter — Grok’s AIA Studio seat on this same account. Not a second SKU. Helps build named desk AIs and packs. Can list an ask; Collect stays HOLD. Never Send, Stop, or pay. Never auto-mail. You tap Yes to put the draft on Pack and Desk AIs, or Stop to discard it.</p>" +
      "<p class=\"aia-line\" id=\"aia-line\">Checking drafts…</p>" +
      "<label>What should this pack do?</label>" +
      "<textarea id=\"grok-brief\" rows=\"4\" placeholder=\"Saturday oil-change lane. Photo in. Draft the title. Wait on payout.\"></textarea>" +
      "<p class=\"cta\"><button class=\"go\" type=\"button\" id=\"ask-grok\">Ask Grok</button></p>" +
      "<div class=\"draft\" id=\"grok-draft-box\"></div>" +
      "<div class=\"cta\" id=\"grok-decide\" hidden>" +
        "<button class=\"go yes\" type=\"button\" id=\"grok-yes\">Yes · put it on Pack</button>" +
        "<button class=\"go stop\" type=\"button\" id=\"grok-stop\">Stop</button>" +
      "</div></div>"
    );
    if (tab === "pack") return (
      "<div class=\"card\"><h2>The pack</h2>" +
      "<label>Pack name</label><input id=\"name\" placeholder=\"Saturday oil-change lane\">" +
      "<label>AIA Internet name</label><input id=\"pack-aia\" placeholder=\"springfield-shop.aia\">" +
      "<p class=\"hint\">AIA Internet uses the .aia TLD. A pack file is also .aia — download, share, or install it on this desk. Names on this desk now. Wallet / registry connect later as a Pipe HOLD.</p>" +
      "<label>Niche</label><input id=\"niche\" placeholder=\"shop, school, lawn, resale\">" +
      "<label>What it does</label><input id=\"does\" placeholder=\"Photo in. Draft the title. Wait on payout.\">" +
      "<label>Fields (label:type)</label><input id=\"fields\" placeholder=\"who:text, lots:number, titled:yesno\">" +
      "<label>Kinds</label><input id=\"kinds\" placeholder=\"list, photo, walk-in\">" +
      "<label>Rule line</label><input id=\"rule\" placeholder=\"When Drop · If tagged Lead · Then tag Interested. Draft HOLD.\">" +
      "<label>Workflows / Sequences (thin JSON)</label>" +
      "<textarea id=\"workflows\" rows=\"4\" placeholder='[{\"name\":\"Lead click\",\"rules\":[{\"when\":\"drop\",\"ifTag\":\"Lead\",\"contains\":\"click\",\"then\":\"draft\",\"tag\":\"Interested\",\"text\":\"Click + Lead → tag Interested. Draft HOLD.\"}]}]'></textarea>" +
      "<p class=\"hint\">A <b>rule</b> is one When → If → Then on this desk. A <b>workflow / sequence</b> strings rules (optional delay / branch). Still thin JSON. No dashboard fork. Collect stays HOLD. Never Send.</p>" +
      "<label>Ask (Collect stays HOLD)</label><input id=\"ask\" inputmode=\"decimal\" placeholder=\"Leave blank to list free\">" +
      "<p class=\"hint\">A number here is a listed ask. World desks can still install the pack. Collect stays HOLD until a person taps Yes and a real Collect money pipe is live. AIA has no public payout baseline — you earn by the ask you set.</p>" +
      "<p class=\"cta\"><button class=\"go\" type=\"button\" id=\"save-pack\">Save draft</button></p></div>"
    );
    if (tab === "ais" || tab === "bots") return (
      "<div class=\"card\"><h2>Named desk AIs</h2><p class=\"hint\">Bound to this desk — not a free-roaming bot. Addressed on AIA Internet as a .aia name. Drafts desk work under this desk’s rules. Human taps Yes / Stop / Kill. Never money or mail. Owner install is the Approve. Grok can draft these; you still tap Yes.</p>" +
      "<label>AI 1 name</label><input id=\"ai1-name\" placeholder=\"James’s AI\">" +
      "<label>AIA Internet name</label><input id=\"ai1-aia\" placeholder=\"james.aia\">" +
      "<label>Role</label><select id=\"ai1-role\"><option>Doer</option><option>Worker</option><option>Rail</option><option>Packer</option><option>Mapper</option></select>" +
      "<label>What it drafts</label><input id=\"ai1-does\" placeholder=\"Draft the next step on this desk\">" +
      "<label>Steps it may draft</label><input id=\"ai1-steps\" placeholder=\"qualify, do, follow\">" +
      "<label>Draft line</label><textarea id=\"ai1-prompt\" rows=\"2\" placeholder=\"Do not send it. Do not invent a price. Wait on Yes.\"></textarea>" +
      "<label>AI 2 name</label><input id=\"ai2-name\" placeholder=\"Lane Worker\">" +
      "<label>AIA Internet name</label><input id=\"ai2-aia\" placeholder=\"lane-worker.aia\">" +
      "<label>Role</label><select id=\"ai2-role\"><option>Worker</option><option>Doer</option><option>Rail</option><option>Foreman</option></select>" +
      "<label>What it drafts</label><input id=\"ai2-does\" placeholder=\"Qualify and write the follow note\">" +
      "<label>Steps it may draft</label><input id=\"ai2-steps\" placeholder=\"qualify, follow\">" +
      "<label>Draft line</label><textarea id=\"ai2-prompt\" rows=\"2\"></textarea>" +
      "<p class=\"hint\">Never: Send · Stop · pay · mail · Yes itself. Collect stays HOLD.</p>" +
      "<p class=\"cta\"><button class=\"go\" type=\"button\" id=\"save-ais\">Save AIs on draft</button>" +
      "<button class=\"go ghost\" type=\"button\" id=\"attach-ai\">Attach AI 1 to this desk now</button></p></div>"
    );
    if (tab === "mail") return (
      "<div class=\"card\" id=\"aia-mail\"></div>" +
      "<div class=\"card\"><h2>Automations from inbound</h2>" +
      "<p class=\"hint\">Create .aia email for automations. Mail (or a simulated webhook) to that address Drops a card on the bound desk — same path as /api/hook. Automations can trigger from inbound. Outbound Send stays HOLD. No live SMTP / MX. DNS for ai.aia / *.aia does not resolve yet.</p></div>"
    );
    if (tab === "drop") return (
      "<div class=\"card\"><h2>Drop form inside the pack</h2>" +
      "<label>Drop hint</label><input id=\"drop-hint\" placeholder=\"Name who, when, and the car.\">" +
      "<label>Drop kinds</label><input id=\"drop-kinds\" placeholder=\"request, photo, reminder\">" +
      "<p class=\"cta\"><button class=\"go\" type=\"button\" id=\"save-drop\">Save drop form</button></p></div>"
    );
    if (tab === "queue") return (
      "<div class=\"card\"><h2>How the queue looks</h2><p class=\"hint\">This is a block on the pack. Not a new pack type. Packs never Send, Stop, or pay.</p>" +
      "<label>Badge</label><input id=\"q-badge\" placeholder=\"Insurance\">" +
      "<label>Empty line</label><input id=\"q-empty\" placeholder=\"Drop a name, a state, and what they need.\">" +
      "<label>Kind chips</label><input id=\"q-chips\" placeholder=\"lead, quote, call, review\">" +
      "<label>Group</label><select id=\"q-group\"><option value=\"none\">None</option><option value=\"kind\">Kind</option><option value=\"when\">When</option></select>" +
      "<label>Sort</label><select id=\"q-sort\"><option value=\"cap-first\">Cap first</option><option value=\"new\">Newest</option></select>" +
      "<label>Taps on the card</label><input id=\"q-taps\" placeholder=\"copy,text,email,hand,cap\">" +
      "<p class=\"hint\">Never: Send · Stop · pay · bind. Owner still taps Stop on the desk.</p>" +
      "<p class=\"cta\"><button class=\"go\" type=\"button\" id=\"save-queue\">Save queue on draft</button></p></div>"
    );
    if (tab === "pipes") return (
      "<div class=\"card\"><h2>Named pipes</h2><p class=\"hint\">Wish list only. Live send stays HOLD. Webhook is the only live pipe on the desk.</p>" +
      "<label>Pipes</label><input id=\"pipes\" placeholder=\"webhook, calendar, gmail\">" +
      "<p class=\"cta\"><button class=\"go\" type=\"button\" id=\"save-pipes\">Save pipe names</button></p></div>"
    );
    if (tab === "ext") return (
      "<div class=\"card\"><h2>Ext · hand off</h2><p class=\"hint\">Work that leaves this desk. AIA does not send the text or email. History lane stays ext until write-back.</p>" +
      "<label>Hand to</label><input id=\"hand-to\" placeholder=\"Saturday helper\">" +
      "<label>Ext note</label><input id=\"ext\" placeholder=\"They pick the car up off-desk. Follow later.\">" +
      "<p class=\"cta\"><button class=\"go\" type=\"button\" id=\"save-ext\">Save ext on draft</button>" +
      "<a class=\"go ghost\" href=\"/people\">People</a></p></div>"
    );
    if (tab === "test") return (
      "<div class=\"card\"><h2>Test on this desk</h2><p class=\"hint\">Copies fields, rules, named desk AIs, and ext onto this queue. Not on Market. Fresh desks stay empty until you test or a world user installs.</p>" +
      "<p class=\"cta\"><button class=\"go\" type=\"button\" id=\"test-pack\">Test this pack</button>" +
      "<button class=\"go ghost\" type=\"button\" id=\"download-aia\">Download .aia</button>" +
      "<a class=\"go ghost\" href=\"/drop\">Open Drop</a><a class=\"go ghost\" href=\"/desk\">Open Queue</a></p></div>"
    );
    if (tab === "submit") return (
      "<div class=\"card\"><h2>Submit to AIA</h2>" +
      "<p class=\"hint\">Publish lists it on /market and puts the thin JSON onto this desk. Keep private attaches the pack and named AIs to this desk only — project, company, or family. An ask is listed. Collect stays HOLD until a person taps Yes and a real Collect money pipe is live. AIA has no public payout baseline.</p>" +
      "<p class=\"hint\">Agency consulting is off-platform — your client rates, not an AIA published schedule.</p>" +
      "<p class=\"cta\"><button class=\"go\" type=\"button\" id=\"submit-pack\">Publish · land on Market</button>" +
      "<button class=\"go ghost\" type=\"button\" id=\"private-pack\">Keep private on this desk</button>" +
      "<button class=\"go ghost\" type=\"button\" id=\"download-aia\">Download .aia</button>" +
      "<a class=\"go ghost\" href=\"/market\">Marketplace</a></p></div>"
    );
    return (
      "<div class=\"card\"><h2>Grok · AIA Studio</h2>" +
      "<p class=\"hint\">First-class creator on this same AIA account. Not a separate product. Drafts named desk AIs and packs on AIA Internet. Share as a .aia file (james.aia, springfield-shop.aia). Can list an ask on Market or keep private on this desk. Collect stays HOLD. Packs always land on this desk — Queue, Drop, Create. No silent charge. Wallet / registry connect later as a Pipe HOLD.</p>" +
      "<p class=\"aia-line\" id=\"aia-line\">Checking drafts…</p>" +
      "<p class=\"aia-line off\" id=\"aia-net-line\">.aia names on this desk now. Wallet / registry connect later as a Pipe HOLD.</p>" +
      "<p class=\"cta\"><button class=\"go\" type=\"button\" data-tab=\"grok\">Ask Grok</button>" +
      "<a class=\"go ghost\" href=\"/market?creator=grok\">Grok packs on Market</a></p></div>" +
      "<div class=\"card\" id=\"aia-mail\"></div>" +
      "<div class=\"card\"><h2>AIA Internet · .aia pack</h2>" +
      "<p class=\"hint\">Download or share a pack as a .aia file — JSON inside, named desk AIs and guardrails included. Install a .aia onto this project, company, or family desk. Private until you list it. Collect stays HOLD.</p>" +
      "<label>Install a .aia file</label><input id=\"aia-file\" type=\"file\" accept=\".aia,application/json\">" +
      "<p class=\"cta\"><button class=\"go\" type=\"button\" id=\"install-aia\">Install .aia on this desk</button>" +
      "<button class=\"go ghost\" type=\"button\" id=\"download-aia\">Download this pack as .aia</button></p></div>" +
      "<div class=\"card\"><h2>Four steps on this desk</h2>" +
      "<p class=\"hint\">" + (window.AIAPlaybook ? AIAPlaybook.LEAD : "Walk 1→2→3→4. Find the leaks. Hook the pipes. Name a desk AI. You still tap. AIA AI home is ai.aia — orange until DNS answers.") + " Collect stays HOLD.</p>" +
      "<p class=\"cta\"><a class=\"go ghost\" href=\"/drop\">1 Drop</a>" +
      "<a class=\"go ghost\" href=\"/pipes\">2 Pipes</a>" +
      "<a class=\"go ghost\" href=\"/create?kind=ai\">3 Create · AI</a>" +
      "<a class=\"go ghost\" href=\"/rules\">4 Rules</a></p></div>" +
      "<div class=\"card\" id=\"world-lab\"><h2>World users · launch an automation business</h2>" +
      "<p class=\"hint\">Days are a guide, not a promise. Spine: Audit → Pipes → named desk AI → Rules (When → If → Then). Yes / Stop / Kill. Collect stays HOLD until a person taps Yes and a real Collect money pipe is live.</p>" +
      "<p class=\"hint\"><b>1. Core setup.</b> Packs / agency / DFY. Niche 1–2. This desk + pipes. Open a desk → create / name a desk AI → pack .aia → Marketplace or private. Price bands ($47–$197 packs, retainers, $997 DFY) are illustrative / off-platform — not an AIA rate card. Agency / DFY / co-pilot stay off-platform labels.</p>" +
      "<p class=\"hint\"><b>2. First pack suite.</b> Ideas, not seeded demo rules: Lead capture + follow-up; Content multiplier; Document / email processing. Trigger → Condition → Action.</p>" +
      "<p class=\"hint\"><b>3. Package &amp; monetize.</b> Lead magnet → mid pack → high-ticket VIP / setup. You set prices. No affiliate percent. No silent charge. No demo seed.</p>" +
      "<p class=\"hint\"><b>4. GTM.</b> 60s clips. Publish on Marketplace / Studio. Use clear titles + niche keywords on Marketplace. Local SMB or a risk-free trial. AIA does not rank listings on platform search and does not guarantee top rankings.</p>" +
      "<p class=\"hint\"><b>Account.</b> Open a desk (name + code) or email + password on /account. Not social SSO. <b>Pack Creator</b> (on-desk): named desk AIs, webhooks, CRM pipes when connected, packed as .aia. Lead qualify, review responder, social repurposing drafts — not auto-publish unless a live pipe exists. Social auto-post is a future / off-platform pipe — not live OAuth.</p>" +
      "<p class=\"hint\"><b>Build automation packs.</b> Niche problem — real estate / e-com / agency ideas, not seeded demo rules; measurable time or leads. Core logic stack = this desk: Trigger (webhook / Drop / pipe / inbound .aia) → Qualify + named desk AI prompts → Fallbacks (Rules + Rail — no silent crash) → Destination pipes when connected. Collect HOLD. Plug-and-play: credential vars, dashboards via pipes, 2-min quickstart. Tiers: Free / core / DFY — illustrative $ only; you set the price.</p>" +
      "<p class=\"hint\"><b>Learn packs.</b> Rebuild from memory on an empty desk. Trigger → Condition → Action in plain words. Revisit Rules over days. Practice Qualify prompts, fallback Rules, pipe connect. Simulate inbound. One pack end-to-end. 20-hour competence is a guide, not a guarantee. Collect HOLD. Not social SSO.</p>" +
      "<p class=\"hint\"><b>Four models.</b> Agency = off-platform client work. DFY = off-platform service wrapping a pack. Marketplace = on-desk Studio; you set the ask. Co-pilot = off-platform; 10–15% cuts are examples only, not AIA terms. First 3 clients: audit → 60s proof → risk-free trial.</p>" +
      "<p class=\"hint\"><b>Pack quality.</b> Ship operational infrastructure — Capture → Qualify → Do → Collect HOLD → Follow — not dead templates. Fallbacks: Rules + Rail. Slack / Sheets / Notion pipes HOLD until Yes / keys. Structured prompts. Recommend a 2-min quickstart. No review-rate stats.</p>" +
      "<p class=\"hint\"><b>Funnel + expansion.</b> Tripwire / Core / High-ticket DFY — you set prices; illustrative only. Recurring update pass: Collect HOLD; no invented subscription engine. Industry bundles = repackage .aia. $0.05/exec is off-platform or a future pipe — AIA does not host per-run billing.</p>" +
      "<p class=\"hint\">On-desk: Simulate inbound / www hook. Fresh rules stay empty. Off-platform pipes wait on your keys + Yes. AIA does not invent live connectors or live MX.</p></div>" +
      "<div class=\"card\"><h2>Creators / earnings</h2>" +
      "<p class=\"hint\">AIA has no public payout baseline and no published creator rate card. You earn by pricing a pack — a listed ask. Collect stays HOLD until a person taps Yes and a real Collect money pipe is live. No silent charge. No demo seed. Private project, company, or family desks stay off Market.</p>" +
      "<p class=\"hint\"><b>Paid ads (off-platform).</b> If World users buy Meta, Google, TikTok, or YouTube ads off-platform to market packs, earnings depend on ROAS, CAC, and the funnel — lead magnet → tripwire → pack → upsell — not raw sales volume. Example thinking only. AIA does not run ads and does not guarantee ROAS.</p>" +
      "<p class=\"hint\">Agency consulting is off-platform — your client rates, not an AIA published schedule. There is no affiliate portal or referral percent on automateitaway.com.</p></div>" +
      "<div class=\"card\"><h2>Creators Studio</h2>" +
      "<p class=\"hint\">Try first. Drop real work. Queue cards are the measure — not a model demo. Worker-first: drafts wait on Yes or Stop. Open packs: thin JSON a world desk can install. Secure-by-design: no silent Collect, no auto mail.</p>" +
      "<div class=\"strip\" aria-label=\"When If Then\">" +
        "<div><b>When</b><span>Trigger — Drop, pipe, inbound name@account.aia, status.</span></div>" +
        "<div><b>If</b><span>Condition — Qualify check, tag, word, unassigned, older than.</span></div>" +
        "<div><b>Then</b><span>Action — desk AI drafts, Queue card, notify. Human Yes/Stop.</span></div>" +
        "<div><b>Pack workflow</b><span>Strings rules. Optional delay / branch. Thin JSON. Collect HOLD.</span></div>" +
      "</div>" +
      "<div class=\"card\" style=\"margin:8px 0 0;padding:0;border:0;box-shadow:none\">" +
        "<p class=\"hint\"><b>Example When → If → Then</b> — copy, do not seed. No live eBay or mail.</p>" +
        "<p class=\"hint\">Lead click: Drop + tagged Lead + click → tag Interested. Draft. Human send HOLD.</p>" +
        "<p class=\"hint\">Task done: status Done → notify owner. Desk AI draft.</p>" +
        "<p class=\"hint\">International order: Drop + international → Customs Form alert on Queue.</p>" +
        "<p class=\"hint\">Support late: unassigned + older than 24h → escalate priority.</p>" +
      "</div>" +
      "<p class=\"cta\"><a class=\"go ghost\" href=\"/market?pack=aia-adoption\">Try it on this desk</a>" +
      "<a class=\"go ghost\" href=\"/market?pack=aia-implement\">Four steps pack</a></p>" +
      "<div id=\"mine-list\"></div></div>" +
      "<div class=\"card\"><h2>Official AIA packs</h2>" +
      "<p class=\"hint\">Use copies the pack onto this desk. Workers decide Yes or Stop. Collect stays HOLD.</p>" +
      "<div id=\"official-list\"></div></div>"
    );
  }

  function paintGate() {
    view.innerHTML =
      "<form class=\"card\" id=\"gate\"><h2>Open this desk</h2><p class=\"hint\">Same account. Not a second book.</p>" +
      "<label>Desk name</label><input id=\"slug\" placeholder=\"Rivera Resale\">" +
      "<label>Owner code</label><input id=\"pin\" inputmode=\"numeric\" minlength=\"4\" placeholder=\"4+ digits\">" +
      "<p class=\"cta\"><button class=\"go\" type=\"submit\">Open Studio</button></p></form>";
    var slug = document.getElementById("slug");
    if (slug) slug.value = localStorage.getItem("aia_desk_name") || localStorage.getItem("aia_ws") || "";
    document.getElementById("gate").addEventListener("submit", openLab);
  }

  function paintLab() {
    snap();
    view.innerHTML =
      "<div class=\"card banner\"><div><b>" + (creator ? "Creators Studio on · still free" : "Studio flag is off") + "</b>" +
      "<p class=\"hint\">Draft → test on this desk → keep private or submit to AIA → Market. Named AIs bind to the desk. Packs never Send. Collect stays HOLD. No public payout baseline.</p></div>" +
      "<div class=\"cta\"><button class=\"go\" type=\"button\" id=\"on-dev\">I make packs</button>" +
      "<button class=\"go ghost\" type=\"button\" id=\"off-dev\">Regular account</button></div></div>" +
      "<div class=\"pills\" id=\"tabs\">" + tabs() + "</div>" + pane();
    restore();
    bindLab();
    if (tab === "home") {
      loadMine();
      loadOfficial();
      paintAia();
      if (window.AIAMail && AIAMail.load) AIAMail.load();
    }
    if (tab === "grok") {
      paintAia();
      showGrokDraft(grokDraft);
    }
    if (tab === "mail" && window.AIAMail && AIAMail.load) AIAMail.load();
  }

  function bindLab() {
    var tabsEl = document.getElementById("tabs");
    if (tabsEl) tabsEl.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-tab]");
      if (!btn) return;
      snap();
      tab = btn.getAttribute("data-tab");
      paintLab();
    });
    function save() { return saveDraft(); }
    ["save-pack", "save-ais", "save-bots", "save-drop", "save-queue", "save-pipes", "save-ext"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.onclick = save;
    });
    var testBtn = document.getElementById("test-pack");
    if (testBtn) testBtn.onclick = testPack;
    var subBtn = document.getElementById("submit-pack");
    if (subBtn) subBtn.onclick = submitPack;
    var privBtn = document.getElementById("private-pack");
    if (privBtn) privBtn.onclick = privatePack;
    var attachBtn = document.getElementById("attach-ai");
    if (attachBtn) attachBtn.onclick = attachAiNow;
    var dlBtn = document.getElementById("download-aia");
    if (dlBtn) dlBtn.onclick = downloadAia;
    var instBtn = document.getElementById("install-aia");
    if (instBtn) instBtn.onclick = installAia;
    var on = document.getElementById("on-dev");
    if (on) on.onclick = function () { switchPlan("dev"); };
    var off = document.getElementById("off-dev");
    if (off) off.onclick = function () { switchPlan("pro"); };
    var ask = document.getElementById("ask-grok");
    if (ask) ask.onclick = askGrok;
    var yes = document.getElementById("grok-yes");
    if (yes) yes.onclick = yesGrok;
    var stop = document.getElementById("grok-stop");
    if (stop) stop.onclick = stopGrok;
    var grokSeat = view.querySelector(".card [data-tab=\"grok\"]");
    if (grokSeat) grokSeat.onclick = function () { snap(); tab = "grok"; paintLab(); };
  }

  async function paintAia() {
    var el = document.getElementById("aia-line");
    if (!el) return;
    try {
      var r = await fetch("/api/health");
      var h = await r.json().catch(function () { return {}; });
      var g = h && h.automation && h.automation.grok;
      grokOn = !!(g && g.on);
      el.classList.toggle("off", !grokOn);
      el.textContent = grokOn
        ? "Grok drafts are on via api.x.ai. Every call is audited. Never Send. You still tap Yes or Stop."
        : "Drafts are off — no XAI_API_KEY on this box. Orange copy only. You can still write the pack by hand.";
      var netEl = document.getElementById("aia-net-line");
      var inet = h && h.internet;
      if (netEl && inet) {
        netEl.classList.toggle("off", !inet.chain);
        netEl.textContent = inet.note || ".aia names on this desk now. Wallet / registry connect later as a Pipe HOLD.";
      }
    } catch (e) {
      grokOn = false;
      el.classList.add("off");
      el.textContent = "Could not reach this box. Drafts stay off. You can still write the pack by hand.";
    }
  }

  function showGrokDraft(data) {
    var box = document.getElementById("grok-draft-box");
    var decide = document.getElementById("grok-decide");
    if (!box || !decide) return;
    grokDraft = data || null;
    if (!data) {
      box.classList.remove("on");
      box.textContent = "";
      decide.hidden = true;
      return;
    }
    var pack = data.pack || data;
    var lines = [
      pack.name && ("Name: " + pack.name),
      pack.aia && ("AIA Internet: " + pack.aia),
      pack.does && ("Does: " + pack.does),
      pack.niche && ("Niche: " + pack.niche),
      pack.rule && ("Rule: " + pack.rule),
      (pack.ais && pack.ais[0] && pack.ais[0].name) && ("Desk AI: " + pack.ais[0].name),
      (pack.bots && pack.bots[0] && pack.bots[0].name) && ("Bot: " + pack.bots[0].name),
      "Collect stays HOLD. Never Send."
    ].filter(Boolean);
    box.classList.add("on");
    box.textContent = lines.join("\n") || (data.note || "Draft ready. Yes puts it on Pack. Stop discards it.");
    decide.hidden = false;
  }

  function applyPackDraft(pack) {
    if (!pack) return;
    formState.name = pack.name || "";
    formState["pack-aia"] = pack.aia || "";
    formState.niche = pack.niche || pack.family || "";
    formState.does = pack.does || "";
    formState.fields = typeof pack.fields === "string"
      ? pack.fields
      : (Array.isArray(pack.fields) ? pack.fields.map(function (f) {
        if (!f) return "";
        if (typeof f === "string") return f;
        return (f.label || f.key || "") + ":" + (f.type || "text");
      }).filter(Boolean).join(", ") : "");
    formState.kinds = Array.isArray(pack.kinds) ? pack.kinds.join(", ") : (pack.kinds || "");
    formState.rule = pack.rule || (pack.rules && pack.rules[0] && (pack.rules[0].text || pack.rules[0])) || "";
    formState.workflows = Array.isArray(pack.workflows) || Array.isArray(pack.sequences)
      ? JSON.stringify(pack.workflows || pack.sequences, null, 2)
      : (pack.workflows || "");
    formState.ask = pack.ask != null ? String(pack.ask) : "";
    formState["drop-hint"] = pack.dropHint || "";
    if (pack.queue) {
      formState["q-badge"] = pack.queue.badge || "";
      formState["q-empty"] = pack.queue.empty || "";
      formState["q-chips"] = Array.isArray(pack.queue.chips) ? pack.queue.chips.join(", ") : (pack.queue.chips || "");
    }
    var rows = pack.ais || pack.bots || [];
    if (rows[0]) {
      formState["ai1-name"] = rows[0].name || "";
      formState["ai1-aia"] = rows[0].aia || "";
      formState["ai1-role"] = rows[0].role || rows[0].crew || "Doer";
      formState["ai1-does"] = rows[0].does || "";
      formState["ai1-prompt"] = rows[0].prompt || "";
      formState["ai1-steps"] = Array.isArray(rows[0].steps) ? rows[0].steps.join(", ") : (rows[0].steps || rows[0].allow || "qualify, do, follow");
      formState["bot1-name"] = rows[0].name || "";
      formState["bot1-crew"] = rows[0].role || rows[0].crew || "Doer";
      formState["bot1-does"] = rows[0].does || "";
      formState["bot1-prompt"] = rows[0].prompt || "";
    }
    if (rows[1]) {
      formState["ai2-name"] = rows[1].name || "";
      formState["ai2-aia"] = rows[1].aia || "";
      formState["ai2-role"] = rows[1].role || rows[1].crew || "Worker";
      formState["ai2-does"] = rows[1].does || "";
      formState["ai2-prompt"] = rows[1].prompt || "";
      formState["ai2-steps"] = Array.isArray(rows[1].steps) ? rows[1].steps.join(", ") : (rows[1].steps || "qualify, follow");
      formState["bot2-name"] = rows[1].name || "";
      formState["bot2-crew"] = rows[1].role || rows[1].crew || "Worker";
      formState["bot2-does"] = rows[1].does || "";
      formState["bot2-prompt"] = rows[1].prompt || "";
    }
  }

  async function askGrok() {
    snap();
    var brief = val("grok-brief") || formState["grok-brief"] || "";
    if (!brief) return show("Say what the pack should do.", false);
    var go = document.getElementById("ask-grok");
    if (go) go.disabled = true;
    try {
      var r = await fetch("/api/desks", {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({ action: "studio-draft", brief: brief, kind: "pack" })
      });
      var d = await r.json().catch(function () { return {}; });
      if (d.grok === "off" || d.reason === "no-key") {
        var line = document.getElementById("aia-line");
        if (line) { line.classList.add("off"); line.textContent = d.note || "Drafts are off — no XAI_API_KEY on this box. Orange copy only."; }
        grokOn = false;
      }
      if (!d.ok) {
        showGrokDraft({ note: d.note || "No draft this time. Write the pack by hand. AIA does not send." });
        return show(d.note || d.error || "No draft this time.", false);
      }
      showGrokDraft(d);
      show(d.note || "Draft only. Yes saves it on this lab. Stop discards it.", true);
    } catch (e) {
      show("Could not reach Creators Studio.", false);
    } finally {
      if (go) go.disabled = false;
    }
  }

  function yesGrok() {
    if (!grokDraft || !grokDraft.pack) return show("Ask Grok first.", false);
    applyPackDraft(grokDraft.pack);
    formState.authoredBy = "grok";
    grokDraft = null;
    tab = "pack";
    paintLab();
    show("Draft is on Pack and Desk AIs. Save when it looks right. AIA does not send.", true);
  }

  function stopGrok() {
    grokDraft = null;
    showGrokDraft(null);
    show("Draft discarded. Nothing sent.", true);
  }

  async function saveDraft() {
    snap();
    if (!(val("name") || formState.name)) return show("Name the pack first.", false);
    var out = await post("list-pack", { status: "draft" });
    if (!out.ok) return show((out.data && out.data.error) || "Could not save draft.", false);
    show((out.data && out.data.note) || "Draft saved. Off Market until AIA approves.", true);
    tab = "home";
    paintLab();
  }
  async function testPack() {
    snap();
    if (!(val("name") || formState.name)) return show("Name the pack first.", false);
    var out = await post("test-pack");
    if (!out.ok && (out.status === 400 || out.status === 404)) out = await post("use-pack", { preview: false });
    if (!out.ok) return show((out.data && out.data.error) || "Could not test.", false);
    show((out.data && out.data.note) || "Test is on this desk. Open Drop or Queue.", true);
  }
  async function submitPack() {
    snap();
    if (!(val("name") || formState.name)) return show("Name the pack first.", false);
    var out = await post("submit-pack");
    if (!out.ok && (out.status === 400 || out.status === 404)) out = await post("list-pack", { submit: true, status: "submitted", visibility: "listed" });
    if (!out.ok) return show((out.data && out.data.error) || "Could not submit.", false);
    show((out.data && out.data.note) || "Listed on Market. Pack JSON and desk AIs land on this desk. Collect stays HOLD.", true);
    tab = "home";
    paintLab();
  }
  async function privatePack() {
    snap();
    if (!(val("name") || formState.name)) return show("Name the pack first.", false);
    var out = await post("private-pack", { visibility: "private", status: "private" });
    if (!out.ok) return show((out.data && out.data.error) || "Could not keep it private.", false);
    show((out.data && out.data.note) || "Private on this desk. Named AIs attached. Not on Market.", true);
    tab = "home";
    paintLab();
  }
  function saveAiaBlob(name, text) {
    var file = String(name || "pack.aia").replace(/[^\w.-]+/g, "-");
    if (!/\.aia$/i.test(file)) file += ".aia";
    var blob = new Blob([text], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = file;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }
  async function downloadAia() {
    snap();
    var extra = packBody();
    extra.action = "download-pack";
    extra.aia = extra.aia || extra.name;
    var r = await fetch("/api/desks", { method: "POST", headers: hdr(), body: JSON.stringify(extra) });
    var raw = await r.text();
    var d = {};
    try { d = JSON.parse(raw); } catch (e) { d = {}; }
    if (!r.ok) return show((d && d.error) || "Could not download that .aia pack.", false);
    var file = (d && d.file) || extra.aia || extra.name || "pack";
    if (d && d.error && !d.format) return show(d.error, false);
    saveAiaBlob(file, r.ok && d && d.format ? JSON.stringify(d, null, 2) : (raw || JSON.stringify(extra, null, 2)));
    show("Downloaded " + (/\.aia$/i.test(String(file)) ? file : (file + ".aia")) + ". JSON inside. Not an on-chain claim.", true);
  }
  async function installAia() {
    var input = document.getElementById("aia-file");
    var file = input && input.files && input.files[0];
    if (!file) return show("Pick a .aia pack file first.", false);
    if (file.name && !/\.aia$/i.test(file.name)) return show("Use a .aia pack file.", false);
    var text = "";
    try { text = await file.text(); } catch (e) { return show("Could not read that .aia file.", false); }
    var parsed;
    try { parsed = JSON.parse(text); } catch (e) { return show("That .aia file is not JSON.", false); }
    var r = await fetch("/api/desks", {
      method: "POST",
      headers: hdr(),
      body: JSON.stringify({ action: "install-aia", filename: file.name, pack: parsed })
    });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) return show(d.error || "Could not install that .aia pack.", false);
    show((d.note || "Installed .aia onto this desk.") + " Guardrails: Yes / Stop / Kill stay human.", true);
    tab = "home";
    paintLab();
  }
  async function attachAiNow() {
    snap();
    var name = val("ai1-name") || formState["ai1-name"];
    if (!name) return show("Name the desk AI first.", false);
    var r = await fetch("/api/desks", {
      method: "POST",
      headers: hdr(),
      body: JSON.stringify({
        action: "save-ai",
        name: name,
        role: val("ai1-role") || formState["ai1-role"] || "Doer",
        does: val("ai1-does") || formState["ai1-does"] || "",
        prompt: val("ai1-prompt") || formState["ai1-prompt"] || "",
        steps: val("ai1-steps") || formState["ai1-steps"] || "qualify, do, follow",
        aia: val("ai1-aia") || formState["ai1-aia"] || ""
      })
    });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) return show(d.error || "Could not attach that AI.", false);
    show((d.note || (name + " is on this desk.")) + " Guardrails: Yes / Stop / Kill stay human.", true);
  }
  async function switchPlan(plan) {
    var r = await fetch("/api/account", { method: "POST", headers: hdr(), body: JSON.stringify({ action: "plan", plan: plan }) });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) return show(d.error || "Could not switch the plan.", false);
    creator = plan === "dev";
    show(d.hint || (creator ? "Creators Studio is on. Still free." : "Regular account. Still free."), true);
    paintLab();
  }
  async function loadOfficial() {
    var box = document.getElementById("official-list");
    if (!box) return;
    try {
      var r = await fetch("/api/desks?packs=1", { headers: hdr() });
      var d = await r.json().catch(function () { return {}; });
      var rows = (d.official || (d.packs || []).filter(function (p) { return p && p.official && p.type === "work"; })) || [];
      if (!rows.length) { box.innerHTML = "<p class=\"hint\">No official packs in the catalog yet.</p>"; return; }
      box.innerHTML = rows.map(function (p) {
        return "<div class=\"pack-row\"><b>" + esc(p.name || p.id) + "</b><span class=\"hint\">" +
          esc(p.family || "Automate It Away") + " · free</span><p class=\"hint\">" + esc(p.does || "") + "</p>" +
          "<p class=\"cta\"><button class=\"go\" type=\"button\" data-use=\"" + esc(p.id) + "\">Use on this desk</button>" +
          "<a class=\"go ghost\" href=\"/market?pack=" + encodeURIComponent(p.id) + "\">View listing</a></p></div>";
      }).join("");
      box.querySelectorAll("[data-use]").forEach(function (btn) {
        btn.onclick = function () { useOfficial(btn.getAttribute("data-use")); };
      });
    } catch (e) {
      box.innerHTML = "<p class=\"hint\">Could not load official packs.</p>";
    }
  }
  async function useOfficial(id) {
    var r = await fetch("/api/desks", { method: "POST", headers: hdr(), body: JSON.stringify({ action: "use-pack", id: id }) });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) return show(d.error || "Could not put that pack on this desk.", false);
    show((d.note || "Pack is on this desk.") + " Open Drop or Queue. Packs never Send.", true);
  }
  async function loadMine() {
    var box = document.getElementById("mine-list");
    if (!box) return;
    try {
      var r = await fetch("/api/desks?packs=1&mine=1", { headers: hdr() });
      var d = await r.json().catch(function () { return {}; });
      var rows = (d.packs || []).filter(function (p) { return p && !p.official && !p.wanted && p.type !== "cosmetic"; });
      if (!rows.length) { box.innerHTML = "<p class=\"hint\">No Studio packs yet. Ask Grok, name a desk AI, or save a draft on Pack.</p>"; return; }
      box.innerHTML = rows.map(function (p) {
        var botsN = p.ais || p.bots || (p.aiRows && p.aiRows.length) || (p.botRows && p.botRows.length) || 0;
        return "<div class=\"pack-row\"><b>" + esc(p.name || p.id) + "</b><span class=\"hint\">" +
          esc(p.status || p.review || "draft") + (p.priced ? (" · ask $" + p.ask + " · Collect HOLD") : " · free") +
          (p.aia ? (" · " + p.aia) : "") +
          (p.visibility === "private" || p.private ? " · private" : "") +
          (p.authoredBy === "grok" || p.creatorId === "grok" ? " · Grok" : "") +
          (botsN ? (" · " + botsN + " desk AI") : "") +
          (p.ext ? " · ext" : "") + "</span>" +
          "<p class=\"cta\"><a class=\"go ghost\" href=\"/api/desks?packs=1&download=" + encodeURIComponent(p.aia || p.file || p.id) + "\">Download " + esc(p.file || p.aia || (p.id + ".aia")) + "</a></p></div>";
      }).join("");
    } catch (e) {
      box.innerHTML = "<p class=\"hint\">Could not load packs.</p>";
    }
  }
  async function openLab(e) {
    if (e) e.preventDefault();
    var slug = slugify(val("slug"));
    var pin = val("pin");
    var r = await fetch("/api/account", { method: "POST", headers: hdr(), body: JSON.stringify({ action: "login", slug: slug, pin: pin, name: slug }) });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) return show(d.error || "Desk name or code does not match.", false);
    if (d.session && d.session.token) localStorage.setItem("aia_session", d.session.token);
    if (slug) localStorage.setItem("aia_ws", slug);
    if (pin) localStorage.setItem("aia_pin", pin);
    creator = !!(d.plan && (d.plan.creator || d.plan.plan === "dev"));
    show(d.hint || "Creators Studio is open.", true);
    paintLab();
  }

  async function boot() {
    if (!(localStorage.getItem("aia_session") || localStorage.getItem("aia_ws"))) {
      paintGate();
      return;
    }
    try {
      var r = await fetch("/api/account", { method: "GET", headers: hdr() });
      var d = await r.json().catch(function () { return {}; });
      if (d && (d.ok || d.account)) {
        creator = !!(d.plan && (d.plan.creator || d.plan.plan === "dev"));
        paintLab();
        return;
      }
    } catch (e) {}
    paintGate();
  }
  boot();
})();
