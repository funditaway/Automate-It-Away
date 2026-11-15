require("./_env-guard");
const fs = require("fs");
const path = require("path");

function fail(msg) {
  console.error("FAIL " + msg);
  process.exitCode = 1;
}
function pass(msg) {
  console.log("ok  " + msg);
}

const root = path.join(__dirname, "..");
const files = fs.readdirSync(root).filter((f) => f.endsWith(".html"));

files.forEach((file) => {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  const m = html.match(/<header\b[\s\S]*?<\/header>/i);
  if (!m) {
    fail(file + " has no header");
    return;
  }
  const hdr = m[0];
  if (!hdr.includes('class="brand"')) fail(file + " header missing class=brand");
  if (!hdr.includes('class="brand-name">Automate It Away</span>')) {
    fail(file + " header wordmark is not Automate It Away");
  } else {
    pass(file + " wordmark");
  }
  if (/AUTOMATE\s/.test(hdr) || /automateitaway\.com/.test(hdr)) {
    fail(file + " still uses old header text");
  }
  if (hdr.includes("brand-mark") === false) fail(file + " missing brand-mark");
});

const theme = fs.readFileSync(path.join(root, "theme.css"), "utf8");
if (!theme.includes("font: 700 16px/1.15")) fail("theme.css missing 16px wordmark lock");
else pass("theme.css locks 16px wordmark");

const js = fs.readFileSync(path.join(root, "theme.js"), "utf8");
if (!js.includes("aia-header-lock")) fail("theme.js missing header lock");
else pass("theme.js injects header lock");
if (!js.includes("paintWho") || !js.includes("who-chip")) fail("theme.js missing signed-in profile chip");
else pass("theme.js paints signed-in profile");
if (js.indexOf('if (r === "agent") return "Agent"') >= 0) fail("theme.js roleLabel still says Agent");
else pass("theme.js roleLabel does not say Agent");
if (js.indexOf('if (r === "agent") return "Desk AI"') < 0) fail("theme.js roleLabel must say Desk AI");
else pass("theme.js roleLabel maps agent to Desk AI");
if (!js.includes("Desk name + code")) fail("signed-out chip must not say email login");
else pass("signed-out copy is desk name + code");
const css = fs.readFileSync(path.join(root, "theme.css"), "utf8");
if (!css.includes(".who-chip")) fail("theme.css missing .who-chip");
else pass("theme.css styles the profile chip");

// Rendered header: parse every page with jsdom, run the real theme.js, and count what people see.
// One header, one brand (mark, name, AIA), one theme button, one account chip, one tools row,
// one header-lock style, one ui-fix link, no repeated ids. Signed out: one "Sign in to your Queue"
// and no "Open my Queue". Signed in: one "Open my Queue" and no sign-in link. Desktop and phone
// paths, and theme.js loaded twice, must give the same single set.
const { JSDOM } = require("jsdom");
const themeSrc = fs.readFileSync(path.join(root, "theme.js"), "utf8");
function homeHref(h) {
  return h === "/" || h === "index.html" || h === "/index.html";
}
async function renderPage(file, opts) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, file), "utf8"), {
    url: "https://aia.test/" + file.replace(/\.html$/, ""),
    runScripts: "outside-only",
    pretendToBeVisual: true
  });
  const w = dom.window;
  w.matchMedia = function (q) {
    return { matches: !!opts.phone && /max-width/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} };
  };
  if (opts.signedIn) {
    w.localStorage.setItem("aia_ws", "alpha");
    w.localStorage.setItem("aia_session", "tok-alpha");
    w.localStorage.setItem("aia_name", "Sam");
  }
  w.eval(themeSrc);
  await new Promise(function (r) {
    if (w.document.readyState === "complete") r();
    else w.addEventListener("load", function () { r(); });
  });
  if (opts.twice) w.eval(themeSrc);
  return dom;
}
function staticDom(file) {
  const d = new JSDOM(fs.readFileSync(path.join(root, file), "utf8")).window.document;
  const tag = file + " (source)";
  const bad = [];
  if (d.querySelectorAll("header").length !== 1) bad.push("header count " + d.querySelectorAll("header").length);
  const brands = d.querySelectorAll(".brand");
  if (brands.length !== 1) bad.push(".brand count " + brands.length);
  else {
    if (brands[0].tagName !== "A") bad.push(".brand is not a link");
    if (!homeHref(brands[0].getAttribute("href") || "")) bad.push(".brand does not go home");
    if (!brands[0].closest("header")) bad.push(".brand is not in the header");
  }
  if (d.querySelectorAll(".brand-mark").length !== 1) bad.push(".brand-mark count " + d.querySelectorAll(".brand-mark").length);
  if (d.querySelectorAll(".brand-name").length !== 1) bad.push(".brand-name count " + d.querySelectorAll(".brand-name").length);
  const h = d.querySelector("header");
  if (h && h.querySelectorAll("nav").length > 1) bad.push("more than one nav in the header");
  const ids = {};
  d.querySelectorAll("[id]").forEach(function (e) { ids[e.id] = (ids[e.id] || 0) + 1; });
  const dup = Object.keys(ids).filter(function (k) { return ids[k] > 1; });
  if (dup.length) bad.push("repeated ids " + dup.join(","));
  if (bad.length) fail(tag + ": " + bad.join("; "));
  else pass(tag + " one header, one brand link home, one mark, one name, no repeated ids");
}
function renderedChecks(file, opts, d) {
  const tag = file + " (" + (opts.signedIn ? "signed in" : "signed out") + ", " + (opts.phone ? "phone" : "desktop") + (opts.twice ? ", theme.js twice" : "") + ")";
  const bad = [];
  const n = function (sel) { return d.querySelectorAll(sel).length; };
  const h = d.querySelector("header");
  if (n("header") !== 1 || !h) { fail(tag + ": header count " + n("header")); return; }
  [[".brand", 1], [".brand-mark", 1], [".brand-name", 1], [".brand-short", 1], [".theme-btn", 1], ["#aia-header-lock", 1], ["#aia-ui-fix-link", 1]].forEach(function (pair) {
    if (n(pair[0]) !== pair[1]) bad.push(pair[0] + " count " + n(pair[0]));
  });
  if (h.querySelectorAll(".hdr-tools").length !== 1) bad.push(".hdr-tools count " + h.querySelectorAll(".hdr-tools").length);
  const brand = d.querySelector(".brand");
  if (brand && (brand.tagName !== "A" || !h.contains(brand))) bad.push("brand is not a header link");
  if (brand && brand.querySelectorAll(".brand-mark, .brand-name, .brand-short").length !== 3) bad.push("brand mark/name/AIA not inside the brand link");
  const tools = h.querySelector(".hdr-tools");
  const btn = d.querySelector(".theme-btn");
  if (btn && tools && btn.parentNode !== tools) bad.push("theme button not in the tools row");
  const chips = d.querySelectorAll(".who-chip");
  const linkText = function (re) { return Array.prototype.filter.call(h.querySelectorAll("a"), function (a) { return re.test(a.textContent || ""); }).length; };
  const signIn = linkText(/Sign in to your Queue/);
  const home = d.querySelectorAll("#queue-home-link");
  const loginOut = file === "login.html" && !opts.signedIn;
  if (loginOut) {
    if (chips.length !== 0) bad.push("login page shows an account chip next to its own Open a Queue");
    if (linkText(/Open a Queue/) !== 1) bad.push("Open a Queue shown " + linkText(/Open a Queue/) + " times");
  } else {
    if (chips.length !== 1) bad.push(".who-chip count " + chips.length);
    else if (tools && chips[0].parentNode !== tools) bad.push("account chip not in the tools row");
    if (chips.length && chips[0].tagName !== "A") bad.push("account chip is not a link");
  }
  if (opts.signedIn) {
    if (home.length !== 1) bad.push("Open my Queue count " + home.length);
    else if (home[0].getAttribute("href") !== "/desk" || !/Open my Queue/.test(home[0].textContent || "")) bad.push("queue link does not open /desk");
    if (signIn !== 0) bad.push("signed in but header still says Sign in to your Queue (" + signIn + ")");
    if (chips.length === 1 && chips[0].classList.contains("signed-out")) bad.push("signed in chip marked signed-out");
  } else {
    if (home.length !== 0) bad.push("signed out but header shows Open my Queue");
    if (signIn !== (loginOut ? 0 : 1)) bad.push("Sign in to your Queue shown " + signIn + " times");
  }
  const ids = {};
  d.querySelectorAll("[id]").forEach(function (e) { ids[e.id] = (ids[e.id] || 0) + 1; });
  const dup = Object.keys(ids).filter(function (k) { return ids[k] > 1; });
  if (dup.length) bad.push("repeated ids " + dup.join(","));
  if (bad.length) fail(tag + ": " + bad.join("; "));
  else pass(tag + " one of each header item");
}

(async function () {
  let rendered = 0;
  for (const file of files.slice().sort()) {
    staticDom(file);
    for (const signedIn of [false, true]) {
      for (const phone of [false, true]) {
        for (const twice of [false, true]) {
          const opts = { signedIn: signedIn, phone: phone, twice: twice };
          let dom;
          try {
            dom = await renderPage(file, opts);
          } catch (e) {
            fail(file + " theme.js render threw: " + (e && e.message));
            continue;
          }
          renderedChecks(file, opts, dom.window.document);
          dom.window.close();
          rendered += 1;
        }
      }
    }
  }
  if (files.length < 30) fail("expected 30+ pages, found " + files.length);
  if (rendered !== files.length * 8) fail("rendered " + rendered + " of " + files.length * 8);
  else pass("rendered " + rendered + " page states (" + files.length + " pages x signed in/out x desktop/phone x once/twice)");

  if (process.exitCode) {
    console.error("check-header failed");
    process.exit(1);
  }
  console.log("check-header passed");
})().catch(function (e) {
  console.error("FAIL check-header crashed: " + (e && e.stack || e));
  process.exit(1);
});
