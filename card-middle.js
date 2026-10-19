/* The middle of an opened card, by type: file, lead, approval, automation.
   Builds DOM nodes with createElement and textContent only. Stored text is never parsed as HTML,
   and nothing here has an inline handler. Links are safeUrl or a strict tel: / mailto: only.
   frame() returns null for an unknown card; the caller then keeps today's generic card. */
(function (root, factory) {
  var g = root || (typeof globalThis !== "undefined" ? globalThis : this);
  var api = factory(g);
  if (typeof module === "object" && module.exports) module.exports = api;
  g.CardMiddle = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (g) {
  var MAX = 400;
  var UNSURE = "This step may have already run. Check before it tries again.";
  var IMAGE = /^image\/(png|jpeg|gif|webp)$/i;
  var IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp)(\?|#|$)/i;
  var NOT_IMAGE = /\.(pdf|heic|heif|mp4|mov|webm|docx?|txt|csv|xlsx?|pptx?|zip)(\?|#|$)/i;

  function typer() {
    if (g.CardType && g.CardType.cardType) return g.CardType;
    if (typeof require === "function") { try { return require("./card-type.js"); } catch (e) {} }
    return null;
  }
  function str(v, max) {
    if (typeof v === "number" && isFinite(v)) v = String(v);
    if (typeof v !== "string") return "";
    v = v.replace(/\s+/g, " ").trim();
    var cap = max || MAX;
    return v.length > cap ? v.slice(0, cap - 1) + "\u2026" : v;
  }
  function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
  function urlOf(opts, raw) {
    var fn = (opts && opts.safeUrl) || g.safeUrl;
    if (typeof fn !== "function" && typeof require === "function") { try { fn = require("./escape-html.js").safeUrl; } catch (e) {} }
    return typeof fn === "function" ? String(fn(raw) || "") : "";
  }
  function make(doc, tag, cls, text) {
    var el = doc.createElement(tag);
    if (cls) el.className = cls;
    if (text != null && text !== "") el.textContent = text;
    return el;
  }
  function row(doc, label, value) {
    var p = make(doc, "p", "card-row");
    p.appendChild(make(doc, "b", "", label + ": "));
    p.appendChild(make(doc, "span", "", value));
    return p;
  }
  function money(v) {
    var n = Number(v);
    if (!isFinite(n) || n <= 0) return "";
    return "$" + (Math.round(n * 100) / 100);
  }
  function bytesText(v) {
    var n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
    if (typeof n !== "number" || !isFinite(n) || n < 0) return "";
    if (n < 1024) return Math.round(n) + " B";
    var units = ["KB", "MB", "GB", "TB"], i = -1;
    do { n /= 1024; i += 1; } while (n >= 1024 && i < units.length - 1);
    return (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10) + " " + units[i];
  }
  function custom(j) { return isObj(j.custom) ? j.custom : {}; }
  function textAsk(j) { return typeof j.ask === "string" && j.ask.trim() !== "" && isNaN(Number(j.ask)) ? str(j.ask) : ""; }
  function said(j, opts) {
    var clean = opts && typeof opts.visitorLine === "function" ? opts.visitorLine : function (s) { return s; };
    return str(j.outcome) || str(custom(j).outcome) || textAsk(j) || str(clean(typeof j.why === "string" ? j.why : ""));
  }

  // ----- files, same rules as the sheet's file list -----
  function legacyName(url) {
    var last = String(url).split(/[?#]/)[0];
    last = last.slice(last.lastIndexOf("/") + 1);
    try { last = decodeURIComponent(last); } catch (e) {}
    return last || "File";
  }
  function isImage(f) {
    if (f.type) return IMAGE.test(f.type);
    return f.kind === "photo" || IMAGE_EXT.test(f.url);
  }
  function filesOf(j) {
    var out = [], seen = {};
    function add(f, legacy) {
      if (!f) return;
      var obj = isObj(f);
      var url = typeof f === "string" ? f : (obj && typeof f.url === "string" ? f.url : "");
      var name = obj ? str(f.name, 160) : "";
      if (!url && !name) return;
      if (url) { if (seen[url]) return; seen[url] = true; }
      out.push({
        url: url,
        name: name || (legacy && url ? str(legacyName(url), 160) : "File"),
        kind: obj ? str(f.kind, 40) : "",
        type: obj ? str(f.type, 80) : "",
        bytes: obj ? f.bytes : undefined
      });
    }
    (Array.isArray(j.files) ? j.files.slice(0, 8) : []).forEach(function (f) { add(f); });
    if (typeof j.photoUrl === "string" && j.photoUrl) {
      var other = NOT_IMAGE.test(j.photoUrl);
      add({ url: j.photoUrl, name: other ? "" : "Photo", kind: other ? "file" : "photo" }, true);
    }
    return out;
  }

  // How to reach: tel: / mailto: only when the stored value is plainly a phone number or an address.
  function reachBox(doc, j) {
    var box = make(doc, "div", "card-contact");
    var any = false;
    var phone = str(j.phone, 40), email = str(j.email, 160);
    if (phone) {
      var compact = phone.replace(/[\s().\-]+/g, "");
      var p = make(doc, "p", "card-row");
      p.appendChild(make(doc, "b", "", "Phone: "));
      if (/^\+?[0-9]{3,20}$/.test(compact)) {
        var a = make(doc, "a", "edit", phone);
        a.setAttribute("href", "tel:" + compact);
        p.appendChild(a);
      } else p.appendChild(make(doc, "span", "", phone));
      box.appendChild(p); any = true;
    }
    if (email) {
      var q = make(doc, "p", "card-row");
      q.appendChild(make(doc, "b", "", "Email: "));
      if (/^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/.test(email)) {
        var m = make(doc, "a", "edit", email);
        m.setAttribute("href", "mailto:" + email);
        q.appendChild(m);
      } else q.appendChild(make(doc, "span", "", email));
      box.appendChild(q); any = true;
    }
    return any ? box : null;
  }
  function contactText(j) {
    return [str(j.contactName, 120), str(j.phone, 40), str(j.email, 160)].filter(Boolean).join(" · ");
  }
  function needsYes(doc, j) {
    return j.decide === true ? make(doc, "p", "card-yes", "Needs your Yes.") : null;
  }

  // ----- the four middles -----
  function fileMiddle(doc, j, opts) {
    var box = make(doc, "div", "card-middle card-middle-file");
    var files = filesOf(j);
    if (!files.length) box.appendChild(make(doc, "p", "meta", "No file on this card yet."));
    files.forEach(function (f) {
      var item = make(doc, "div", "card-file");
      item.appendChild(make(doc, "p", "card-file-name", f.name));
      var bits = [];
      if (f.kind || f.type) bits.push(f.kind && f.type ? f.kind + " · " + f.type : (f.kind || f.type));
      var size = bytesText(f.bytes);
      if (size) bits.push(size);
      if (bits.length) item.appendChild(make(doc, "p", "meta", bits.join(" · ")));
      var href = f.url ? urlOf(opts, f.url) : "";
      if (href) {
        if (isImage(f)) {
          var img = make(doc, "img", "thumb");
          img.setAttribute("src", href);
          img.setAttribute("alt", "");
          item.appendChild(img);
        } else {
          var a = make(doc, "a", "q-file edit", f.name);
          a.setAttribute("href", href);
          a.setAttribute("rel", "noopener");
          a.setAttribute("download", f.name);
          item.appendChild(a);
        }
      }
      box.appendChild(item);
    });
    var from = str(j.from, 160), to = str(j.to, 160);
    if (from) box.appendChild(row(doc, "From", from));
    if (to) box.appendChild(row(doc, "To", to));
    var contact = contactText(j);
    if (contact) box.appendChild(row(doc, "Contact", contact));
    var yes = needsYes(doc, j);
    if (yes) box.appendChild(yes);
    return box;
  }
  function leadMiddle(doc, j, opts) {
    var box = make(doc, "div", "card-middle card-middle-lead");
    var who = str(j.contactName, 120);
    box.appendChild(row(doc, "Who", who || "No name on this card"));
    var need = [str(j.outcome), str(custom(j).outcome), textAsk(j), str(j.notes)].filter(function (t, i, a) { return t && a.indexOf(t) === i; });
    if (need.length) box.appendChild(row(doc, "What they need", need.join(" · ")));
    var reach = reachBox(doc, j);
    box.appendChild(reach || make(doc, "p", "card-row", "How to reach: no phone or email on this card."));
    var kind = str(j.kind, 40);
    if (kind) box.appendChild(row(doc, "Came in by", kind));
    var amt = money(j.amount || (typeof j.ask === "number" ? j.ask : ""));
    if (amt) box.appendChild(row(doc, "Amount", amt));
    var yes = needsYes(doc, j);
    if (yes) box.appendChild(yes);
    return box;
  }
  function approvalMiddle(doc, j, opts) {
    var box = make(doc, "div", "card-middle card-middle-approval");
    var action = str(j.draft, 600) || textAsk(j);
    if (action) {
      var d = make(doc, "div", "draft card-action", action);
      box.appendChild(d);
    }
    var amt = money(j.amount || j.ask);
    if (amt) box.appendChild(row(doc, "Amount", amt));
    var payee = str(j.payoutTo, 160);
    if (payee) box.appendChild(row(doc, "Pay to", payee));
    var risk = str(j.risk, 200);
    if (risk) box.appendChild(row(doc, "Risk", risk));
    var art = str(j.artifact, 300);
    if (art) {
      var p = make(doc, "p", "card-row");
      p.appendChild(make(doc, "b", "", "Attached: "));
      var href = urlOf(opts, art);
      if (href) { var a = make(doc, "a", "edit", art); a.setAttribute("href", href); a.setAttribute("rel", "noopener"); p.appendChild(a); }
      else p.appendChild(make(doc, "span", "", art));
      box.appendChild(p);
    }
    box.appendChild(make(doc, "p", "card-hold", "Nothing happens until you say Yes."));
    return box;
  }
  function automationMiddle(doc, j) {
    var box = make(doc, "div", "card-middle card-middle-automation");
    var run = isObj(j.run) ? j.run : {};
    var head = [];
    if (run.runNo) head.push("Run #" + str(String(run.runNo), 12));
    if (run.state) head.push(str(run.state, 40));
    if (head.length) box.appendChild(make(doc, "p", "meta", head.join(" · ")));
    var steps = Array.isArray(run.steps) ? run.steps.slice(0, 40) : [];
    if (!steps.length) box.appendChild(make(doc, "p", "meta", "No steps recorded yet."));
    else {
      var ul = make(doc, "ul", "card-steps");
      steps.forEach(function (s) {
        var o = isObj(s) ? s : { said: typeof s === "string" ? s : "" };
        var li = make(doc, "li", "card-step");
        var line = [];
        var text = str(o.said, 240) || str(o.action, 120);
        if (text) line.push(text);
        if (o.result) line.push(str(o.result, 40));
        li.appendChild(make(doc, "span", "", line.join(" · ") || "Step"));
        if (o.why) li.appendChild(make(doc, "span", "meta", " " + str(o.why, 240)));
        if (o.result === "unsure") li.appendChild(make(doc, "p", "card-unsure", UNSURE));
        ul.appendChild(li);
      });
      box.appendChild(ul);
    }
    var w = isObj(run.waiting) ? run.waiting : null;
    if (w && (w.action || w.why)) box.appendChild(row(doc, "Waiting on", [str(w.action, 120), str(w.why, 240)].filter(Boolean).join(" · ")));
    return box;
  }

  // ----- the lines above the middle -----
  function askLine(type, j, opts) {
    var line = said(j, opts);
    if (line) return line;
    if (type === "automation") {
      var run = isObj(j.run) ? j.run : {};
      return "An automation run" + (run.runNo ? " #" + str(String(run.runNo), 12) : "") + (run.state ? " is " + str(run.state, 40) : "") + ".";
    }
    if (type === "file") { var f = str(j.from, 160); return "A file came in" + (f ? " from " + f : "") + "."; }
    if (type === "lead") return (str(j.contactName, 120) || "Someone") + " reached out.";
    return "This waits for your Yes.";
  }
  function nextSteps(type, j, opts) {
    var recLine = opts && typeof opts.recLine === "function" ? opts.recLine : function (r) { return typeof r === "string" ? r : (r && (r.text || r.note)) || ""; };
    var recs = (Array.isArray(j.recs) ? j.recs : []).map(function (r) { try { return str(recLine(r)); } catch (e) { return ""; } })
      .filter(Boolean).filter(function (t, i, a) { return a.indexOf(t) === i; }).slice(0, 3);
    if (recs.length) return recs;
    if (type === "automation") {
      var steps = isObj(j.run) && Array.isArray(j.run.steps) ? j.run.steps : [];
      if (steps.some(function (s) { return s && s.result === "unsure"; })) return ["Check the unsure step first. Then Yes or Stop."];
      return ["Look at the steps. Then Yes or Stop."];
    }
    if (type === "file") return ["Open the file. Then Yes or Stop."];
    if (type === "lead") return [(str(j.phone) || str(j.email)) ? "Reach out with the contact above. Then Yes or Stop." : "Open this card. Yes or Stop."];
    return ["Check the action below. Then Yes or Stop."];
  }

  function frame(j, opts) {
    opts = opts || {};
    var T = typer();
    if (!T || !isObj(j)) return null;
    var type = T.cardType(j);
    var label = T.typeLabel(type);
    if (!label) return null;
    var doc = opts.doc || (typeof document !== "undefined" ? document : null);
    if (!doc) return null;
    var wrap = make(doc, "div", "card-frame");
    wrap.setAttribute("data-card-type", type);
    wrap.appendChild(make(doc, "h3", "", str(j.title, 200) || "Card"));
    wrap.appendChild(make(doc, "p", "card-type-label meta", label));
    wrap.appendChild(make(doc, "p", "card-ask", askLine(type, j, opts)));
    var next = make(doc, "div", "recs card-next");
    next.appendChild(make(doc, "div", "recs-title", "Next step"));
    var ul = make(doc, "ul");
    nextSteps(type, j, opts).forEach(function (t) { ul.appendChild(make(doc, "li", "", t)); });
    next.appendChild(ul);
    wrap.appendChild(next);
    var middle = type === "file" ? fileMiddle(doc, j, opts)
      : type === "lead" ? leadMiddle(doc, j, opts)
      : type === "automation" ? automationMiddle(doc, j, opts)
      : approvalMiddle(doc, j, opts);
    wrap.appendChild(middle);
    var hid = typeof j.id === "string" || typeof j.id === "number" ? String(j.id).replace(/[^a-zA-Z0-9_-]/g, "") : "";
    if (hid) {
      var mount = make(doc, "div", "card-timeline");
      mount.setAttribute("data-card", hid);
      wrap.appendChild(mount);
    }
    return wrap;
  }

  return { frame: frame, filesOf: filesOf, bytesText: bytesText, UNSURE: UNSURE };
});
