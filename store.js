/* Automate It Away — cloud first, local fallback */
(function (w) {
  const K = {
    ws: "aia_workspaces",
    active: "aia_active",
    slug: "aia_ws",
    pin: "aia_pin",
    jobs: "aia_jobs",
    inbox: "aia_inbox",
    audit: "aia_audit",
    money: "aia_money",
    tickets: "aia_tickets",
    ready: "aia_golive"
  };
  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; }
    catch (e) { return fallback; }
  }
  function write(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
  function id() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function slugOf() {
    return localStorage.getItem(K.slug) || "consign-it-away";
  }
  const AIA = {
    keys: K,
    cloud: false,
    slug: slugOf,
    workspaces() { return read(K.ws, []); },
    active() {
      const all = AIA.workspaces();
      let i = parseInt(localStorage.getItem(K.active) || "0", 10);
      if (!all.length) return null;
      if (i < 0 || i >= all.length) i = 0;
      return { i, ws: all[i], all };
    },
    jobs() { return read(K.jobs, []); },
    inbox() { return read(K.inbox, []); },
    audit() { return read(K.audit, []); },
    money() { return read(K.money, []); },
    tickets() { return read(K.tickets, []); },
    headers() {
      const h = { "Content-Type": "application/json", "X-Workspace": slugOf() };
      const pin = localStorage.getItem(K.pin);
      if (pin) h["X-Pin"] = pin;
      return h;
    },
    async api(path, opts) {
      const r = await fetch(path, Object.assign({ headers: AIA.headers() }, opts || {}));
      let data = {};
      try { data = await r.json(); } catch (e) { data = {}; }
      return { status: r.status, ok: r.ok, data };
    },
    async capture(item) {
      const title = item.text || item.title || "New capture";
      const local = { id: id(), at: Date.now(), kind: item.kind || "Capture", from: item.from || "inbox", text: title };
      const box = AIA.inbox();
      box.unshift(local);
      write(K.inbox, box);
      AIA.log("Capture", "Inbox · " + title, "OK");
      try {
        const { status, data } = await AIA.api("/api/jobs", {
          method: "POST",
          body: JSON.stringify({ action: "capture", title, why: item.why, provider: item.provider || "webhook", from: local.from })
        });
        if (status === 201 && data.job) { AIA.cloud = true; return data.job; }
      } catch (e) {}
      return local;
    },
    async ship(jobId, note, amount, confirm) {
      try {
        const { status, data } = await AIA.api("/api/jobs", {
          method: "POST",
          body: JSON.stringify({ action: "ship", id: jobId, amount: amount || 0, confirm: !!confirm, note })
        });
        if (status === 409) return { held: true, job: data.job, error: data.error };
        if (data && data.job) return data;
      } catch (e) {}
      return null;
    },
    async kill(jobId, confirm) {
      try {
        const { status, data } = await AIA.api("/api/jobs", {
          method: "POST",
          body: JSON.stringify({ action: "kill", id: jobId, confirm: !!confirm })
        });
        if (status === 409) return { needConfirm: true, job: data.job };
        if (data && data.job) return data;
      } catch (e) {}
      return null;
    },
    log(agent, action, result) {
      const rows = AIA.audit();
      rows.unshift({ t: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), agent, action, result, undo: result === "OK" });
      write(K.audit, rows.slice(0, 200));
    }
  };
  w.AIA = AIA;
})(window);
