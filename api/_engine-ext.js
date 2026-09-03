const world = require("./_world-engines");

function packFace(id) {
  const key = String(id || "").toLowerCase().replace(/^pack_/, "");
  if (!key) return null;
  if (key === "home" || key === "consign" || key === "vita" || key === "quote" || key === "insurance" || key === "fund" || key === "land") {
    return null;
  }
  const spec = world.WORLD[key];
  if (!spec && world.WANTED13.indexOf(key) < 0) return null;
  return {
    id: key,
    key: key,
    name: world.faceOf(key),
    family: world.familyOf(key)
  };
}

function detectExt(job, shop) {
  const found = world.detectWorld(job, shop && (shop.model || shop.does || shop.pack));
  if (!found) return "";
  if (found === "quote" || found === "year2") return found === "year2" ? "year2" : "vita";
  return found;
}

function brainExt(packId, kind, job) {
  const face = packFace(packId);
  if (!face) return null;
  const brain = world.brainOf(packId, job || { title: kind || packId });
  const draft = String(brain.draft || "");
  if (/vita/i.test(draft)) brain.draft = draft.replace(/vita/ig, "Insurance");
  brain.never = brain.never || ["send", "stop", "pay", "bind"];
  return brain;
}

module.exports = { packFace, detectExt, brainExt, world };
