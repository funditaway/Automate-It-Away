/* Shared field tip + Ask AIA. Answer lands in Help chat (/support). Not a new product. */
(function () {
  var TIPS = {
    "your-name": {
      title: "Your name",
      body: "How this desk should say hello. Not a world @handle. Not the desk code.",
      ask: "What name do I put when I open a desk?"
    },
    "desk-name": {
      title: "Desk name",
      body: "The name of this desk. Letters and dashes. Same name on every phone. One AIA account can own more than one desk.",
      ask: "What is a desk name?"
    },
    "city": {
      title: "City",
      body: "Where this desk lives, in your words. Optional. Helps people find the right shop.",
      ask: "Why does Open desk ask for a city?"
    },
    "you-are": {
      title: "You are",
      body: "Owner opens the desk and owns Stop. Member asks to join. Owner approves. Members never Stop or send money.",
      ask: "What is the difference between Owner and Member?"
    },
    "permission": {
      title: "Permission",
      body: "Family, friend, helper, staff, or member. Owner can change this later. Same queue. Owner owns Stop.",
      ask: "What permission should I ask for on a desk?"
    },
    "desk-for": {
      title: "What this desk is for",
      body: "House, resale, insurance, or something else in your words. You can change this later. Fresh desks start empty.",
      ask: "How do I pick what a desk is for?"
    },
    "email": {
      title: "Email",
      body: "Optional second door on the same account. Min 8 characters when you set a password. No email or SMS reset.",
      ask: "Do I need email to open a desk?"
    },
    "password": {
      title: "Password",
      body: "Second door on the same AIA account. Min 8 characters. No email or SMS reset. Desk name + code still works.",
      ask: "How does email + password work on this desk?"
    },
    "desk-code": {
      title: "Desk code",
      body: "Your code for this desk. At least 4 digits. Owner and each person have their own. Do not share the owner code.",
      ask: "What is a desk code?"
    },
    "card-taps": {
      title: "What you do with a card",
      body: "Copy draft, text it, email it, or hand it to someone. Yes is the human tap. Stop cancels it. AIA does not send.",
      ask: "What do Copy draft, Text it, and Stop do?"
    },
    "open-desk": {
      title: "Open desk",
      body: "One AIA account. Desk name + code, or email + password. House, shop, company, or a private project.",
      ask: "How do I open a desk?"
    },
    "talk": {
      title: "Talk",
      body: "Say it or type it on Drop. It becomes a card. Then Yes, send it yourself, hand off, or Stop. Nobody sends money from Talk.",
      ask: "How does Talk put work on the desk?"
    },
    "give-pack": {
      title: "Give pack",
      body: "Give is the file. They install with Yes. A pack puts When → If → Then on this desk queue. Buyer binds their own keys. Yes / Stop / Kill before anything leaves. Webhook is the live pipe. Recurring update HOLD. Collect stays HOLD.",
      ask: "How do I give a pack?"
    },
    "update-pack": {
      title: "Update pack",
      body: "Update is install this .aia again with Yes. Same When → If → Then on this queue. Recurring update HOLD. No silent refresh. Collect stays HOLD.",
      ask: "How do I update a pack?"
    },
    "yes-stop-kill": {
      title: "Yes / Stop / Kill",
      body: "Yes is the human tap. Stop is the owner cancel. Kill ends it. You send the draft yourself. AIA does not send.",
      ask: "What do Yes, Stop, and Kill do?"
    },
    "needs-you": {
      title: "Needs you",
      body: "Work is on a card. A person still taps. Reply on the card does not Yes or send.",
      ask: "What does Needs you mean?"
    },
    "collect-hold": {
      title: "Collect HOLD",
      body: "Collect stays HOLD until a person taps Yes and a real money pipe is live. Yes is not a collect charge. No silent send.",
      ask: "When does Collect run?"
    },
    "connect-wallet": {
      title: "Connect existing wallet",
      body: "Your MetaMask or WalletConnect. AIA does not hold keys. Not Wallet.AIA. Collect and pack pay stay HOLD until Yes + a real pipe.",
      ask: "How do I Connect a wallet?"
    },
    "desk-ai": {
      title: "Desk AI / bots",
      body: "Name a desk AI. It drafts. Yes / Stop / Kill stay human. A bot cannot send or pay.",
      ask: "What does a desk AI do?"
    },
    "pipes": {
      title: "Pipes",
      body: "Webhook is live. Search a site. Log in opens the vendor. Named vendors wait on keys + Yes. AIA does not send.",
      ask: "What is a pipe on this desk?"
    },
    "week-shop": {
      title: "Home, shop, or both",
      body: "Type a shop or tap a chip. The five steps show that week. Collect stays HOLD. You still tap Yes.",
      ask: "How do I see How on my week?"
    },
    "practice-card": {
      title: "Practice card",
      body: "Stays on this phone. DEMO names. A real card only leaves when you copy it, text it, email it, or hand it off.",
      ask: "Is the practice card a real job?"
    },
    "drop-title": {
      title: "Title",
      body: "Short name for the card. Required to drop. Lands on this queue. You still tap Yes or Stop. Nobody sends money from here.",
      ask: "What title do I put on a Drop?"
    },
    "drop-need": {
      title: "What do you need?",
      body: "A task, an errand, a list, an idea, or a project in your words. It becomes a card. Yes / Stop stay human.",
      ask: "What do I type in What do you need?"
    },
    "support-title": {
      title: "Title",
      body: "Short name for the problem. Ask AIA answers first. Need a person? Drop a card on the AIA Admin desk.",
      ask: "What title do I put on Help?"
    },
    "support-broke": {
      title: "What broke",
      body: "What happened, which page, what you already tried. This chat stays draft / help. A person taps Yes or Stop if a card is dropped.",
      ask: "What do I write in What broke?"
    },
    "support-page": {
      title: "Which page",
      body: "The path you were on — /desk, /drop, /login. Helps the desk find it. Optional.",
      ask: "Which page do I name on Help?"
    }
  };

  function pageFrom() {
    var p = (location.pathname || "").replace(/\/+$/, "").split("/").pop() || "index";
    return p.replace(/\.html$/, "") || "index";
  }

  function context(id) {
    var tip = TIPS[id] || {};
    return {
      field: id || "",
      title: tip.title || "",
      tip: tip.body || "",
      ask: tip.ask || "I need more on this desk.",
      page: pageFrom()
    };
  }

  function askHref(id) {
    var ctx = context(id);
    return "support.html?ask=" + encodeURIComponent(ctx.ask || "") +
      "&field=" + encodeURIComponent(ctx.field || "") +
      "&tip=" + encodeURIComponent(ctx.tip || "") +
      "&from=" + encodeURIComponent(ctx.page || "");
  }

  var pop = null;
  var lastBtn = null;

  function close() {
    if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
    pop = null;
    if (lastBtn) lastBtn.setAttribute("aria-expanded", "false");
    lastBtn = null;
  }

  function place(btn) {
    if (!pop) return;
    var r = btn.getBoundingClientRect();
    var w = Math.min(320, (window.innerWidth || 360) - 16);
    var left = Math.max(8, Math.min(r.left, (window.innerWidth || 360) - w - 8));
    var top = r.bottom + 8;
    if (top + 180 > (window.innerHeight || 600)) top = Math.max(8, r.top - 188);
    pop.style.left = left + "px";
    pop.style.top = top + "px";
    pop.style.width = w + "px";
  }

  function open(btn) {
    var id = btn.getAttribute("data-aia-tip");
    var tip = TIPS[id];
    if (!tip) return;
    close();
    pop = document.createElement("div");
    pop.className = "aia-tip-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", tip.title);
    pop.innerHTML =
      "<h3></h3><p></p>" +
      "<div class=\"aia-tip-acts\">" +
      "<a class=\"ask\" href=\"\">Ask AIA</a>" +
      "<button type=\"button\" class=\"got\">Got it</button>" +
      "</div>";
    pop.querySelector("h3").textContent = tip.title;
    pop.querySelector("p").textContent = tip.body;
    var ask = pop.querySelector(".ask");
    ask.href = askHref(id);
    ask.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      location.href = askHref(id);
    });
    pop.querySelector(".got").addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      close();
    });
    document.body.appendChild(pop);
    lastBtn = btn;
    btn.setAttribute("aria-expanded", "true");
    place(btn);
  }

  function onDoc(ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    var btn = t.closest("[data-aia-tip]");
    if (btn) {
      ev.preventDefault();
      ev.stopPropagation();
      if (lastBtn === btn && pop) close();
      else open(btn);
      return;
    }
    if (pop && !t.closest(".aia-tip-pop")) close();
  }

  function bind() {
    document.addEventListener("click", onDoc);
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") close();
    });
    window.addEventListener("resize", function () {
      if (pop && lastBtn) place(lastBtn);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();

  window.AIATip = { tips: TIPS, context: context, askHref: askHref, close: close };
})();
