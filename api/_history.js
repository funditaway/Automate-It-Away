const DESK_FORMAT = "aia.desk.v1";

function laneOf(job) {
  if (!job) return "doing";
  const st = String(job.status || "");
  const wait = String(job.waitingOn || "").toLowerCase();
  if (st === "shipped") return "done";
  if (st === "killed") return "stopped";
  if (st === "out" || job.offDesk || job.awaiting) return "ext";
  if (st === "held" || st === "exception" || job.rail === "hand" || wait === "owner") return "need";
  if (wait && wait !== "owner") return "wait";
  return "doing";
}

function laneLabel(lane) {
  return ({
    need: "Need you",
    doing: "In progress",
    wait: "Waiting on",
    ext: "Ext",
    done: "Done",
    stopped: "Stopped",
    desk: "Desk"
  })[String(lane || "")] || "In progress";
}

function historyItem(job, desk) {
  if (!job) return null;
  const lane = laneOf(job);
  return {
    kind: "job",
    id: job.id,
    t: job.doneAt || job.updatedAt || job.createdAt || job.t || null,
    lane,
    label: laneLabel(lane),
    slug: job.workspace || (desk && desk.slug),
    desk: (desk && (desk.biz || desk.name || desk.slug)) || job.workspace,
    title: job.title || "Card",
    status: job.status || "",
    step: job.step || "",
    waitingOn: job.waitingOn || "",
    who: job.whoTapped || job.doneBy || job.from || "",
    href: "/desk"
  };
}

function historyOf(row, jobs, extras) {
  const items = (jobs || []).map((j) => historyItem(j, row)).filter(Boolean);
  (extras || []).forEach((ev) => {
    if (!ev) return;
    items.push({
      kind: "desk",
      id: "ev_" + (ev.t || "") + "_" + (ev.action || ""),
      t: ev.t,
      lane: ev.action === "delete" ? "stopped" : "desk",
      label: ev.action === "delete" ? "Stopped" : "Desk",
      slug: ev.slug || (row && row.slug),
      desk: ev.name || (row && (row.biz || row.slug)),
      title: (ev.action || "desk") + (ev.by ? " · " + ev.by : ""),
      status: ev.action || "",
      step: "",
      waitingOn: "",
      who: ev.by || "",
      href: "/desks"
    });
  });
  items.sort((a, b) => String(b.t || "").localeCompare(String(a.t || "")));
  const counts = { need: 0, doing: 0, wait: 0, ext: 0, done: 0, stopped: 0, all: items.length };
  items.forEach((it) => {
    if (counts[it.lane] != null) counts[it.lane] += 1;
  });
  return { format: DESK_FORMAT, items, counts };
}

module.exports = { DESK_FORMAT, laneOf, laneLabel, historyItem, historyOf };
