const {
  cors, log, save, ready, workspaceOf, readBody,
  personOf, isOwner, ensureRules, addWorkspaceRule, removeWorkspaceRule, defaultRules
} = require("./_lib");

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  await ready();

  const workspace = workspaceOf(req);
  const { workspace: row, person } = personOf(req, workspace);

  if (req.method === "GET") {
    if (!row) {
      return res.status(200).json({
        ok: true,
        workspace,
        you: person ? { name: person.name, role: person.role } : null,
        rules: defaultRules(),
        canAdd: false
      });
    }
    const first = !Array.isArray(row.rules);
    const rules = ensureRules(row);
    if (first) await save();
    return res.status(200).json({
      ok: true,
      workspace,
      you: person ? { name: person.name, role: person.role } : null,
      rules,
      canAdd: isOwner(person)
    });
  }

  if (req.method === "POST") {
    if (!row) return res.status(404).json({ ok: false, error: "Open a desk first so rules have a home." });
    if (!isOwner(person)) {
      return res.status(403).json({ ok: false, error: "Only the owner can change desk rules." });
    }
    const body = await readBody(req);
    const action = body.action || (body.id && !body.text ? "remove" : "add");
    if (action === "remove") {
      const removed = removeWorkspaceRule(row, body.id);
      if (!removed.ok) return res.status(404).json(removed);
      log("Desk", "Removed rule", "OK", workspace);
      await save();
      return res.status(200).json({ ok: true, rules: removed.rules, workspace });
    }
    const added = addWorkspaceRule(row, body.text || body.rule, person);
    if (!added.ok) return res.status(400).json(added);
    log("Desk", "Rule · " + added.rule.text, "OK", workspace);
    await save();
    return res.status(201).json({
      ok: true,
      rule: added.rule,
      rules: added.rules,
      workspace
    });
  }

  return res.status(405).json({ error: "Use GET or POST" });
};
