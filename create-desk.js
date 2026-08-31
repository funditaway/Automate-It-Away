    const TYPES = [
      { id: "job", name: "Job", hint: "A piece of work in the queue" },
      { id: "capture", name: "Capture", hint: "Photo, call, form — not shipped" },
      { id: "model", name: "Custom model", hint: "A kind of work this desk runs" },
      { id: "teammate", name: "Teammate", hint: "Who can tap on this shop" },
      { id: "rule", name: "Guardrail", hint: "Ask me if…" },
      { id: "workspace", name: "Workspace", hint: "Open another shop" }
    ];
    let kind = "job";
    let advanced = false;
    const picks = document.getElementById("picks");
    const form = document.getElementById("form");
    const ok = document.getElementById("ok");
    const err = document.getElementById("err");
    function headers() {
      const h = { "Content-Type": "application/json" };
      const ws = localStorage.getItem("aia_ws");
      const pin = localStorage.getItem("aia_pin");
      if (ws) h["X-Workspace"] = ws;
      if (pin) h["X-Pin"] = pin;
      return h;
    }
    function packSelect() {
      return `<label class="adv">Pack</label><select class="adv" name="pack"><option value="">This desk / let the engine pick</option><option value="home">Home</option><option value="consign">Consign</option><option value="vita">Insurance</option><option value="fund">Fund</option><option value="land">Land</option></select>`;
    }
    function kindSelect() {
      return `<label class="adv">What is it?</label><select class="adv" name="dropKind"><option value="request">A request</option><option value="note">A note</option><option value="call">Missed call</option><option value="message">A message to send</option><option value="pickup">Pickup / drop-off</option><option value="ride">A ride</option><option value="reminder">A reminder</option><option value="book">Book a time</option><option value="chore">Chore / errand</option><option value="form">Form / paper</option><option value="photo">A photo</option><option value="list">List / sell</option><option value="quote">Need a quote</option><option value="follow">Follow up</option><option value="walk-in">Walk-in job</option></select>`;
    }
    function outcomeSelect() {
      return `<label class="adv">Preferred outcome</label><select class="adv" name="outcome"><option value="wait">Owner decides</option><option value="text">Text them</option><option value="email">Email them</option><option value="call">Call them back</option><option value="book">Put it on the calendar</option><option value="hand">Hand it to someone</option><option value="list">Draft a listing</option><option value="quote">Draft a quote</option><option value="note">Just keep the note</option></select><p class="hint adv">Draft only. An AI agent or a human still taps Yes or No before anything leaves.</p>`;
    }
    function fields() {
      if (kind === "job") return `<label>What is the work?</label><input name="title" required placeholder="Oil change Friday · list the lamp"><label>Notes</label><textarea name="notes" rows="3" placeholder="Anything this desk should run"></textarea>${packSelect()}${kindSelect()}${outcomeSelect()}<label class="adv">Ask / amount</label><input class="adv" name="amount" inputmode="decimal" placeholder="85"><label class="adv">When</label><input class="adv" name="timing" placeholder="Friday 3pm"><label class="adv">Hand to</label><input class="adv" name="assignee" placeholder="Name already on People"><label class="adv">Custom fields</label><input class="adv" name="customLine" placeholder="Patient: Rex, due date: Friday"><label class="adv">Tell AIA</label><textarea class="adv" name="tell" rows="2" placeholder="What Worker and Doer should know before they draft"></textarea>`;
      if (kind === "capture") return `<label>What came in?</label><textarea name="notes" rows="3" required placeholder="Photo of the porch lamp, pickup Thursday"></textarea>${kindSelect()}${outcomeSelect()}<label class="adv">From</label><input class="adv" name="from" placeholder="Counter · Thursday"><label class="adv">I am</label><select class="adv" name="whoKind"><option value="helper">Helper</option><option value="family">Family</option><option value="friend">Friend</option><option value="staff">Staff</option></select><label class="adv">Name</label><input class="adv" name="contactName" placeholder="Taylor"><label class="adv">Phone</label><input class="adv" name="phone" placeholder="417-555-0100"><label class="adv">When</label><input class="adv" name="timing" placeholder="Thursday 3pm"><label class="adv">Tell AIA</label><textarea class="adv" name="tell" rows="2" placeholder="Not shipped. Qualify first."></textarea>`;
      if (kind === "model") return `<label>Name this work</label><input name="name" required placeholder="Lawn route"><label>What the desk does</label><input name="does" placeholder="Call in → schedule → invoice"><label class="adv">How unique is it?</label><select class="adv" name="complexity"><option value="simple">Simple — same five steps</option><option value="custom">Custom — this desk only</option><option value="unique">Unique — own fields</option><option value="complex">Complex — fields + a first card</option></select><label class="adv">Fields on a card</label><input class="adv" name="fields" placeholder="Patient, due date, ask"><label class="adv">First card on the queue</label><input class="adv" name="firstWork" placeholder="Recall Rex Friday">`;
      if (kind === "teammate") return `<label>Name</label><input name="name" required placeholder="Sam"><label>Who they are</label><select name="kind"><option value="helper">Helper</option><option value="family">Family</option><option value="friend">Friend</option><option value="staff">Staff</option></select><label>Their desk code</label><input name="pin" required inputmode="numeric" minlength="4" placeholder="4+ digits"><label class="adv">Phone</label><input class="adv" name="phone" inputmode="tel" placeholder="417-555-0100"><label class="adv">Email</label><input class="adv" name="email" inputmode="email" placeholder="sam@shop.com">`;
      if (kind === "rule") return `<label>Ask me if…</label><input name="text" required placeholder="Ask me if money out is over $100"><label class="adv">When</label><select class="adv" name="when"><option value="qualify">Qualify</option><option value="capture">Capture</option><option value="do">Do</option><option value="collect">Collect</option><option value="follow">Follow</option></select><label class="adv">Then</label><select class="adv" name="then"><option value="wait">Wait for owner</option><option value="stop">Stop</option><option value="note">Note only</option></select><label class="adv">If money is at least</label><input class="adv" name="ifMoney" inputmode="decimal" placeholder="Leave blank unless this is a money wait"><label class="adv">If the card contains</label><input class="adv" name="contains" placeholder="contract"><label class="adv">If field</label><input class="adv" name="ifField" placeholder="city"><label class="adv">equals or has</label><input class="adv" name="ifValue" placeholder="outside city">`;
      return `<label>Your name</label><input name="name" required><label>Desk name</label><input name="biz" required placeholder="Rivera Resale"><label>Desk code</label><input name="pin" required inputmode="numeric" minlength="4"><label class="adv">City</label><input class="adv" name="city" placeholder="Springfield"><label class="adv">What this desk is for</label><input class="adv" name="model" placeholder="Trades"><label class="adv">Fields on a card</label><input class="adv" name="fields" placeholder="Job, when, ask"><label class="adv">First card</label><input class="adv" name="firstWork" placeholder="First thing on the queue">`;
    }
    function renderPicks() {
      picks.innerHTML = TYPES.map(t => "<button type=\"button\" class=\"pick " + (t.id === kind ? "on" : "") + "\" data-kind=\"" + t.id + "\"><b>" + t.name + "</b><span>" + t.hint + "</span></button>").join("");
      const label = kind === "job" ? "Put the job on the queue" : kind === "capture" ? "Capture it — not shipped" : kind === "model" ? "Save this custom model" : kind === "teammate" ? "Add this teammate" : kind === "rule" ? "Add this guardrail" : kind === "workspace" ? "Open this shop" : "Save";
      form.innerHTML = fields() + "<button class=\"go\" type=\"submit\">" + label + "</button><p class=\"hint\">Same five steps: Capture, Qualify, Do, Collect, Follow. You still tap Yes or No on anything that needs a yes or no from an AI agent or a human.</p>";
      ok.style.display = "none"; err.style.display = "none";
    }
    function setMode(on) {
      advanced = !!on;
      document.body.classList.toggle("show-adv", advanced);
      document.getElementById("mode-simple").classList.toggle("on", !advanced);
      document.getElementById("mode-advanced").classList.toggle("on", advanced);
    }
    picks.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-kind]"); if (!btn) return;
      kind = btn.getAttribute("data-kind"); renderPicks();
    });
    document.querySelector(".modes").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-mode]"); if (!btn) return;
      setMode(btn.getAttribute("data-mode") === "advanced");
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
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const go = form.querySelector(".go");
      if (go) go.disabled = true;
      try {
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
          const r = await fetch("/api/auth", { method: "POST", headers: headers(), body: JSON.stringify({ action: "create", kind: "model", complexity: f.get("complexity") || (advanced ? "custom" : "simple"), name: f.get("name"), does: f.get("does"), fields: f.get("fields"), firstWork: f.get("firstWork") }) });
          const data = await r.json().catch(() => ({}));
          if (!r.ok) return fail(data.error || "Could not save that creation.");
          if (f.get("name")) localStorage.setItem("aia_model", f.get("name"));
          return done(data.job ? "Custom model saved. First card is on the queue. You still tap Yes or No." : "This custom model is on the desk.");
        }
        if (kind === "teammate") {
          const r = await fetch("/api/auth", { method: "POST", headers: headers(), body: JSON.stringify({ action: "invite", name: f.get("name"), role: "employee", kind: f.get("kind") || "helper", pin: f.get("pin"), phone: f.get("phone") || "", email: f.get("email") || "" }) });
          const data = await r.json().catch(() => ({}));
          if (!r.ok) return fail(data.error || "Could not add that person.");
          return done("Teammate can open this shop with their own code. Same queue. They tap work. They do not send money.");
        }
        if (kind === "rule") {
          const r = await fetch("/api/rules", { method: "POST", headers: headers(), body: JSON.stringify({ action: "add", text: f.get("text"), when: f.get("when") || "qualify", then: f.get("then") || "wait", ifMoney: f.get("ifMoney"), contains: f.get("contains"), ifField: f.get("ifField"), ifValue: f.get("ifValue") }) });
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
    renderPicks();
    setMode(false);
