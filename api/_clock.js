/* Card clock: due, expire, snooze. Never Stop or send money. */

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

const DAYS = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6
};

function doneStatus(job) {
  const st = String((job && job.status) || "");
  return st === "shipped" || st === "killed";
}

function parseClock(raw, now) {
  const text = String(raw == null ? "" : raw).trim();
  if (!text || text === "never" || text === "none" || text === "clear") return null;
  const base = now instanceof Date ? new Date(now.getTime()) : new Date(now || Date.now());
  const iso = Date.parse(text);
  if (!Number.isNaN(iso) && /\d{4}-\d{2}-\d{2}|t\d{2}:\d{2}|z$/i.test(text)) {
    return new Date(iso);
  }
  if (!Number.isNaN(iso) && /^\d{4}-\d{2}-\d{2}t\d{2}:\d{2}/i.test(text)) return new Date(iso);

  const word = text.toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  const out = new Date(base.getTime());
  out.setSeconds(0, 0);

  const hm = word.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  let hour = null;
  let minute = 0;
  if (hm && !/^\d{1,2}\/\d{1,2}/.test(hm[0])) {
    hour = Number(hm[1]);
    minute = Number(hm[2] || 0);
    const ap = (hm[3] || "").toLowerCase();
    if (ap === "pm" && hour < 12) hour += 12;
    if (ap === "am" && hour === 12) hour = 0;
    if (!ap && hour <= 7) hour += 12;
  }

  function atHour(h, m) {
    out.setHours(h, m || 0, 0, 0);
  }

  if (/^now$/.test(word)) return new Date(base.getTime());
  if (/\bin\s+(\d+)\s*h/.test(word) || /\b(\d+)\s*hours?\b/.test(word)) {
    const n = Number((word.match(/\b(\d+)\s*h/) || word.match(/\b(\d+)\s*hours?/) || [])[1] || 1);
    return new Date(base.getTime() + n * HOUR);
  }
  if (/\bin\s+(\d+)\s*m/.test(word) || /\b(\d+)\s*min/.test(word)) {
    const n = Number((word.match(/\b(\d+)\s*m/) || word.match(/\b(\d+)\s*min/) || [])[1] || 30);
    return new Date(base.getTime() + n * 60 * 1000);
  }
  if (/\btonight\b/.test(word)) {
    atHour(hour != null ? hour : 19, minute);
    if (out.getTime() <= base.getTime()) out.setDate(out.getDate() + 1);
    return out;
  }
  if (/\bthis morning\b/.test(word)) { atHour(9, 0); return out; }
  if (/\bnoon\b/.test(word)) { atHour(12, 0); return out; }
  if (/\bend of (the )?day\b|\beod\b/.test(word)) { atHour(17, 0); return out; }
  if (/\btoday\b/.test(word)) {
    atHour(hour != null ? hour : 17, minute);
    return out;
  }
  if (/\btomorrow\b/.test(word)) {
    out.setDate(out.getDate() + 1);
    atHour(hour != null ? hour : 9, minute);
    return out;
  }
  if (/\bnext week\b/.test(word)) {
    out.setDate(out.getDate() + 7);
    atHour(hour != null ? hour : 9, minute);
    return out;
  }

  const dayHit = word.match(/\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*/);
  if (dayHit) {
    const want = DAYS[dayHit[0].slice(0, 3)];
    if (want != null) {
      const add = (want - out.getDay() + 7) % 7 || 7;
      out.setDate(out.getDate() + add);
      atHour(hour != null ? hour : 9, minute);
      return out;
    }
  }

  const slash = word.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slash) {
    const month = Number(slash[1]) - 1;
    const date = Number(slash[2]);
    let year = slash[3] ? Number(slash[3]) : out.getFullYear();
    if (year < 100) year += 2000;
    out.setFullYear(year, month, date);
    atHour(hour != null ? hour : 9, minute);
    return out;
  }

  if (!Number.isNaN(iso) && text.length >= 8) return new Date(iso);
  if (hour != null) {
    atHour(hour, minute);
    if (out.getTime() <= base.getTime()) out.setDate(out.getDate() + 1);
    return out;
  }
  return null;
}

function msOf(value, now) {
  if (value == null || value === "") return 0;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = parseClock(value, now);
  return parsed ? parsed.getTime() : 0;
}

function niceWhen(ms, now) {
  if (!ms) return "";
  const t = new Date(ms);
  if (Number.isNaN(t.getTime())) return "";
  const n = now instanceof Date ? now : new Date(now || Date.now());
  const sameDay = t.toDateString() === n.toDateString();
  const tom = new Date(n.getTime() + DAY);
  const yest = new Date(n.getTime() - DAY);
  const time = t.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(":00", "");
  const weekday = t.toLocaleDateString("en-US", { weekday: "short" });
  if (sameDay) return "today " + time;
  if (t.toDateString() === tom.toDateString()) return "tomorrow " + time;
  if (t.toDateString() === yest.toDateString()) return "yesterday " + time;
  const days = Math.round((startOfDay(t) - startOfDay(n)) / DAY);
  if (days > 1 && days < 7) return weekday + " " + time;
  return t.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + time;
}

function startOfDay(d) {
  const x = new Date(d.getTime());
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function ageLabel(createdAt, now) {
  const ms = Date.parse(createdAt || "");
  if (Number.isNaN(ms)) return "";
  const n = now || Date.now();
  const age = Math.max(0, n - ms);
  if (age < 45 * 1000) return "just now";
  if (age < HOUR) return Math.max(1, Math.round(age / 60000)) + "m on desk";
  if (age < DAY) return Math.max(1, Math.round(age / HOUR)) + "h on desk";
  const days = Math.round(age / DAY);
  if (days === 1) return "1 day on desk";
  return days + "d on desk";
}

function dueSource(job) {
  if (!job) return "";
  const custom = job.custom && typeof job.custom === "object" ? job.custom : {};
  return job.dueAt || job.due || job.followWhen || job.timing || job.when || custom.when || custom.due || "";
}

function expireSource(job) {
  if (!job) return "";
  const custom = job.custom && typeof job.custom === "object" ? job.custom : {};
  return job.expireAt || job.expires || job.expire || custom.expire || custom.expires || "";
}

function clockOf(job, nowMs) {
  const now = nowMs || Date.now();
  const dueMs = msOf(dueSource(job), now);
  const expMs = msOf(expireSource(job), now);
  const done = doneStatus(job);
  const late = !!(!done && dueMs && dueMs < now);
  const soon = !!(!done && dueMs && dueMs >= now && dueMs - now <= DAY);
  const expired = !!(!done && (job.expired || (expMs && expMs < now)));
  const expiring = !!(!done && !expired && expMs && expMs - now <= DAY);
  let rank = 6;
  if (expired) rank = 0;
  else if (late) rank = 1;
  else if (soon) rank = 2;
  else if (expiring) rank = 3;
  else if (dueMs) rank = 4;
  else if (job && (job.priority || job.cap)) rank = 5;
  return {
    dueAt: dueMs ? new Date(dueMs).toISOString() : "",
    expireAt: expMs ? new Date(expMs).toISOString() : "",
    dueLabel: dueMs ? niceWhen(dueMs, now) : "",
    expireLabel: expMs ? niceWhen(expMs, now) : "",
    ageLabel: ageLabel(job && job.createdAt, now),
    late,
    soon,
    expired,
    expiring,
    hasDue: !!dueMs,
    hasExpire: !!expMs,
    rank
  };
}

function localInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

function applyClock(job, body, now) {
  if (!job) return job;
  const src = body && typeof body === "object" ? body : {};
  const stamp = now || Date.now();
  if (src.clearDue || src.due === "clear" || src.due === "none") {
    job.dueAt = null;
    job.due = "";
    job.timing = job.timing || "";
    job.late = false;
  }
  if (src.clearExpire || src.expire === "clear" || src.expire === "none" || src.expires === "never") {
    job.expireAt = null;
    job.expires = "";
    job.expired = false;
  }
  const dueRaw = src.dueAt || src.due || src.timing || src.when || src.followWhen;
  if (dueRaw && src.due !== "clear" && src.due !== "none") {
    const d = parseClock(dueRaw, stamp);
    if (d) {
      job.dueAt = d.toISOString();
      job.due = niceWhen(d.getTime(), stamp);
      job.timing = String(dueRaw).slice(0, 80);
      job.late = false;
    } else if (typeof dueRaw === "string") {
      job.timing = dueRaw.slice(0, 80);
    }
  }
  const expRaw = src.expireAt || src.expire || src.expires;
  if (expRaw && src.expire !== "clear" && src.expires !== "never") {
    const d = parseClock(expRaw, stamp);
    if (d) {
      job.expireAt = d.toISOString();
      job.expires = niceWhen(d.getTime(), stamp);
      job.expired = false;
    }
  }
  if (src.followWhen) {
    const d = parseClock(src.followWhen, stamp);
    job.followWhen = d ? d.toISOString() : String(src.followWhen).slice(0, 80);
  }
  if (src.custom && typeof src.custom === "object") {
    if (src.custom.when && !job.dueAt) applyClock(job, { due: src.custom.when }, stamp);
    if (src.custom.expire && !job.expireAt) applyClock(job, { expire: src.custom.expire }, stamp);
  }
  return job;
}

function snoozeJob(job, body, now) {
  if (!job) return job;
  const stamp = now || Date.now();
  const hours = Number(body && (body.hours || body.snoozeHours));
  const until = (body && (body.until || body.snooze || body.due)) || "";
  let next = null;
  if (Number.isFinite(hours) && hours > 0) next = new Date(stamp + hours * HOUR);
  else next = parseClock(until || "in 2 hours", stamp);
  if (!next) next = new Date(stamp + 2 * HOUR);
  job.dueAt = next.toISOString();
  job.due = niceWhen(next.getTime(), stamp);
  job.timing = job.due;
  job.late = false;
  job.expired = false;
  if (job.expireAt && Date.parse(job.expireAt) < next.getTime()) {
    job.expireAt = new Date(next.getTime() + DAY).toISOString();
    job.expires = niceWhen(Date.parse(job.expireAt), stamp);
  }
  return job;
}

function tickClock(job, nowMs) {
  if (!job || doneStatus(job)) return false;
  const now = nowMs || Date.now();
  const clock = clockOf(job, now);
  let changed = false;
  if (clock.hasDue && !job.dueAt) {
    job.dueAt = clock.dueAt;
    job.due = clock.dueLabel;
    changed = true;
  }
  if (clock.late && !job.late) {
    job.late = true;
    job.next = "Late · was due " + clock.dueLabel + ". Open it or Cap it.";
    changed = true;
  }
  if (clock.expired && !job.expired) {
    job.expired = true;
    job.waitingOn = job.waitingOn || "owner";
    job.next = "This card expired" + (clock.expireLabel ? " · " + clock.expireLabel : "") + ". Open it or Stop it. Nothing sent.";
    job.log = (job.log || []).concat(["Expired"]);
    changed = true;
  }
  return changed;
}

function clockLine(job, clock) {
  const c = clock || clockOf(job);
  if (!c) return "";
  if (c.expired) return "Expired" + (c.expireLabel ? " · " + c.expireLabel : "") + ". Open it or Stop it.";
  if (c.late) return "Late · due " + c.dueLabel + ".";
  if (c.soon) return "Due " + c.dueLabel + ".";
  if (c.expiring) return "Expires " + c.expireLabel + ".";
  if (c.dueLabel) return "Due " + c.dueLabel + ".";
  return "";
}

module.exports = {
  parseClock,
  msOf,
  niceWhen,
  ageLabel,
  clockOf,
  localInput,
  applyClock,
  snoozeJob,
  tickClock,
  clockLine,
  dueSource,
  expireSource
};
