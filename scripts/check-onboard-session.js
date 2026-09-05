#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}
function must(hay, needle, label) {
  if (!hay.includes(needle)) throw new Error("missing " + label + ": " + needle);
}

const onboard = read("onboard.html");
const login = read("login.html");
const start = onboard.indexOf("form.onsubmit");
const end = onboard.indexOf("</script>", start);
const src = onboard.slice(start, end);
const fetchAt = src.indexOf('fetch("/api/auth"');
const wsAt = src.indexOf('localStorage.setItem("aia_ws"');
const openAt = src.indexOf("AIADesks.open");
const pendingAt = src.indexOf("data.pending");

if (fetchAt < 0) throw new Error("onboard must POST /api/auth");
if (wsAt < 0) throw new Error("onboard must still write aia_ws after success");
if (openAt < 0) throw new Error("onboard must still AIADesks.open after success");
if (pendingAt < 0) throw new Error("onboard must honor pending join");
if (wsAt < fetchAt) throw new Error("onboard must not write aia_ws before /api/auth");
if (openAt < fetchAt) throw new Error("onboard must not AIADesks.open before /api/auth");
if (wsAt < pendingAt) throw new Error("onboard must not write aia_ws before pending check");
if (openAt < pendingAt) throw new Error("onboard must not AIADesks.open before pending check");

must(src, "if (!r.ok)", "onboard fail-closed on !r.ok");
must(src, "AIADesks.open", "onboard adds the desk after success");
must(login, "if (!r.ok)", "login fail-closed");
if (login.indexOf("AIADesks.keepSession") < login.indexOf("if (!r.ok)")) {
  throw new Error("login session write drifted before ok check");
}

console.log("check-onboard-session: ok");
