/* ai.aia. Collect stays HOLD — packs do not charge from this page. */
    const TYPES = [
      { id: "job", name: "Job", hint: "A card on the queue" },
      { id: "capture", name: "Capture", hint: "A photo, call, or form" },
      { id: "ai", name: "Desk AI", hint: "Desk AIs that draft. Humans that decide." },
      { id: "pack", name: "Pack", hint: "Add a pack to this desk" },
      { id: "model", name: "Automation", hint: "Keep it, or list it" },
      { id: "teammate", name: "Teammate", hint: "Someone else on this desk" },
      { id: "rule", name: "Guardrail", hint: "Ask me if…" },
      { id: "workspace", name: "Workspace", hint: "Open another desk" }
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
      const tok = localStorage.getItem("aia_session");
      if (ws) h["X-Workspace"] = ws;
      if (tok) h["X-Session"] = tok;
      if (pin) h["X-Pin"] = pin;
      return h;
    }
    function deskOpen() {
      if (window.AIADesks && typeof AIADesks.shopOpen === "function") return !!AIADesks.shopOpen();
      return !!(localStorage.getItem("aia_ws") && (localStorage.getItem("aia_session") || localStorage.getItem("aia_pin")));
    }
