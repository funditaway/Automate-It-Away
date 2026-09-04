(function () {
  var QUICKS = [
    { id: "task", label: "A task", kind: "task", outcome: "wait", title: "" },
    { id: "chore", label: "An errand", kind: "chore", outcome: "hand", title: "" },
    { id: "list", label: "A list", kind: "list", outcome: "note", title: "" },
    { id: "idea", label: "An idea", kind: "idea", outcome: "note", title: "" },
    { id: "project", label: "A project", kind: "project", outcome: "wait", title: "" },
    { id: "build", label: "A build", kind: "build", outcome: "wait", title: "" },
    { id: "ride", label: "Need a ride", kind: "ride", outcome: "book", title: "Need a ride" },
    { id: "pickup", label: "Pickup", kind: "pickup", outcome: "book", title: "Pickup" },
    { id: "quote", label: "Need a quote", kind: "quote", outcome: "quote", title: "Need a quote" },
    { id: "call", label: "Missed call", kind: "call", outcome: "call", title: "Missed call" },
    { id: "follow", label: "Follow up", kind: "follow", outcome: "call", title: "Follow up" },
    { id: "reminder", label: "Remind me", kind: "reminder", outcome: "book", title: "Reminder" },
    { id: "files", label: "Drop files", kind: "files", outcome: "note", title: "Files for the desk" },
    { id: "school", label: "Kids / school", kind: "school", outcome: "book", title: "School" },
    { id: "custom", label: "Custom", kind: "custom", outcome: "wait", title: "" }
  ];
  function extraKinds(sel) {
    if (!sel) return;
    var have = {}; var i;
    for (i = 0; i < sel.options.length; i++) have[sel.options[i].value] = true;
    QUICKS.forEach(function (q) {
      if (have[q.kind]) return;
      var opt = document.createElement("option"); opt.value = q.kind; opt.textContent = q.label; sel.appendChild(opt);
    });
  }
  function paintQuicks() {
    var box = document.getElementById("quick-chips");
    if (!box) {
      var kind = document.getElementById("kind"); if (!kind) return;
      var lab = document.createElement("label"); lab.textContent = "Quick drops";
      box = document.createElement("div"); box.id = "quick-chips"; box.className = "who-chips";
      kind.parentNode.insertBefore(lab, kind); lab.parentNode.insertBefore(box, lab.nextSibling);
    }
    box.innerHTML = QUICKS.map(function (q) {
      return "<button type=\"button\" data-quick=\"" + q.id + "\">" + q.label + "</button>";
    }).join("");
  }
  function applyQuick(id) {
    var q = null; QUICKS.forEach(function (row) { if (row.id === id) q = row; }); if (!q) return;
    var kind = document.getElementById("kind"); extraKinds(kind); if (kind) kind.value = q.kind;
    if (window.AIADropAgent && AIADropAgent.paintKindFields) AIADropAgent.paintKindFields(document.getElementById("kind-fields"), q.kind);
    if (window.AIADropAgent && AIADropAgent.paintOutcomes) window.__aiaOutcome = AIADropAgent.paintOutcomes(document.getElementById("outcome-chips"), q.outcome);
    var title = document.getElementById("title"); if (title && q.title && !title.value) title.value = q.title;
    var pane = document.getElementById("pane-custom");
    if (pane && !document.getElementById("modes")) pane.hidden = q.kind !== "custom";
    document.querySelectorAll("#quick-chips button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-quick") === id); });
  }
  function injectCustom() {
    if (document.getElementById("pane-custom")) return;
    var work = document.getElementById("pane-work"); if (!work) return;
    var pane = document.createElement("div"); pane.id = "pane-custom"; pane.hidden = true;
    pane.innerHTML = "<label>Name this drop</label><input id=\"custom-name\" placeholder=\"Lawn route · porch repair\"><label>Fields on the card</label><input id=\"custom-fields\" placeholder=\"Color, size, when\"><p class=\"sub\">Your own kind of work. Same five steps. You still tap Yes or No.</p>";
    work.appendChild(pane);
  }
  function boot() {
    extraKinds(document.getElementById("kind")); paintQuicks(); injectCustom();
    var box = document.getElementById("quick-chips");
    if (box) box.addEventListener("click", function (e) { var btn = e.target.closest("[data-quick]"); if (btn) applyQuick(btn.getAttribute("data-quick")); });
    var s = document.createElement("script");
    if (window.AIADropAgent) { AIADropAgent.applyQuick = applyQuick; AIADropAgent.QUICKS = QUICKS; }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
