const { dropCannedSeeds } = require("./_drop-seed");
const {
  cors, mem, log, save, ready, workspaceOf, readBody,
  personOf, isOwner, ensureRules, addWorkspaceRule, updateWorkspaceRule, removeWorkspaceRule, defaultRules,
  ensureNouns, defaultNouns, setRuleWidget, widgetCount, ruleStarters, RULE_WHEN, RULE_THEN, RULE_IF
} = require("./_lib");

function deskName(row) {
  return (row && (row.biz || row.name || row.slug)) || "this desk";
}

function draftFromTalk(text, row) {
  const raw = String(text || "").trim();
  const t = raw.toLowerCase();
  if (!raw) {
    return {
      ok: true,
      ready: false,
      ask: "What should this desk wait on? Money, a word on the card, or a stop?",
      draft: null
    };
  }

  let then = "note";
  if (/\b(kill|stop|never send|do not send|don't send|block|no one (may|can) send)\b/.test(t)) then = "stop";
  else if (/\b(escalat|priority|cap it)\b/.test(t)) then = "escalate";
  else if (/\b(notify|ping owner|tell the owner)\b/.test(t)) then = "notify";
  else if (/\b(queue|alert on the queue|customs)\b/.test(t)) then = "queue";
  else if (/\b(draft|desk ai)\b/.test(t)) then = "draft";
  else if (/\b(tag|interested)\b/.test(t)) then = "tag";
  else if (/\b(ask me|wait|confirm|approve|hold|not without me|i (have to|must) tap|owner)\b/.test(t)) then = "wait";

  let when = "do";
  if (/\b(follow|nudge|after (it )?ships?)\b/.test(t)) when = "follow";
  else if (/\b(collect|payout|paid|invoice|money out)\b/.test(t)) when = "collect";
  else if (/\bstatus|done|shipped\b/.test(t)) when = "status";
  else if (/\binbound|@[\w.-]+\.aia\b/.test(t)) when = "inbound";
  else if (/\bpipe|webhook|hook\b/.test(t)) when = "pipe";
  else if (/\b(captur|drop|arriv|come in|walk-?in)\b/.test(t)) when = "drop";
  else if (/\b(qualif|fit|missing)\b/.test(t)) when = "qualify";

  const dollar = t.match(/\$\s*(\d+(?:\.\d+)?)/) || t.match(/(\d+)\s*(?:dollars?|bucks)/);
  const ifMoney = dollar ? Number(dollar[1]) : null;

  let contains = "";
  if (/\b(public|outbound|customer name)\b/.test(t)) contains = "public";
  else if (/\b(contract|legal letter)\b/.test(t)) contains = "contract";
  else if (/\b(401|token missing)\b/.test(t)) contains = "401";
  else {
    const m = t.match(/\bcontains?\s+[“"']?([^"'”.,]{2,40})/);
    if (m) contains = m[1].trim();
  }

  const line = raw.length >= 4 && raw.length <= 180
    ? raw.replace(/\s+/g, " ")
    : ("Ask me if " +
      (ifMoney != null ? "money is $" + ifMoney + " or more" : contains ? "the card has that word" : "this needs the owner") +
      ".");

  const questions = [];
  if (then === "note" && ifMoney == null && !contains) {
    questions.push("Is this a wait on you, a stop, or just a note on the card?");
  }
  if (then === "stop") {
    questions.push("Stop still needs your second tap. Keep it as a stop on " + deskName(row) + "?");
  }

  const draft = {
    text: line,
    advanced: then !== "note" || ifMoney != null || !!contains,
    when,
    then,
    ifMoney,
    contains
  };

  const bits = [when, then === "wait" ? "wait on you" : then === "stop" ? "stop" : "note"];
  if (ifMoney != null) bits.push("$" + ifMoney + "+");
  if (contains) bits.push("has a word match");

  return {
    ok: true,
    ready: questions.length === 0,
    ask: questions[0] || ("Add this to " + deskName(row) + "? " + line + " (" + bits.join(" · ") + ")"),
    draft,
    desk: deskName(row)
  };
}

function isYes(text) {
  return /^(y|yes|yeah|yep|do it|add it|confirm|that's right|thats right|correct|ship it)\b/.test(String(text || "").trim().toLowerCase());
}

function isNo(text) {
  return /^(n|no|nope|not that|change it|wait)\b/.test(String(text || "").trim().toLowerCase());
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  await ready();
  if (dropCannedSeeds(mem)) await save();

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
        starters: ruleStarters(),
        when: RULE_WHEN,
        then: RULE_THEN,
        if: RULE_IF,
        workflows: "Packs string rules. Optional delay / branch. Thin JSON.",
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
      starters: ruleStarters(),
      when: RULE_WHEN,
      then: RULE_THEN,
      if: RULE_IF,
      workflows: "Packs string rules. Optional delay / branch. Thin JSON.",
      canAdd: isOwner(person),
      draft: row.ruleDraft || null,
      desk: deskName(row)
    });
  }

  if (req.method === "POST") {
    if (!row) return res.status(404).json({ ok: false, error: "Open a desk first so rules have a home." });
    if (!isOwner(person)) {
      return res.status(403).json({ ok: false, error: "Only the owner can change desk rules." });
    }
    const body = await readBody(req);
    const action = body.action || (body.id && !body.text ? "remove" : "add");

    if (action === "talk" || action === "confirm") {
      const said = String(body.text || body.say || "").trim();
      if (action === "confirm" || (action === "talk" && isYes(said) && row.ruleDraft)) {
        const src = body.draft && typeof body.draft === "object" ? body.draft : row.ruleDraft;
        if (!src || !src.text) {
          return res.status(400).json({ ok: false, error: "Say the rule first. Then confirm." });
        }
        const added = addWorkspaceRule(row, src, person);
        if (!added.ok) return res.status(400).json(added);
        row.ruleDraft = null;
        log("Desk", "Rule from talk · " + added.rule.text, "OK", workspace);
        await save();
        return res.status(201).json({
          ok: true,
          saved: true,
          ask: "On " + deskName(row) + ". " + added.rule.text,
          rule: added.rule,
          rules: added.rules,
          widgetsOn: widgetCount(added.rules),
          workspace
        });
      }
      if (action === "talk" && isNo(said)) {
        row.ruleDraft = null;
        await save();
        return res.status(200).json({
          ok: true,
          saved: false,
          ask: "Okay. What should " + deskName(row) + " wait on instead?",
          draft: null,
          rules: ensureRules(row)
        });
      }
      const talked = draftFromTalk(said, row);
      row.ruleDraft = talked.draft;
      await save();
      return res.status(200).json({
        ok: true,
        saved: false,
        ask: talked.ask,
        draft: talked.draft,
        ready: talked.ready,
        desk: talked.desk,
        rules: ensureRules(row),
        workspace
      });
    }

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
    if (action === "update") {
      const updated = updateWorkspaceRule(row, body.id, body);
      if (!updated.ok) return res.status(updated.error === "Rule not found." ? 404 : 400).json(updated);
      log("Desk", "Rule edit · " + updated.rule.text, "OK", workspace);
      await save();
      return res.status(200).json({
        ok: true,
        rule: updated.rule,
        rules: updated.rules,
        nouns: ensureNouns(row),
        widgetsOn: widgetCount(updated.rules),
        workspace
      });
    }
    const added = addWorkspaceRule(row, body, person);
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
