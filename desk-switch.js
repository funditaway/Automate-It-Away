(function (root) {
  var KEY = "aia_desks";
  var store = root.localStorage;

  function slugify(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
  }

  function list() {
    try {
      var raw = JSON.parse((store && store.getItem(KEY)) || "[]");
      if (!Array.isArray(raw)) return [];
      return raw.filter(function (d) { return d && d.slug; });
    } catch (e) {
      return [];
    }
  }

  function write(rows) {
    if (store) store.setItem(KEY, JSON.stringify(rows));
  }

  function find(slug) {
    slug = slugify(slug);
    if (!slug) return null;
    var rows = list();
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].slug === slug) return rows[i];
    }
    return null;
  }

  function add(desk) {
    var slug = slugify(desk && (desk.slug || desk.biz));
    if (!slug) return null;
    var pin = desk.pin != null ? String(desk.pin) : "";
    var name = String((desk && (desk.name || desk.biz)) || slug);
    var role = String((desk && desk.role) || "");
    var rows = list();
    var found = false;
    rows = rows.map(function (d) {
      if (d.slug !== slug) return d;
      found = true;
      return {
        slug: slug,
        name: name || d.name,
        pin: pin || d.pin,
        role: role || d.role
      };
    });
    if (!found) rows.push({ slug: slug, name: name, pin: pin, role: role });
    write(rows);
    return find(slug);
  }

  function remember() {
    if (!store) return null;
    var slug = store.getItem("aia_ws");
    var pin = store.getItem("aia_pin");
    if (!slug || !pin) return null;
    return add({
      slug: slug,
      name: store.getItem("aia_desk_name") || slug,
      pin: pin,
      role: store.getItem("aia_role") || ""
    });
  }

  function open(desk) {
    var row = add(desk);
    if (!row || !store) return null;
    store.setItem("aia_ws", row.slug);
    if (row.pin) store.setItem("aia_pin", row.pin);
    if (row.role) store.setItem("aia_role", row.role);
    if (row.name) store.setItem("aia_desk_name", row.name);
    return row;
  }

  function current() {
    if (!store) return null;
    var slug = store.getItem("aia_ws");
    if (!slug) return null;
    return find(slug) || {
      slug: slug,
      name: store.getItem("aia_desk_name") || slug,
      pin: store.getItem("aia_pin") || "",
      role: store.getItem("aia_role") || ""
    };
  }

  function unlock() {
    if (!store) return;
    store.removeItem("aia_pin");
  }

  function switchTo(slug) {
    var desk = find(slug);
    if (!desk) return null;
    return open(desk);
  }

  function shopOpen() {
    return !!(store && store.getItem("aia_ws") && store.getItem("aia_pin"));
  }

  function queryWs() {
    var search = (root.location && root.location.search) || "";
    var raw = "";
    if (typeof root.URLSearchParams === "function") {
      try { raw = new root.URLSearchParams(search).get("ws") || ""; } catch (e) { raw = ""; }
    } else {
      var m = String(search).match(/[?&]ws=([^&]+)/);
      raw = m ? m[1] : "";
    }
    return slugify(raw);
  }

  function widgetHref(slug) {
    var use = slugify(slug || "");
    if (use) return "/drop?ws=" + encodeURIComponent(use);
    return "/drop";
  }

  function captureDesk() {
    var qslug = queryWs();
    if (qslug) {
      var saved = find(qslug);
      if (saved) {
        return { slug: saved.slug, name: saved.name, pin: saved.pin, role: saved.role, captureOnly: true };
      }
      return { slug: qslug, name: qslug, pin: "", role: "", embed: true };
    }
    if (shopOpen()) {
      var cur = current();
      if (cur && cur.slug) return cur;
    }
    return null;
  }

  function defaultNouns() {
    return { capture: "Capture", qualify: "Qualify", do: "Do", collect: "Collect", follow: "Follow" };
  }

  function nounsOf(src) {
    var d = defaultNouns();
    var n = src && typeof src === "object" ? src : {};
    function one(k) {
      var t = String(n[k] == null ? "" : n[k]).trim().replace(/\s+/g, " ").slice(0, 24);
      return t || d[k];
    }
    return {
      capture: one("capture"),
      qualify: one("qualify"),
      do: one("do"),
      collect: one("collect"),
      follow: one("follow")
    };
  }

  function stepNoun(step, nouns) {
    var n = nounsOf(nouns);
    var s = String(step || "").toLowerCase();
    if (/captur|drop|intake/.test(s)) return n.capture;
    if (/qualif|fit/.test(s)) return n.qualify;
    if (/collect|paid|pay/.test(s)) return n.collect;
    if (/follow/.test(s)) return n.follow;
    if (/do|draft|work/.test(s)) return n.do;
    return n.qualify;
  }

  remember();

  root.AIADesks = {
    list: list,
    add: add,
    find: find,
    open: open,
    current: current,
    remember: remember,
    unlock: unlock,
    switchTo: switchTo,
    widgetHref: widgetHref,
    captureDesk: captureDesk,
    queryWs: queryWs,
    shopOpen: shopOpen,
    slugify: slugify,
    defaultNouns: defaultNouns,
    nounsOf: nounsOf,
    stepNoun: stepNoun
  };
})(typeof window !== "undefined" ? window : globalThis);
