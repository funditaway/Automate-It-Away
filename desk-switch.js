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
        token: (desk && desk.token) || d.token || "",
        role: role || d.role,
        who: String((desk && (desk.who || desk.person)) || d.who || "")
      };
    });
    if (!found) {
      rows.push({
        slug: slug,
        name: name,
        pin: pin,
        token: (desk && desk.token) || "",
        role: role,
        who: String((desk && (desk.who || desk.person)) || "")
      });
    }
    write(rows);
    return find(slug);
  }

  function remember() {
    if (!store) return null;
    var slug = store.getItem("aia_ws");
    var pin = store.getItem("aia_pin");
    var token = store.getItem("aia_session");
    if (!slug || (!pin && !token)) return null;
    return add({
      slug: slug,
      name: store.getItem("aia_desk_name") || slug,
      pin: pin,
      token: token,
      role: store.getItem("aia_role") || "",
      who: store.getItem("aia_name") || ""
    });
  }

  function open(desk) {
    var row = add(desk);
    if (!row || !store) return null;
    store.setItem("aia_ws", row.slug);
    if (row.pin) store.setItem("aia_pin", row.pin);
    if (row.token) store.setItem("aia_session", row.token);
    if (desk && desk.token) store.setItem("aia_session", desk.token);
    if (row.role) store.setItem("aia_role", row.role);
    if (row.name) store.setItem("aia_desk_name", row.name);
    if (row.who) store.setItem("aia_name", row.who);
    else if (desk && desk.who) store.setItem("aia_name", String(desk.who));
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
      token: store.getItem("aia_session") || "",
      role: store.getItem("aia_role") || "",
      who: store.getItem("aia_name") || ""
    };
  }

  function unlock() {
    if (!store) return;
    store.removeItem("aia_pin");
    store.removeItem("aia_session");
  }

  function forget(slug) {
    slug = slugify(slug);
    if (!slug) return list();
    var rows = list().filter(function (d) { return d.slug !== slug; });
    write(rows);
    if (store && store.getItem("aia_ws") === slug) {
      store.removeItem("aia_ws");
      store.removeItem("aia_pin");
      store.removeItem("aia_session");
      store.removeItem("aia_desk_name");
      store.removeItem("aia_role");
      store.removeItem("aia_name");
    }
    return rows;
  }

  function patch(slug, fields) {
    slug = slugify(slug);
    if (!slug) return null;
    var src = fields && typeof fields === "object" ? fields : {};
    var rows = list().map(function (d) {
      if (d.slug !== slug) return d;
      return {
        slug: slug,
        name: src.name != null ? String(src.name) : d.name,
        pin: src.pin != null ? String(src.pin) : d.pin,
        role: src.role != null ? String(src.role) : d.role,
        who: src.who != null ? String(src.who) : (src.person != null ? String(src.person) : d.who || "")
      };
    });
    write(rows);
    if (store && store.getItem("aia_ws") === slug) {
      var row = rows.filter(function (d) { return d.slug === slug; })[0];
      if (row) {
        if (row.pin) store.setItem("aia_pin", row.pin);
        if (row.name) store.setItem("aia_desk_name", row.name);
        if (row.role) store.setItem("aia_role", row.role);
        if (row.who) store.setItem("aia_name", row.who);
      }
    }
    return find(slug);
  }

  function switchTo(slug) {
    var desk = find(slug);
    if (!desk) return null;
    return open(desk);
  }

  function shopOpen() {
    return !!(store && store.getItem("aia_ws") && (store.getItem("aia_session") || store.getItem("aia_pin")));
  }

  var VIEW_KEY = "aia_queue_view";

  function hasAuth(d) {
    return !!(d && d.slug && (d.pin || d.token));
  }

  function viewState() {
    try {
      var raw = JSON.parse((store && store.getItem(VIEW_KEY)) || "null");
      if (raw && (raw.mode === "all" || raw.mode === "many" || raw.mode === "one")) {
        raw.slugs = Array.isArray(raw.slugs) ? raw.slugs.map(slugify).filter(Boolean) : [];
        return raw;
      }
    } catch (e) {}
    var cur = slugify((store && store.getItem("aia_ws")) || "");
    return { mode: "one", slugs: cur ? [cur] : [] };
  }

  function setView(next) {
    if (!store) return next;
    store.setItem(VIEW_KEY, JSON.stringify(next || { mode: "one", slugs: [] }));
    return next;
  }

  function viewDesks() {
    var st = viewState();
    var rows = list().filter(hasAuth);
    if (st.mode === "all") return rows;
    var wanted = {};
    (st.slugs || []).forEach(function (s) { wanted[s] = true; });
    var out = rows.filter(function (d) { return wanted[d.slug]; });
    if (!out.length) {
      var cur = current();
      if (cur && hasAuth(cur)) return [cur];
    }
    return out;
  }

  function viewAll() {
    return setView({ mode: "all", slugs: list().filter(hasAuth).map(function (d) { return d.slug; }) });
  }

  function viewOne(slug) {
    slug = slugify(slug || (store && store.getItem("aia_ws")) || "");
    return setView({ mode: "one", slugs: slug ? [slug] : [] });
  }

  function toggleView(slug) {
    slug = slugify(slug);
    if (!slug) return viewState();
    var st = viewState();
    var rows = list().filter(hasAuth);
    if (st.mode === "all") {
      var keep = rows.map(function (d) { return d.slug; }).filter(function (s) { return s !== slug; });
      if (!keep.length) return st;
      return setView({ mode: keep.length === 1 ? "one" : "many", slugs: keep });
    }
    var slugs = (st.slugs || []).slice();
    var i = slugs.indexOf(slug);
    if (i >= 0) {
      if (slugs.length === 1) return st;
      slugs.splice(i, 1);
    } else slugs.push(slug);
    var mode = slugs.length === rows.length && rows.length > 1 ? "all" : (slugs.length > 1 ? "many" : "one");
    return setView({ mode: mode, slugs: slugs });
  }

  function viewingAll() {
    return viewState().mode === "all";
  }

  function viewLabel() {
    var rows = viewDesks();
    if (viewingAll() && rows.length > 1) return "All desks · " + rows.length;
    if (!rows.length) return "No desk";
    if (rows.length === 1) return rows[0].name || rows[0].slug;
    return rows.map(function (d) { return d.name || d.slug; }).join(" + ");
  }

  function authHeaders(extra) {
    var h = Object.assign({ "Content-Type": "application/json" }, extra || {});
    var ws = store && store.getItem("aia_ws");
    var tok = store && store.getItem("aia_session");
    var pin = store && store.getItem("aia_pin");
    if (ws) h["X-Workspace"] = ws;
    if (tok) h["X-Session"] = tok;
    else if (pin) h["X-Pin"] = pin;
    return h;
  }

  function keepSession(data, pin) {
    if (!data) return;
    var ws = data.workspace || {};
    var slug = ws.slug || (data.account && data.account.slug) || "";
    var you = data.you || {};
    var token = data.session && data.session.token;
    if (slug) store.setItem("aia_ws", slug);
    if (token) store.setItem("aia_session", token);
    if (you.role) store.setItem("aia_role", you.role);
    if (you.name) store.setItem("aia_name", you.name);
    if (you.photoUrl) store.setItem("aia_photo", you.photoUrl);
    if (ws.biz || ws.name) store.setItem("aia_desk_name", ws.biz || ws.name);
    if (data.account && data.account.id) store.setItem("aia_acct", data.account.id);
    open({
      slug: slug,
      name: ws.biz || ws.name || slug,
      pin: pin || "",
      token: token || "",
      role: you.role || "owner",
      who: you.name || ""
    });
  }

  function widgetHref(slug) {
    var use = slugify(slug || (store && store.getItem("aia_ws")) || "");
    if (!use) return "/drop";
    return "/drop?ws=" + encodeURIComponent(use);
  }

  function captureDesk() {
    var q = "";
    try {
      var search = String((typeof location !== "undefined" && location.search) || "");
      var m = search.match(/[?&]ws=([^&]*)/);
      q = m ? decodeURIComponent(String(m[1] || "").replace(/\+/g, " ")) : "";
    } catch (e) {
      q = "";
    }
    q = slugify(q);
    if (q) {
      var saved = find(q);
      if (saved) return saved;
      return { slug: q, name: q, pin: "", role: "", embed: true };
    }
    var cur = slugify((store && store.getItem("aia_ws")) || "");
    if (!cur) return null;
    return find(cur) || {
      slug: cur,
      name: (store && store.getItem("aia_desk_name")) || cur,
      pin: (store && store.getItem("aia_pin")) || "",
      role: (store && store.getItem("aia_role")) || ""
    };
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
    forget: forget,
    patch: patch,
    switchTo: switchTo,
    widgetHref: widgetHref,
    captureDesk: captureDesk,
    shopOpen: shopOpen,
    hasAuth: hasAuth,
    viewState: viewState,
    setView: setView,
    viewDesks: viewDesks,
    viewAll: viewAll,
    viewOne: viewOne,
    toggleView: toggleView,
    viewingAll: viewingAll,
    viewLabel: viewLabel,
    authHeaders: authHeaders,
    keepSession: keepSession,
    slugify: slugify,
    defaultNouns: defaultNouns,
    nounsOf: nounsOf,
    stepNoun: stepNoun
  };
})(typeof window !== "undefined" ? window : globalThis);
