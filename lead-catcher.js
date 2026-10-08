/* Lead Catcher — Official AIA Pack page. Every rule is checked by the server (api/lead-catcher.js).
   This page only asks. Nothing is sent: replies go to a test outbox. Nothing is charged. */
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]; }); }
  function slugify(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40); }
  function hdr() {
    var h = { "Content-Type": "application/json" };
    var slug = slugify(localStorage.getItem("aia_ws") || ""), pin = localStorage.getItem("aia_pin") || "", tok = localStorage.getItem("aia_session") || "";
    if (slug) h["X-Workspace"] = slug; if (tok) h["X-Session"] = tok; if (pin) h["X-Pin"] = pin;
    return h;
  }
  function api(action, body, query) {
    var get = !body;
    var url = "/api/lead-catcher?action=" + encodeURIComponent(action) + (query ? "&" + new URLSearchParams(query) : "");
    return fetch(url, { method: get ? "GET" : "POST", headers: hdr(), body: get ? undefined : JSON.stringify(Object.assign({ action: action }, body)) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.message || "Something went wrong."); e.code = j.error; e.status = r.status; throw e; } return j; }); });
  }
  function when(s) { if (!s) return ""; return new Date(s).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
  function words(s) { return { new: "New", assigned: "Assigned", in_review: "In Review", waiting: "Waiting", completed: "Completed", closed_no_action: "Closed — No Action" }[s] || s; }
  function chan(c) { return { web_form: "Website form", manual: "Typed in", mock_email: "Email (test)", mock_sms: "Text (test)", mock_missed_call: "Missed call (test)" }[c] || c; }
  function localInput(v) { var d = v ? new Date(v) : new Date(Date.now() + 3600e3); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); }
  var view = "active", selected = (location.hash.match(/^#card=([\w-]+)/) || [])[1] || null, me = null;
  function can(a) { return me && me.can.indexOf(a) >= 0; }
  function msg(ok, text, where) { var m = $(where || "#msg"); if (!m) return; m.className = "msg " + (ok ? "ok" : "err"); m.textContent = text; }

  // ---------- pack gate: add once on the account, turn on per desk, each with a Yes ----------
  function gate() {
    api("pack-status").then(function (s) {
      var h = "<h2>Lead Catcher on " + esc(s.desk) + "</h2><div id=\"gmsg\" class=\"msg\"></div>";
      if (!s.owned) {
        h += "<p>Add Lead Catcher to your AIA account. No charge. Nothing turns on until you say so.</p>" +
          "<label><input type=\"checkbox\" id=\"g_yes\"> Yes, add Lead Catcher to my account</label><div class=\"acts\"><button class=\"btn primary\" id=\"g_get\">Add pack</button></div>";
      } else if (!s.on) {
        h += "<p>Lead Catcher is on your account. Turning it on changes how this desk works: each request becomes a card with an owner and a next step, and every reply waits for a person's Yes.</p>" +
          "<label><input type=\"checkbox\" id=\"g_yes\"> Yes, turn on Lead Catcher for this desk</label><div class=\"acts\"><button class=\"btn primary\" id=\"g_on\">Turn on</button></div>";
      } else {
        h += "<p>On for this desk. " + esc(s.note) + "</p>";
      }
      $("#gate").innerHTML = h;
      var yes = function () { return !!($("#g_yes") && $("#g_yes").checked); };
      var g = $("#g_get"); if (g) g.onclick = function () { if (!yes()) return msg(false, "Tick Yes first.", "#gmsg"); api("get-pack", { confirm: true }).then(gate).catch(function (e) { msg(false, e.message, "#gmsg"); }); };
      var o = $("#g_on"); if (o) o.onclick = function () {
        if (!yes()) return msg(false, "Tick Yes first.", "#gmsg");
        api("turn-on", { confirm: true }).then(function (r) { gate(); setTimeout(function () { msg(true, "On. Website-form key (shown once, keep it private): " + r.intakeKey, "#gmsg"); }, 300); }).catch(function (e) { msg(false, e.message, "#gmsg"); });
      };
      if (s.on) { $("#deskArea").hidden = false; boot(); } else $("#deskArea").hidden = true;
    }).catch(function (e) {
      $("#gate").innerHTML = e.status === 401 ? "<p>Open a desk first. <a href=\"/desks\">Your desks</a></p>" : "<p>" + esc(e.message) + "</p>";
    });
  }

  function boot() { api("me").then(function (m) { me = m; loadList(); if (selected) openCard(selected); }).catch(function (e) { $("#list").innerHTML = "<p>" + esc(e.message) + "</p>"; }); }

  document.querySelectorAll("#views button").forEach(function (b) { b.onclick = function () { document.querySelectorAll("#views button").forEach(function (x) { x.classList.remove("on"); }); b.classList.add("on"); view = b.dataset.v; loadList(); }; });
  ["q", "category", "urgency", "label", "sort"].forEach(function (id) { $("#" + id).addEventListener(id === "q" ? "input" : "change", loadList); });
  $("#newBtn").onclick = showNew;

  function loadList() {
    if (view === "numbers") return showNumbers();
    api("list", null, { view: view, q: $("#q").value, category: $("#category").value, urgency: $("#urgency").value, label: $("#label").value, sort: $("#sort").value }).then(function (rows) {
      if (!rows.length) { $("#list").innerHTML = "<p>Nothing here.</p>"; return; }
      $("#list").innerHTML = rows.map(function (c) {
        return "<div class=\"row" + (c.id === selected ? " sel" : "") + "\" data-id=\"" + esc(c.id) + "\"><div><span class=\"tag " + esc(c.data_label) + "\">" + esc(c.data_label) + "</span>" +
          (c.source_is_mock ? "<span class=\"tag mock\">test channel</span>" : "") + (c.urgency ? "<span class=\"tag urg-" + esc(c.urgency) + "\">" + esc(c.urgency) + "</span>" : "") + (c.overdue ? "<span class=\"tag late\">late</span>" : "") +
          "<b>" + esc(c.customer_name || "No name yet") + "</b> · " + esc(words(c.status)) + "</div><div class=\"req\">" + esc(c.original_request) + "</div>" +
          "<div class=\"req\">" + esc(chan(c.source_channel)) + " · " + esc(when(c.arrived_at)) + " · " + esc(c.owner_name ? "Owner: " + c.owner_name : "No owner") + "</div></div>";
      }).join("");
      document.querySelectorAll(".row").forEach(function (r) { r.onclick = function () { selected = r.dataset.id; history.replaceState(null, "", "#card=" + selected); loadList(); openCard(selected); }; });
    }).catch(function (e) { $("#list").innerHTML = "<p>" + esc(e.message) + "</p>"; });
  }
  function openCard(id) { api("card", null, { cardId: id }).then(render).catch(function (e) { $("#detail").innerHTML = "<p>" + esc(e.message) + "</p>"; }); }
  function act(p) { return p.then(function (r) { if (r && r.card) render(r); else openCard(selected); loadList(); return r; }).catch(function (e) { msg(false, e.message); }); }
  function people(sel, blank) {
    return (blank ? "<option value=\"\">None</option>" : "") + me.people.filter(function (p) { return p.lcRole && p.lcRole !== "none" && p.lcRole !== "sysadmin"; })
      .map(function (p) { return "<option value=\"" + esc(p.id) + "\"" + (p.id === sel ? " selected" : "") + ">" + esc(p.name) + " (" + esc(p.lcRole.replace("_", " ")) + ")</option>"; }).join("");
  }
  function dis(a) { return can(a) ? "" : " disabled"; }

  function render(d) {
    window.__lcLast = d;
    var c = d.card, cur = d.drafts.find(function (x) { return x.state === "current"; });
    var openYes = cur && d.approvals.find(function (a) { return a.draft_id === cur.id && a.status === "valid"; });
    var ran = cur && d.approvals.find(function (a) { return a.draft_id === cur.id && a.status === "executed"; });
    var active = ["new", "assigned", "in_review", "waiting"].indexOf(c.status) >= 0;
    var h = "<div><span class=\"tag " + esc(c.data_label) + "\">" + esc(c.data_label) + " data</span>" + (c.source_is_mock ? "<span class=\"tag mock\">test channel</span>" : "") + (c.overdue ? "<span class=\"tag late\">late</span>" : "") + "<span class=\"tag\">" + esc(words(c.status)) + "</span></div>";
    h += "<h2>" + esc(c.customer_name || "No name yet") + "</h2><p>Came in by " + esc(chan(c.source_channel)) + " on " + esc(when(c.arrived_at)) + "</p><div id=\"msg\" class=\"msg\"></div>";
    // Working model: AI prepares, AIA manages, a person checks and authorizes. The package sits BESIDE the customer's words.
    h += "<div class=\"lc-side\"><div class=\"lc-said\"><h3>What they said (kept exactly as it came in)</h3><div class=\"orig\">" + esc(c.original_request) + "</div>" +
      (c.replies || []).map(function (r) { return "<h4>Customer replied · " + esc(when(r.at)) + " · " + esc(chan(r.channel)) + "</h4><div class=\"orig\">" + esc(r.text) + "</div>"; }).join("") +
      "</div><div class=\"lc-prep\">" + pkgHtml(d, c) + "</div></div>";
    if (!c.original_intact) h += "<p class=\"msg err\" style=\"display:block\">The saved words do not match what came in. Tell the desk owner.</p>";
    if (c.missing_flags.length || c.uncertain_flags.length) h += "<div class=\"flags\">" + c.missing_flags.map(function (f) { return "<span>Missing: " + esc(f.replace(/_/g, " ")) + "</span>"; }).join("") + c.uncertain_flags.map(function (f) { return "<span>Check: " + esc(f.replace(/_/g, " ")) + "</span>"; }).join("") + "</div>";
    h += "<h3>Customer and job</h3><div class=\"grid\"><div><label>Name</label><input id=\"f_name\" value=\"" + esc(c.customer_name) + "\"></div><div><label>Phone</label><input id=\"f_phone\" value=\"" + esc(c.customer_phone) + "\"></div><div><label>Email</label><input id=\"f_email\" value=\"" + esc(c.customer_email) + "\"></div><div><label>Kind of job</label><input id=\"f_cat\" value=\"" + esc(c.category) + "\"></div><div><label>Urgency</label><select id=\"f_urg\">" + ["", "emergency", "high", "normal", "low"].map(function (u) { return "<option" + (u === c.urgency ? " selected" : "") + ">" + u + "</option>"; }).join("") + "</select></div></div>";
    h += "<div class=\"acts\"><button class=\"btn\" id=\"saveFields\"" + dis("card.edit_fields") + ">Save changes</button><button class=\"btn\" id=\"rerun\"" + dis("card.run_extraction") + ">Prepare again (new package)</button></div>";
    h += "<p>Contact: " + (c.contact_verified ? "<b>confirmed</b> " + esc(c.verified_channel) + " " + esc(c.verified_value) : "<b>not confirmed yet</b>. A reply can only go to a confirmed contact.") + "</p>";
    if (active) h += "<div class=\"grid\"><div><label>Confirm which contact</label><select id=\"v_ch\"><option value=\"phone\">Phone</option><option value=\"email\">Email</option></select></div><div><label>How you confirmed it</label><input id=\"v_how\" placeholder=\"Called back and they answered\"></div></div><div class=\"acts\"><button class=\"btn\" id=\"verify\"" + dis("card.verify_contact") + ">Confirm contact</button></div>";
    h += "<h3>Owner and next step</h3><p>Owner: " + esc(c.owner_name || "none") + (c.backup_name ? " · Backup: " + esc(c.backup_name) : "") + "<br>Next: " + esc(c.next_action || "—") + (c.next_action_due ? " (due " + esc(when(c.next_action_due)) + ")" : "") + (c.status === "waiting" ? "<br>Waiting on: " + esc(c.waiting_reason) + " · follow up by " + esc(when(c.follow_up_at)) : "") + (c.close_reason ? "<br>Closed because: " + esc(c.close_reason) : "") + "</p>";
    if (active) h += "<div class=\"grid\"><div><label>Owner</label><select id=\"a_owner\">" + people(c.owner_id) + "</select></div><div><label>Backup</label><select id=\"a_backup\">" + people(c.backup_id, true) + "</select></div><div><label>Next step</label><input id=\"a_next\" value=\"" + esc(c.next_action || "Call the customer back") + "\"></div><div><label>Due</label><input id=\"a_due\" type=\"datetime-local\" value=\"" + localInput(c.next_action_due) + "\"></div></div><div class=\"acts\"><button class=\"btn primary\" id=\"assign\"" + dis("card.assign") + ">Save owner and next step</button></div>";
    if (active && c.status !== "new") {
      h += "<h3>Reply draft</h3>";
      if (cur) { h += "<p>Version " + cur.version + " · written by " + (cur.author_kind === "human" ? "a person" : "AIA (" + esc(cur.author_kind) + ")") + " · goes by " + esc(cur.channel) + " to " + esc(cur.recipient) + "</p>"; if (cur.lint_flags.length) h += "<div class=\"flags\">" + cur.lint_flags.map(function (f) { return "<span>Check: " + esc(f.replace(/_/g, " ")) + "</span>"; }).join("") + "</div>"; }
      h += "<textarea id=\"d_text\">" + esc(cur ? cur.content : "") + "</textarea><div class=\"acts\"><button class=\"btn\" id=\"gen\"" + dis("draft.generate") + ">Draft a reply for me</button><button class=\"btn\" id=\"saveDraft\"" + dis("draft.edit") + ">Save my edit (new version)</button>" + (cur ? "<button class=\"btn stop\" id=\"rejDraft\"" + dis("draft.reject") + ">Throw draft away</button>" : "") + "</div>";
      if (cur) {
        h += "<p class=\"hash\">Yes covers exactly this text, contact and channel. Fingerprint " + esc(cur.payload_hash.slice(0, 16)) + "…</p>";
        if (cur.lint_flags.length) h += "<label><input type=\"checkbox\" id=\"ack\"> I checked the flagged words</label>";
        h += "<div class=\"acts\">" + (ran ? "<span class=\"tag mock\">This version already ran (test outbox). Write a new version to reply again.</span>"
          : openYes ? "<span class=\"tag\">Yes pressed</span><button class=\"btn primary\" id=\"run\"" + dis("external.execute") + ">" + (failedTries(d, openYes) ? "Try again" : "Run test send") + "</button><button class=\"btn stop\" id=\"stop\"" + dis("approval.revoke") + ">Stop</button>"
          : "<button class=\"btn primary\" id=\"yes\"" + dis("approval.approve") + ">Yes — approve this exact reply</button>") + "</div>";
        if (!ran && !openYes && !can("approval.approve")) h += "<p>Your seat cannot press Yes. Ask an approver, a supervisor or the desk owner.</p>";
      }
    }
    if (active) {
      h += "<h3>Move the card</h3><div class=\"grid\"><div><label>Waiting on</label><input id=\"w_reason\" placeholder=\"Customer sending photos\"></div><div><label>Follow up by</label><input id=\"w_when\" type=\"datetime-local\" value=\"" + localInput(null) + "\"></div></div>";
      h += "<div class=\"acts\"><button class=\"btn\" id=\"toWait\"" + (can("card.set_waiting") && c.status !== "new" ? "" : " disabled") + ">Set Waiting</button><button class=\"btn\" id=\"toReview\"" + (can("card.set_in_review") && (c.status === "waiting" || c.status === "assigned") ? "" : " disabled") + ">Set In Review</button></div>";
      h += "<div class=\"grid\" style=\"margin-top:6px\"><div><label>Outcome</label><select id=\"o_out\"><option>booked</option><option>quoted</option><option>referred</option><option>no_answer</option><option>not_a_fit</option><option>lost</option><option>spam</option><option>other</option></select></div><div><label>How we know (needed for booked)</label><select id=\"o_attr\"><option value=\"staff_recorded\">Staff recorded it</option><option value=\"customer_said\">Customer said so</option><option value=\"calendar_match\">Matches the calendar</option></select></div><div><label>Note</label><input id=\"o_note\"></div></div>";
      h += "<div class=\"acts\"><button class=\"btn\" id=\"outcome\"" + dis("outcome.record") + ">Record outcome</button><button class=\"btn\" id=\"complete\"" + (can("card.complete") && c.outcome && c.status !== "new" ? "" : " disabled") + ">Mark Completed</button></div>";
      h += "<div class=\"grid\" style=\"margin-top:6px\"><div><label>Reason for closing with no action</label><input id=\"c_reason\" placeholder=\"Spam, duplicate, outside our area\"></div></div><label><input type=\"checkbox\" id=\"c_yes\"> Yes, close it (second tap)</label><div class=\"acts\"><button class=\"btn stop\" id=\"close\"" + dis("card.close_no_action") + ">Kill — close with no action</button></div>";
    } else if (c.outcome) h += "<p>Outcome: <b>" + esc(c.outcome) + "</b> " + esc(c.outcome_note || "") + "</p>";
    h += sendHtml(d, c, openYes);
    h += "<h3>History</h3><ul class=\"hist\">" + d.history.map(function (x) { return "<li><div class=\"req\">" + esc(when(x.at)) + " · " + esc(x.actor_name || (x.actor_kind === "channel" ? "Came in" : x.actor_kind === "rules" ? "AIA helper" : "AIA")) + "</div>" + esc(x.summary) + "</li>"; }).join("") + "</ul>";
    $("#detail").innerHTML = h;
    wire(c, cur, openYes);
  }
  // ---------- AI work package (prepared by AIA; a person checks each item) ----------
  var STATE = { proposed: "To check", accepted: "Accepted", edited: "Fixed", rejected: "Rejected" };
  var TRIG = { new_request: "the new request", prepared_again: "Prepare again", customer_reply: "the customer's reply" };
  function pkgHtml(d, c) {
    var p = (d.packages || [])[0];
    if (!p) return "<h3>Prepared by AIA</h3><p>Nothing prepared yet.</p>";
    var active = ["new", "assigned", "in_review", "waiting"].indexOf(c.status) >= 0;
    var h = "<h3>Prepared by AIA — check each item</h3><p class=\"pk-note\">Package v" + esc(p.version) + " from " + esc(TRIG[p.trigger] || p.trigger) + " · " + esc(p.source === "rules-v1" ? "AIA rules (no AI model)" : "AIA rules + model") +
      ". Accepting an item never sends anything and never counts as Yes.</p>";
    if (p.flags.indexOf("request_contains_instructions") >= 0) h += "<p class=\"pk-warn\">The message has text that reads like instructions to AIA. AIA ignored it.</p>";
    h += p.items.map(function (i, n) {
      var perm = i.kind === "draft" ? "draft.edit" : "card.edit_fields";
      var h2 = "<div class=\"pk-item k-" + esc(i.kind) + " s-" + esc(i.state) + "\"><div class=\"pk-label\">" + esc(i.label) + (i.kind === "decision" ? " <span class=\"tag late\">Needs a person</span>" : "") +
        " <span class=\"tag\">" + esc(STATE[i.state] || i.state) + "</span></div><div class=\"pk-val\">" + esc(i.value) + "</div>" + (i.note ? "<div class=\"pk-sub\">" + esc(i.note) + "</div>" : "");
      if (i.kind === "draft" && i.lint && i.lint.length) h2 += "<div class=\"flags\">" + i.lint.map(function (f) { return "<span>Check: " + esc(f.replace(/_/g, " ")) + "</span>"; }).join("") + "</div>";
      if (i.review) h2 += "<div class=\"pk-sub\">" + esc(STATE[i.state]) + " by " + esc(i.review.by_name || i.review.by) + " · " + esc(when(i.review.at)) + (i.review.value ? " · now: " + esc(i.review.value) : "") + "</div>";
      else if (active && p.state === "current") h2 += "<div class=\"acts pk-acts\"><button class=\"btn\" data-pk=\"" + n + "\" data-dec=\"accept\"" + dis(perm) + ">Accept</button><button class=\"btn\" data-pkfix=\"" + n + "\"" + dis(perm) + ">Fix</button><button class=\"btn stop\" data-pk=\"" + n + "\" data-dec=\"reject\"" + dis(perm) + ">Reject</button></div>" +
        "<div class=\"pk-fix\" id=\"pkfix" + n + "\" hidden><textarea id=\"pkv" + n + "\">" + esc(i.value) + "</textarea><div class=\"acts\"><button class=\"btn primary\" data-pk=\"" + n + "\" data-dec=\"fix\">Save fix</button></div></div>";
      return h2 + "</div>";
    }).join("");
    if (d.packages.length > 1) h += "<p class=\"pk-sub\">" + (d.packages.length - 1) + " earlier package(s) kept in the history.</p>";
    h += "<div class=\"acts\"><button class=\"btn\" id=\"ctxShow\">Show what AIA could see</button></div><pre id=\"ctxBox\" class=\"pk-ctx\" hidden></pre>";
    return h;
  }
  function failedTries(d, a) { return d.actions.filter(function (x) { return x.action_id === a.action_id && (x.status === "failed" || x.status === "needs_attention"); }).length; }
  function sendHtml(d, c, openYes) {
    var conn = (d.connection && d.connection.outbox) || "up", h = "";
    var owner = me && me.user && me.user.role === "desk_owner";
    if (d.actions.length || owner) h += "<h3>Test sends</h3>";
    if (owner) h += "<p>Test outbox connection: <b>" + esc(conn) + "</b> <span class=\"tag mock\">MOCK test switch</span> <button class=\"btn\" id=\"connFlip\">" + (conn === "up" ? "Turn it down (practise a failure)" : "Bring it back up") + "</button></p>";
    else if (conn === "down") h += "<p><b>The test outbox connection is down.</b> Test sends will fail until the desk owner brings it back up.</p>";
    if (c.needs_attention) h += "<p class=\"pk-warn\">Needs attention: the test send failed several times.</p>";
    var tries = openYes ? failedTries(d, openYes) : 0;
    if (tries) h += "<p class=\"pk-warn\">The test send failed " + tries + " time(s). Nothing was sent. Your Yes still stands: Try again above, or send the approved words yourself and record it here.</p>" +
      "<div class=\"grid\"><div><label>How you sent it</label><input id=\"m_how\" placeholder=\"Texted from the office phone\"></div></div><label><input type=\"checkbox\" id=\"m_yes\"> Yes, I sent exactly the approved words</label><div class=\"acts\"><button class=\"btn\" id=\"manual\"" + dis("external.execute") + ">I sent it myself</button></div>";
    h += d.actions.map(function (a) { return "<p><span class=\"tag mock\">" + esc(a.adapter_mode) + "</span> " + esc(String(a.status).replace(/_/g, " ")) + (a.try_no ? " · try " + esc(a.try_no) : "") + " · " + esc(when(a.finished_at || a.started_at)) + (a.status === "sent_manually" ? " · sent by a person, AIA sent nothing" : " · nothing went to the customer") + "</p>"; }).join("");
    return h;
  }
  (function css() {
    if (document.getElementById("lc-pk-css")) return;
    var st = document.createElement("style"); st.id = "lc-pk-css";
    st.textContent = ".lc-side{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.25fr);gap:14px;align-items:start}@media (max-width:1100px){.lc-side{grid-template-columns:1fr}}" +
      ".lc-said h4{margin:10px 0 4px;font-size:13px}.lc-prep{border:1px solid #CFE3E2;border-radius:10px;padding:8px 10px;background:#FBFDFD}.lc-prep h3{margin-top:4px}" +
      ".pk-note,.pk-sub{font-size:12px;color:#4A5560;margin:4px 0}.pk-warn{background:#FFF4D6;color:#6B4A00;border-radius:6px;padding:6px 8px;font-size:13px}" +
      ".pk-item{border-top:1px solid #E3ECEB;padding:7px 0}.pk-label{font-weight:700;font-size:13px;color:#0D1216}.pk-val{white-space:pre-wrap;margin-top:2px}" +
      ".pk-item.k-decision{background:#FFF8F7;border-left:4px solid #B42318;padding-left:8px}.pk-item.k-draft .pk-val{background:#fff;border:1px dashed #075756;border-radius:6px;padding:6px 8px}" +
      ".pk-item.s-rejected .pk-val{text-decoration:line-through;color:#6B7280}.pk-acts{margin-top:4px}.pk-acts .btn{padding:3px 10px;font-size:13px}.pk-fix textarea{min-height:70px}" +
      ".pk-ctx{white-space:pre-wrap;font-size:11px;max-height:260px;overflow:auto;background:#0D1216;color:#E3F1F0;border-radius:6px;padding:8px}";
    document.head.appendChild(st);
  })();
  function val(id) { var e = $("#" + id); return e ? e.value : ""; }
  function on(id, fn) { var e = $("#" + id); if (e) e.onclick = fn; }
  function wire(c, cur, openYes) {
    var k = { cardId: c.id };
    var A = function (a, b) { return act(api(a, Object.assign({}, k, b || {}))); };
    on("saveFields", function () { A("fields", { customer_name: val("f_name"), customer_phone: val("f_phone"), customer_email: val("f_email"), category: val("f_cat"), urgency: val("f_urg") }); });
    on("rerun", function () { A("extract"); });
    var pkg = (window.__lcLast && window.__lcLast.packages || [])[0];
    document.querySelectorAll("[data-pk]").forEach(function (b) { b.onclick = function () {
      var i = pkg.items[+b.dataset.pk];
      A("package-item", { packageId: pkg.id, key: i.key, decision: b.dataset.dec, value: b.dataset.dec === "fix" ? val("pkv" + b.dataset.pk) : undefined });
    }; });
    document.querySelectorAll("[data-pkfix]").forEach(function (b) { b.onclick = function () { var f = $("#pkfix" + b.dataset.pkfix); if (f) f.hidden = !f.hidden; }; });
    on("ctxShow", function () { api("ai-context", null, k).then(function (r) { var x = $("#ctxBox"); x.textContent = JSON.stringify(r.context, null, 2); x.hidden = false; }).catch(function (e) { msg(false, e.message); }); });
    on("connFlip", function () { var to = window.__lcLast.connection.outbox === "up" ? "down" : "up"; if (!window.confirm("Set the MOCK test outbox connection " + to + "? This only affects test sends.")) return; api("connection", { state: to, confirm: true }).then(function () { openCard(c.id); }).catch(function (e) { msg(false, e.message); }); });
    on("manual", function () { A("manual-sent", { actionId: openYes.action_id, how: val("m_how"), confirm: !!($("#m_yes") && $("#m_yes").checked) }); });
    on("verify", function () { A("verify-contact", { channel: val("v_ch"), how: val("v_how") }); });
    on("assign", function () { A("assign", { ownerId: val("a_owner"), backupId: val("a_backup") || null, nextAction: val("a_next"), nextActionDue: new Date(val("a_due")).toISOString() }); });
    on("gen", function () { A("draft-generate"); });
    on("saveDraft", function () { A("draft", { content: val("d_text") }); });
    on("rejDraft", function () { A("draft-reject", { draftId: cur.id }); });
    on("yes", function () {
      if (val("d_text").trim() !== cur.content.trim()) return msg(false, "You changed the words. Save your edit first, then press Yes on the new version.");
      act(api("yes", Object.assign({}, k, { draftId: cur.id, payloadHash: cur.payload_hash, acknowledgeFlags: !!($("#ack") && $("#ack").checked) })).then(function (r) { return r.detail; }));
    });
    on("run", function () { api("run", Object.assign({}, k, { actionId: openYes.action_id })).then(function () { openCard(c.id); loadList(); }).catch(function (e) { openCard(c.id); setTimeout(function () { msg(false, e.message); }, 250); }); });
    on("stop", function () { A("stop", { approvalId: openYes.id }); });
    on("toWait", function () { A("status", { to: "waiting", reason: val("w_reason"), followUpAt: val("w_when") ? new Date(val("w_when")).toISOString() : "" }); });
    on("toReview", function () { A("status", { to: "in_review" }); });
    on("outcome", function () { A("outcome", { outcome: val("o_out"), attribution: val("o_out") === "booked" ? val("o_attr") : undefined, note: val("o_note") }); });
    on("complete", function () { A("status", { to: "completed" }); });
    on("close", function () { A("status", { to: "closed_no_action", reason: val("c_reason"), confirm: !!($("#c_yes") && $("#c_yes").checked) }); });
  }
  function showNew() {
    $("#detail").innerHTML = "<h2>Type in a request</h2><p>For calls and walk-ins. No AI needed.</p><div id=\"msg\" class=\"msg\"></div><div class=\"grid\"><div><label>Name</label><input id=\"n_name\"></div><div><label>Phone</label><input id=\"n_phone\"></div><div><label>Email</label><input id=\"n_email\"></div><div><label>Data</label><select id=\"n_label\"><option value=\"test\">test</option><option value=\"demo\">demo</option></select></div></div><label>What they asked for, in their words</label><textarea id=\"n_req\"></textarea><div class=\"acts\"><button class=\"btn primary\" id=\"n_go\">Make the card</button></div>";
    on("n_go", function () { api("create", { name: val("n_name"), phone: val("n_phone"), email: val("n_email"), request: val("n_req"), data_label: val("n_label") }).then(function (r) { selected = r.card.id; loadList(); openCard(selected); }).catch(function (e) { msg(false, e.message); }); });
  }
  function showNumbers() {
    api("numbers").then(function (m) {
      var f = m.first_customer_response, t = m.internal_triage;
      $("#list").innerHTML = "<div class=\"metrics\"><div><b>" + (f.median_min == null ? "—" : f.median_min + " min") + "</b>Middle time to first reply (" + f.count + " cards)</div><div><b>" + (t.median_min == null ? "—" : t.median_min + " min") + "</b>Middle time to get an owner</div><div><b>" + m.unassigned_active + "</b>Open, no owner</div><div><b>" + m.overdue_active + "</b>Late</div><div><b>" + m.unresolved_after_48h.not_waiting + " / " + m.unresolved_after_48h.waiting + "</b>Open after 48 hours (not waiting / waiting)</div><div><b>" + (m.on_time_follow_up.rate == null ? "—" : m.on_time_follow_up.rate + "%") + "</b>Follow-ups on time</div><div><b>" + m.draft_quality.approved_as_is + " / " + m.draft_quality.approved_after_edit + " / " + m.draft_quality.helper_drafts_rejected + "</b>AIA drafts: Yes as-is / edited / thrown away</div><div><b>" + m.booked_opportunities.total + "</b>Booked (not revenue)</div><div><b>Not measured</b>Staff time per card</div></div><p>Test and demo data only.</p>";
    }).catch(function (e) { $("#list").innerHTML = "<p>" + esc(e.message) + "</p>"; });
  }
  gate();
})();
