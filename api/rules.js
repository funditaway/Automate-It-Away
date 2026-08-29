const {
  cors, log, save, ready, workspaceOf, readBody,
  personOf, isOwner, ensureRules, addWorkspaceRule, removeWorkspaceRule, defaultRules,
  ensureNouns, defaultNouns, setRuleWidget, widgetCount
} = require("./_lib");

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  await ready();

  const workspace = workspaceOf(req);
  const { workspace: row, person } = personOf(req, workspace);

  if (req.method === "GET") {
    if (!row) {
      const rules = defaultRules();
      return res.status(200).json({
        ok: true,
        workspace,
        you: person ? { name: person.name, role: person.role } : null,
        rules,
        nouns: defaultNouns(),
        widgetsOn: widgetCount(rules),
        canAdd: false
      });
    }
    const first = !Array.isArray(row.rules) || !row.nouns || typeof row.nouns !== "object";
    const rules = ensureRules(row);
    const nouns = ensureNouns(row);
    if (first) await save();
    return res.status(200).json({
      ok: true,
      workspace,
      you: person ? { name: person.name, role: person.role } : null,
      rules,
      nouns,
      widgetsOn: widgetCount(rules),
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
      return res.status(200).json({
        ok: true,
        rules: removed.rules,
        nouns: ensureNouns(row),
        widgetsOn: widgetCount(removed.rules),
        workspace
      });
    }
    if (action === "widget") {
      const toggled = setRuleWidget(row, body.id, body.on, body.label);
      if (!toggled.ok) return res.status(404).json(toggled);
      log("Desk", (toggled.rule.widget.on ? "Widget on · " : "Widget off · ") + toggled.rule.id, "OK", workspace);
      await save();
      return res.status(200).json({
        ok: true,
        rule: toggled.rule,
        rules: toggled.rules,
        nouns: ensureNouns(row),
        widgetsOn: widgetCount(toggled.rules),
        workspace
      });
    }
    const added = addWorkspaceRule(row, body.text || body.rule, person);
    if (!added.ok) return res.status(400).json(added);
    log("Desk", "Rule · " + added.rule.text, "OK", workspace);
    await save();
    return res.status(201).json({
      ok: true,
      rule: added.rule,
      rules: added.rules,
      nouns: ensureNouns(row),
      widgetsOn: widgetCount(added.rules),
      workspace
    });
  }

  return res.status(405).json({ error: "Use GET or POST" });
};
