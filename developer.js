(async function () {
  var err = document.getElementById("err");
  function fail(msg) {
    if (err) { err.style.display = "block"; err.textContent = msg || "Could not load Creators Studio."; }
  }
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
