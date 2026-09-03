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
