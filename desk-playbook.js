/* Four steps on this desk. Audit → Pipes → named AI → Rules. Collect stays HOLD. */
(function () {
  var TITLE = "Four steps on this desk";
  var LEAD = "Walk them in order. Short, local, on this queue. AIA drafts. You tap. Collect stays HOLD. AIA AI home is ai.aia (www.ai.aia) — orange until DNS answers. Live desk is automateitaway.com.";
  var PHASES = [
    {
      n: 1,
      id: "audit",
      tag: "Audit",
      name: "Find the leaks",
      surface: "Capture · Qualify",
      what: "Map the busywork. High-volume, low-complexity. Drop it. The desk asks what’s missing. Queue cards count.",
      href: "/drop",
      go: "Drop · Capture",
      alsoHref: "/desk",
      also: "Qualify on Queue"
    },
    {
      n: 2,
      id: "stack",
      tag: "Stack",
      name: "Hook the pipes",
      surface: "Pipes",
      what: "Webhook in. Search a site. Copy the hook. Info lands as a card. eBay and mail stay off.",
      href: "/pipes",
      go: "Open Pipes"
    },
    {
      n: 3,
      id: "agent",
      tag: "Agents",
      name: "Name a desk AI",
      surface: "Create · Studio",
      what: "Create the work. Name a desk AI as a .aia. AIA AI home is ai.aia — orange until DNS answers. It categorizes, drafts, summarizes. Never silent send.",
      href: "/create?kind=ai",
      go: "Create · name an AI",
      alsoHref: "/studio",
      also: "Studio AIs"
    },
    {
      n: 4,
      id: "guard",
      tag: "Guardrails",
      name: "You still tap",
      surface: "Rules · Yes / Stop / Kill",
      what: "Edge cases go to a person. Yes, Stop, or Kill. Collect stays HOLD.",
      href: "/rules",
      go: "Open Rules"
    }
  ];

  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  function css() {
    if (document.getElementById("aia-playbook-css")) return;
    var el = document.createElement("style");
    el.id = "aia-playbook-css";
    el.textContent =
      ".aia-playbook{margin:14px 0 18px}" +
      ".aia-playbook h2,.aia-playbook .pb-title{color:var(--heading);font-size:1.05rem;margin:0 0 4px}" +
      ".aia-playbook .pb-lead{color:var(--muted);font-size:14px;margin:0 0 10px;max-width:36rem}" +
      ".aia-playbook .pb-steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,160px),1fr));gap:8px}" +
      ".aia-playbook .pb-step{display:flex;flex-direction:column;gap:6px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px;color:inherit;text-decoration:none;min-height:44px}" +
      ".aia-playbook .pb-step:nth-child(odd){border-top:3px solid var(--teal)}" +
      ".aia-playbook .pb-step:nth-child(even){border-top:3px solid var(--orange)}" +
      ".aia-playbook .pb-n{width:28px;height:28px;border-radius:50%;background:var(--teal);color:#fff;display:grid;place-items:center;font:800 13px system-ui,sans-serif}" +
      ".aia-playbook .pb-step:nth-child(even) .pb-n{background:var(--orange);color:#0c1116}" +
      ".aia-playbook .pb-tag{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--teal)}" +
      ".aia-playbook .pb-step:nth-child(even) .pb-tag{color:var(--orange)}" +
      ".aia-playbook .pb-name{display:block;color:var(--heading);font-weight:800;font-size:15px}" +
      ".aia-playbook .pb-surface{display:block;font-size:12px;font-weight:700;color:var(--teal)}" +
      ".aia-playbook .pb-what{display:block;font-size:13px;color:var(--muted);line-height:1.35}" +
      ".aia-playbook .pb-go{display:inline-flex;align-items:center;min-height:36px;font:700 13px system-ui,sans-serif;color:var(--teal)}" +
      ".aia-playbook .pb-also{margin-left:10px;font:700 13px system-ui,sans-serif;color:var(--orange)}" +
      ".aia-playbook .pb-hold{margin:10px 0 0;padding:8px 10px;border-radius:10px;background:color-mix(in srgb, var(--orange) 18%, var(--card));border:1px solid var(--orange);color:var(--heading);font-size:13px}" +
      ".aia-playbook .pb-hold a{color:var(--orange);font-weight:800}" +
      ".aia-playbook.compact .pb-steps{grid-template-columns:repeat(4,minmax(0,1fr))}" +
      ".aia-playbook.compact .pb-what,.aia-playbook.compact .pb-also{display:none}" +
      ".aia-playbook.compact .pb-step{padding:10px}" +
      ".aia-playbook.compact .pb-name{font-size:13px}" +
      "@media(max-width:640px){.aia-playbook.compact .pb-steps{grid-template-columns:repeat(2,minmax(0,1fr))}}";
    document.head.appendChild(el);
  }

  function stepHtml(p, compact) {
    var also = (!compact && p.alsoHref)
      ? "<a class=\"pb-also\" href=\"" + esc(p.alsoHref) + "\">" + esc(p.also) + "</a>"
      : "";
    return "<article class=\"pb-step\" data-phase=\"" + esc(p.id) + "\">" +
      "<i class=\"pb-n\" aria-hidden=\"true\">" + p.n + "</i>" +
      "<small class=\"pb-tag\">" + esc(p.tag) + "</small>" +
      "<b class=\"pb-name\">" + esc(p.name) + "</b>" +
      "<span class=\"pb-surface\">" + esc(p.surface) + "</span>" +
      (compact ? "" : "<span class=\"pb-what\">" + esc(p.what) + "</span>") +
      "<div><a class=\"pb-go\" href=\"" + esc(p.href) + "\">" + esc(p.go) + "</a>" + also + "</div>" +
      "</article>";
  }

  function html(opts) {
    var compact = !!(opts && opts.compact);
    var embed = !!(opts && opts.embed);
    var head = (compact || embed) ? "" : ("<h2 class=\"pb-title\">" + TITLE + "</h2><p class=\"pb-lead\">" + LEAD + "</p>");
    return "<section class=\"aia-playbook" + (compact ? " compact" : "") + "\" id=\"playbook\" aria-label=\"" + TITLE + "\">" +
      head +
      "<div class=\"pb-steps\">" + PHASES.map(function (p) { return stepHtml(p, compact); }).join("") + "</div>" +
      (compact ? "" : "<p class=\"pb-hold\">AIA AI door is <a href=\"http://www.ai.aia\">ai.aia</a>. Names on this desk now. DNS stays orange until it answers. Live desk is automateitaway.com.</p>") +
      "</section>";
  }

  function mount(el, opts) {
    if (!el) return null;
    css();
    el.innerHTML = html(opts);
    return el;
  }

  function boot() {
    css();
    document.querySelectorAll("[data-aia-playbook]").forEach(function (el) {
      var mode = el.getAttribute("data-aia-playbook") || "";
      mount(el, { compact: mode === "compact" || el.hasAttribute("data-compact"), embed: mode === "embed" });
    });
  }

  window.AIAPlaybook = {
    TITLE: TITLE,
    LEAD: LEAD,
    PHASES: PHASES,
    html: html,
    mount: mount,
    boot: boot
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
