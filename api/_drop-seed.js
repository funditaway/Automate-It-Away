function dropCannedSeeds(mem) {
  let changed = false;
  (mem && mem.workspaces || []).forEach(function (ws) {
    if (!ws || !Array.isArray(ws.rules)) return;
    const kept = ws.rules.filter(function (r) { return r && !r.seed; });
    if (kept.length !== ws.rules.length) {
      ws.rules = kept;
      changed = true;
    }
  });
  return changed;
}

function stripSeedRules(ws) {
  if (!ws) return [];
  if (!Array.isArray(ws.rules)) {
    ws.rules = [];
    return [];
  }
  const kept = ws.rules.filter(function (r) { return r && !r.seed; });
  if (kept.length !== ws.rules.length) ws.rules = kept;
  return ws.rules;
}

function hasCannedSeeds(mem) { return (mem && mem.workspaces || []).some(function (ws) { return ws && Array.isArray(ws.rules) && ws.rules.some(function (r) { return r && r.seed; }); }); }
module.exports = { dropCannedSeeds, hasCannedSeeds, stripSeedRules };
