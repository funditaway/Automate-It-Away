const lib = require("./_lib");

const PLANS = {
  desk: {
    id: "desk",
    name: "Desk",
    tag: "One desk",
    features: {
      desksMax: 1, extraSeats: 0, teamQueues: false, timeline: false,
      scheduled: false, pipes: false, agents: false, staffLogins: false,
      savedLogin: true, automation: "Queue and drop"
    },
    includes: ["One desk", "Owner saved login", "Queue and drop", "Family and friend drop"],
    hides: ["Team queues across desks", "Account timeline", "Live pipes", "Extra staff logins"]
  },
  pro: {
    id: "pro",
    name: "Pro",
    tag: "Every desk",
    features: {
      desksMax: 12, extraSeats: 8, teamQueues: true, timeline: true,
      scheduled: true, pipes: true, agents: true, staffLogins: true,
      savedLogin: true, automation: "Full"
    },
    includes: ["Every desk", "Team queues", "Timeline", "Scheduled work", "Pipes", "Member logins"],
    hides: []
  },
  crew: {
    id: "crew",
    name: "Crew",
    tag: "Shops and staff",
    features: {
      desksMax: 40, extraSeats: 40, teamQueues: true, timeline: true,
      scheduled: true, pipes: true, agents: true, staffLogins: true,
      savedLogin: true, automation: "Full + staff"
    },
    includes: ["Many desks", "Staff logins", "Agent seats", "Pipes", "Timeline", "Scheduled work"],
    hides: []
  }
};

function planOf(id) {
  return PLANS[String(id || "pro").toLowerCase()] || PLANS.pro;
}

function publicPlans() {
  return Object.keys(PLANS).map((id) => {
    const p = PLANS[id];
    return {
      id: p.id, name: p.name, tag: p.tag, price: 0, charged: false, status: "free",
      includes: p.includes, hides: p.hides, features: p.features,
      note: "Free for now. Switch anytime. We tell you before we charge."
    };
  });
}

function desksOfAccount(acc) {
  const slugs = (acc && acc.desks) || [];
  return (lib.mem.workspaces || []).filter((w) => w && (slugs.indexOf(w.slug) >= 0 || w.accountId === (acc && acc.id)));
}

function seatBill(acc) {
  const desks = desksOfAccount(acc);
  let people = 0;
  let extra = 0;
  desks.forEach((w) => {
    (w.people || []).forEach((p) => {
      if (!p) return;
      people += 1;
      const kind = p.kind || (p.role === "owner" ? "owner" : "member");
      if (kind !== "owner" && kind !== "agent" && p.status !== "denied") extra += 1;
    });
  });
  return { people, extra, extraPrice: 0, charged: false };
}

function decoratePlan(acc) {
  const spec = planOf((acc && acc.plan) || "pro");
  const seats = seatBill(acc);
  return {
    id: spec.id,
    plan: spec.id,
    name: spec.name,
    tag: spec.tag,
    product: "aia",
    status: "free",
    cadence: "monthly",
    amount: 0,
    charged: false,
    extraSeats: seats.extra,
    extraSeatPrice: 0,
    automation: spec.features.automation,
    savedLogin: true,
    features: spec.features,
    includes: spec.includes,
    hides: spec.hides,
    catalog: publicPlans(),
    note: spec.name + " is active. Free for now. Switch anytime. We tell you before we charge."
  };
}

function switchPlan(acc, id, actor) {
  if (!acc) return { ok: false, status: 404, error: "No account." };
  const spec = PLANS[String(id || "").toLowerCase()];
  if (!spec) return { ok: false, status: 400, error: "Pick Desk, Pro, or Crew." };
  acc.plan = spec.id;
  acc.product = "aia";
  acc.features = spec.features;
  acc.billing = Object.assign({}, acc.billing || {}, {
    plan: spec.id, status: "free", amount: 0, charged: false,
    note: spec.name + " is active. Free for now."
  });
  if (typeof lib.log === "function") lib.log("Auth", "Plan · " + spec.name + " · still free", "OK", acc.slug || "");
  return { ok: true, plan: decoratePlan(acc), by: (actor && actor.name) || "owner" };
}

function jobWhen(job) {
  if (!job) return "";
  const custom = job.custom && typeof job.custom === "object" ? job.custom : {};
  const auto = custom.automation && typeof custom.automation === "object" ? custom.automation : {};
  return job.followWhen || job.when || job.due || job.followAt || auto.follow || auto.when || custom.when || "";
}

function isOpenJob(job) {
  const st = String((job && job.status) || "");
  return st !== "shipped" && st !== "killed";
}

function teamQueues(acc) {
  const rows = [];
  desksOfAccount(acc).forEach((w) => {
    const jobs = (lib.mem.jobs || []).filter((j) => j && j.workspace === w.slug && isOpenJob(j));
    (w.people || []).forEach((p) => {
      if (!p || p.status === "denied") return;
      const mine = jobs.filter((j) => String(j.assignee || "").toLowerCase() === String(p.name || "").toLowerCase());
      rows.push({
        desk: w.biz || w.name || w.slug, slug: w.slug, name: p.name,
        kind: p.kind || (p.role === "owner" ? "owner" : "member"),
        status: p.status || "approved", queue: mine.length,
        cards: mine.slice(0, 8).map((j) => ({ id: j.id, title: j.title || "Card", step: j.step || "", status: j.status || "" }))
      });
    });
  });
  return rows;
}

function accountTimeline(acc) {
  const slugs = desksOfAccount(acc).map((w) => w.slug);
  let items = [];
  try {
    items = require("./_history").historyOf(null, (lib.mem.jobs || []).filter((j) => j && slugs.indexOf(j.workspace) >= 0), []).items || [];
  } catch (e) {
    items = [];
  }
  const scheduled = (lib.mem.jobs || []).filter((j) => j && slugs.indexOf(j.workspace) >= 0 && isOpenJob(j) && jobWhen(j)).map((j) => ({
    id: j.id, title: j.title || "Card", when: jobWhen(j), desk: j.workspace, who: j.assignee || "", status: j.status || ""
  }));
  return { items: items.slice(0, 40), scheduled: scheduled.slice(0, 40) };
}

function loginAccount(name, pin) {
  const slug = lib.slugify(name || "");
  const hashed = lib.hashPin(pin || "");
  const acc = (lib.mem.accounts || []).find((a) => a && (a.slug === slug || lib.slugify(a.name) === slug) && a.pin && a.pin === hashed);
  if (acc) return { ok: true, account: acc };
  const desk = (lib.mem.workspaces || []).find((w) => w && w.slug === slug);
  if (desk && desk.pin === hashed) {
    const shop = (lib.mem.accounts || []).find((a) => a && ((a.desks || []).indexOf(desk.slug) >= 0 || a.id === desk.accountId));
    return { ok: true, account: shop || { name: desk.biz, slug: desk.slug, desks: [desk.slug], plan: "pro", pin: desk.pin }, desk };
  }
  const found = lib.personOf({ headers: { "x-workspace": slug, "x-pin": pin || "" } }, slug);
  if (found && found.person && found.person.role === "owner") {
    return { ok: true, account: { name: found.workspace.biz, slug, desks: [slug], plan: "pro" }, desk: found.workspace };
  }
  if (found && found.pending) return { ok: false, status: 403, pending: true, error: "That seat is waiting on the owner." };
  return { ok: false, status: 401, error: "Account name or code does not match." };
}

function proHome(acc, person) {
  const plan = decoratePlan(acc);
  const feat = plan.features;
  const allDesks = desksOfAccount(acc).map((w) => {
    const counts = typeof lib.jobCounts === "function" ? lib.jobCounts(w.slug) : { waiting: 0, held: 0, shipped: 0, killed: 0 };
    return { slug: w.slug, name: w.biz || w.name || w.slug, city: w.city || "", model: w.model || "", people: (w.people || []).length, counts };
  });
  const desks = feat.desksMax ? allDesks.slice(0, feat.desksMax) : allDesks;
  const time = accountTimeline(acc);
  return {
    ok: true,
    product: "aia",
    savedLogin: true,
    account: acc ? { id: acc.id, name: acc.name, ownerName: acc.ownerName, slug: acc.slug, desks: acc.desks || [], plan: plan.plan } : null,
    plan,
    plans: publicPlans(),
    active: plan.plan,
    you: typeof lib.publicPerson === "function" ? lib.publicPerson(person) : person,
    desks,
    teams: feat.teamQueues ? teamQueues(acc) : [],
    timeline: feat.timeline ? time.items : [],
    scheduled: feat.scheduled ? time.scheduled : [],
    pipes: feat.pipes ? (lib.mem.connections || []).filter((c) => c && desks.map((d) => d.slug).indexOf(c.workspace) >= 0) : [],
    seats: seatBill(acc),
    locked: {
      teamQueues: !feat.teamQueues,
      timeline: !feat.timeline,
      scheduled: !feat.scheduled,
      pipes: !feat.pipes,
      extraSeats: !feat.staffLogins
    }
  };
}

module.exports = {
  PLANS, planOf, publicPlans, decoratePlan, switchPlan, seatBill,
  desksOfAccount, teamQueues, accountTimeline, loginAccount, proHome
};
