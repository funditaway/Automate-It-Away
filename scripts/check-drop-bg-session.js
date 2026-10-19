#!/usr/bin/env node
// After a drop, the background draft (recommend) and hand-off (assign) carry the signed-in
// session, so they still reach /api/jobs once it needs a seat. The public drop itself and
// /api/upload keep sending no session (check-upload-privacy).
// usage: node scripts/check-drop-bg-session.js [repoRoot]
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.resolve(process.argv[2] || path.join(__dirname, ".."));
let failures = 0;
function ok(c, m) { if (!c) { failures++; console.error("check-drop-bg-session: FAIL " + m); } }
const agent = fs.readFileSync(path.join(root, "drop-agent.js"), "utf8");
const app = fs.readFileSync(path.join(root, "drop-app.js"), "utf8");

const line = agent.split("\n").find((l) => l.indexOf("var auto = window.__aiaPendingAuto || {};") >= 0) || "";
const m = line.match(/var headers = [^\n]*?\} catch \(e3\) \{\}/);
ok(!!m, "background headers are built in one guarded line");
function bg(optsHeaders, store, throws) {
  const ctx = { opts: { headers: optsHeaders }, Object, localStorage: { getItem: (k) => { if (throws) throw new Error("blocked"); return k in store ? store[k] : null; } } };
  vm.createContext(ctx);
  vm.runInContext((m ? m[0] : "var headers = opts.headers;") + "\nthis.out = headers;", ctx);
  return ctx.out;
}
const pub = { "Content-Type": "application/json", "X-Workspace": "aia" };
let h = bg(pub, { aia_session: "tok1" });
ok(h["X-Session"] === "tok1" && h["X-Workspace"] === "aia", "signed-in dropper: background calls send X-Session");
ok(!("X-Session" in pub), "the drop's own headers object is not changed");
h = bg(Object.assign({ "X-Pin": "1234" }, pub), {});
ok(h["X-Pin"] === "1234" && !("X-Session" in h), "code-only dropper: unchanged");
h = bg(pub, {});
ok(!("X-Session" in h), "stranger: no session added");
h = bg(pub, {}, true);
ok(h["X-Workspace"] === "aia" && !("X-Session" in h), "blocked storage does not break the drop");
h = bg(Object.assign({ "X-Session": "own" }, pub), { aia_session: "tok1" });
ok(h["X-Session"] === "own", "an existing X-Session is kept");
ok(/real\.call\(window, "\/api\/jobs", \{ method: "POST", headers: headers, body: JSON\.stringify\(\{ action: "recommend"/.test(agent), "recommend uses the background headers");
ok(/real\.call\(window, "\/api\/jobs", \{ method: "POST", headers: headers, body: JSON\.stringify\(\{ action: "assign"/.test(agent), "assign uses the background headers");
ok(/var req = real\.call\(this, url, opts\);/.test(agent), "the drop's capture is sent with its own headers");
ok(/body: JSON\.stringify\(\{ action: "recommend", id: id \}\) \}\);/.test(agent), "recommend body is only the action and card id");
ok(/body: JSON\.stringify\(\{ action: "assign", id: id, name: auto\.handTo \}\) \}\);/.test(agent), "assign body is only the action, card id and name");
ok(agent.split("aia_session").length === 3 && line.split("aia_session").length === 2, "the session is read only by the sign-in test and the background headers");
ok(agent.split(/\btok\b/).length === 4 && (line.split(/\btok\b/).length === 4), "the session token is used only on the background headers line");
const hf = app.slice(app.indexOf("function headers()"), app.indexOf("function showMode"));
ok(hf.length > 0 && hf.indexOf("X-Session") < 0, "public drop headers in drop-app.js still carry no session");
console.log("check-drop-bg-session: " + (failures ? failures + " fail" : "all pass"));
process.exit(failures ? 1 : 0);
