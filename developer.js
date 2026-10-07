(async function () {
  var err = document.getElementById("err");
  var QUEUE_LINE = "How the queue runs.";
  var QUEUE_HREF = "/help#queue-runs";
  function fail(msg) {
    if (err) { err.style.display = "block"; err.textContent = msg || "Could not load Creators Studio."; }
  }
  function ensureQueueRuns() {
    if (document.querySelector('a[href="' + QUEUE_HREF + '"]')) return;
    var main = document.querySelector("main") || document.body;
    if (!main) return;
    var p = document.createElement("p");
    p.className = "hint";
    p.innerHTML = "<b>" + QUEUE_LINE + "</b> Pipes → Rules When · If · Then → pack / desk AI drafts → Yes / Stop / Kill. Needs you / Talk to AIA. Not codegen, deploy, or GitHub auto-patch. Collect HOLD. Full beat: <a href=\"" + QUEUE_HREF + "\">" + QUEUE_HREF + "</a>.";
    var h1 = main.querySelector("h1");
    if (h1 && h1.parentNode) h1.parentNode.insertBefore(p, h1.nextSibling);
    else main.appendChild(p);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ensureQueueRuns);
  else ensureQueueRuns();
  try {
    var r = await fetch("/developer.z64.txt", { cache: "no-store" });
    if (!r.ok) return fail("Could not reach the desk.");
    var b64 = (await r.text()).replace(/\s+/g, "");
    var bin = atob(b64);
    var u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    if (typeof DecompressionStream === "undefined") return fail("Creators Studio needs a newer browser on this phone.");
    var stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream("gzip"));
    var text = await new Response(stream).text();
    if (text.indexOf("Creators Studio") < 0) return fail("Creators Studio pack did not load.");
    var el = document.createElement("script");
    el.text = text;
    (document.body || document.documentElement).appendChild(el);
  } catch (e) {
    fail("Could not load Creators Studio.");
  }
})();
