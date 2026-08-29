/* Automate It Away — local engine until live pipes exist */
(function (w) {
  const K = {
    ws: "aia_workspaces",
    active: "aia_active",
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

  const AIA = {
    keys: K,
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
    capture(item) {
      const box = AIA.inbox();
      box.unshift({ id: id(), at: Date.now(), ...item });
      write(K.inbox, box);
      AIA.log("Capture", "Inbox · " + (item.text || item.kind), "OK");
      return box[0];
    },
    makeJob(inboxId) {
      const box = AIA.inbox();
      const i = box.findIndex(x => String(x.id) === String(inboxId));
      if (i < 0) return null;
      const row = box.splice(i, 1)[0];
      write(K.inbox, box);
      const job = {
        id: id(),
        from: row.id,
        model: row.kind || "Capture",
        title: row.text || "New job",
        why: "Captured from " + (row.from || "inbox") + ". Guardrail: human before ship.",
        agent: "Capture",
        step: "Qualify",
        status: "exception",
        log: ["Captured", "Qualified as exception", "Waiting on owner"]
      };
      const jobs = AIA.jobs();
      jobs.unshift(job);
      write(K.jobs, jobs);
      AIA.log("Qualify", job.title, "Waiting");
      return job;
    },
    ship(jobId, note) {
      const jobs = AIA.jobs();
      const i = jobs.findIndex(x => String(x.id) === String(jobId));
      if (i < 0) return null;
      const job = jobs.splice(i, 1)[0];
      write(K.jobs, jobs);
      AIA.log(job.agent || "Agent", "Shipped · " + job.title + (note ? " · " + note : ""), "OK");
      const money = AIA.money();
      money.unshift({ at: Date.now(), who: job.title, what: "Held until live pipe", amt: "—" });
      write(K.money, money);
      return job;
    },
    kill(jobId) {
      const jobs = AIA.jobs();
      const i = jobs.findIndex(x => String(x.id) === String(jobId));
      if (i < 0) return null;
      const job = jobs.splice(i, 1)[0];
      write(K.jobs, jobs);
      AIA.log(job.agent || "Agent", "Killed · " + job.title, "Stopped");
      return job;
    },
    log(agent, action, result) {
      const rows = AIA.audit();
      rows.unshift({ t: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), agent, action, result, undo: result === "OK" });
      write(K.audit, rows.slice(0, 200));
    }
  };
  w.AIA = AIA;
})(window);
