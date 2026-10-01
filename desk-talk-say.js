/* Talk · Say · Reply — load after desk-needs.js. Confirm HR; never silent bind. */
(function () {
  function replyBoxOf(id, where) {
    const safe = String(id || "").replace(/[^a-zA-Z0-9_-]/g, "");
    const surface = String(where || "queue").replace(/[^a-zA-Z0-9_-]/g, "") || "queue";
    const root = (document.getElementById("sheet") && document.getElementById("sheet").classList.contains("on") && document.getElementById("sheet-card"))
      || document.querySelector('[data-job="' + safe + '"]')
      || document.getElementById("sheet-card");
    return (root && root.querySelector && root.querySelector(".q-reply-box"))
      || document.getElementById("q-reply-" + surface + "-" + safe)
      || document.getElementById("q-reply-" + safe)
      || document.getElementById("job-note");
  }
  window.talkOnCard = function (id, where) {
    const banner = document.getElementById("banner");
    const box = replyBoxOf(id, where);
    if (!box) {
      if (banner) banner.textContent = "Talk / Say / Reply on this card.";
      return;
    }
    if (!window.AIASpeech || !AIASpeech.canListen || !AIASpeech.canListen()) {
      if (banner) banner.textContent = "Talk needs Safari or Chrome here. Type, then tap Say or Reply. Nothing sent alone.";
      try { box.focus(); } catch (e) {}
      return;
    }
    if (banner) banner.textContent = "Listening… Talk the answer. Tap Say or Reply to put it on the card. Nothing sent alone.";
    AIASpeech.listen(function (heard) {
      const text = String(heard || "").trim();
      if (text) box.value = text;
      if (banner) banner.textContent = text
        ? "Heard. Tap Say or Reply to put it on the card. Nothing sent alone."
        : "No speech heard. Type, or Talk again. Nothing sent alone.";
    }, function (msg) {
      if (banner) banner.textContent = (msg || "Talk stopped.") + " Type, then tap Say or Reply. Nothing sent alone.";
    });
  };
  window.sayOnCard = async function (id, where) {
    const banner = document.getElementById("banner");
    const safe = String(id || "").replace(/[^a-zA-Z0-9_-]/g, "");
    const box = replyBoxOf(id, where);
    const text = box ? String(box.value || "").trim() : "";
    if (!text) {
      if (banner) banner.textContent = "Type or Talk first, then Say. Nothing sent alone.";
      try { if (box) box.focus(); } catch (e) {}
      return;
    }
    if (typeof setCardBusy === "function") setCardBusy(safe, true, where);
    try {
      const who = (window.youName || (typeof youName !== "undefined" && youName) || "desk");
      const out = await api("/api/jobs", { method: "POST", body: JSON.stringify({ action: "reply", id: safe, text: text, whoTapped: who }) });
      if (banner) banner.textContent = (out && out.status >= 400)
        ? ((out.data && out.data.error) || "Could not Say on this card.")
        : "Said on the card. Nothing sent alone.";
      if (box) box.value = "";
      if (typeof load === "function") await load();
      if (String(where) === "sheet" && typeof openJob === "function") openJob(safe);
    } finally {
      if (typeof setCardBusy === "function") setCardBusy(safe, false, where);
    }
  };
  if (typeof window.replyOnCard !== "function") window.replyOnCard = window.sayOnCard;

  function enhancePrompt(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll(".q-prompt").forEach(function (prompt) {
      if (prompt.getAttribute("data-aia-talk-say") === "1") return;
      const go = prompt.querySelector(".q-prompt-go");
      const replyBtn = prompt.querySelector(".q-reply-tap");
      if (!go || !replyBtn) return;
      const onclick = replyBtn.getAttribute("onclick") || "";
      const m = onclick.match(/replyOnCard\('([^']+)','([^']+)'\)/);
      if (!m) return;
      const id = m[1], surface = m[2];
      if (!go.querySelector(".q-talk-tap")) {
        const talk = document.createElement("button");
        talk.className = "edit q-talk-tap";
        talk.type = "button";
        talk.textContent = "Talk";
        talk.setAttribute("onclick", "talkOnCard('" + id + "','" + surface + "')");
        const say = document.createElement("button");
        say.className = "edit q-say-tap";
        say.type = "button";
        say.textContent = "Say";
        say.setAttribute("onclick", "sayOnCard('" + id + "','" + surface + "')");
        go.insertBefore(say, replyBtn);
        go.insertBefore(talk, say);
      }
      const who = prompt.querySelector(".q-prompt-who");
      if (who && who.textContent.indexOf("Talk · Say · Reply") < 0) {
        who.textContent = who.textContent + " · Talk · Say · Reply";
      }
      const hold = prompt.querySelector(".q-prompt-hold");
      if (hold) hold.textContent = "Talk / Say / Reply stays on the card. Nothing sent alone.";
      const lab = prompt.querySelector(".q-prompt-lab");
      if (lab) lab.textContent = "Talk · Say · Reply on this card";
      const box = prompt.querySelector(".q-reply-box");
      if (box) box.setAttribute("placeholder", "Talk or type the answer. Nothing sent alone.");
      prompt.setAttribute("data-aia-talk-say", "1");
    });
  }

  function enhanceChips(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll(".q-prompt").forEach(function (prompt) {
      const card = prompt.closest(".q-card, .item, #sheet-card") || prompt.parentElement;
      if (!card) return;
      let chips = card.querySelector(".q-chips");
      if (chips && chips.querySelector(".q-talk-say")) return;
      if (!chips) {
        chips = document.createElement("div");
        chips.className = "q-chips";
        const head = card.querySelector(".q-head") || card;
        head.appendChild(chips);
      }
      const span = document.createElement("span");
      span.className = "q-chip q-talk-say";
      span.textContent = "Talk · Say · Reply";
      chips.appendChild(span);
    });
  }

  function scan() {
    enhancePrompt(document);
    enhanceChips(document);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scan);
  else scan();
  const mo = new MutationObserver(function () { scan(); });
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
