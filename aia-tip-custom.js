(function () {
  function add() {
    if (!window.AIATip || !AIATip.tips) return false;
    if (AIATip.tips["custom-drop"] && AIATip.tips["card-type"]) return true;
    AIATip.tips["custom-drop"] = {
      title: "Custom Drop",
      body: "Name your own drop and pick a card type. Ask Desk AI to draft — visible, not a silent bind. You still tap Yes, then Start. Collect stays HOLD.",
      ask: "How do I draft a Custom Drop?"
    };
    AIATip.tips["card-type"] = {
      title: "Card type",
      body: "Pick a task, errand, list, idea, project, build, request, note, or custom. The type shows on the card face. Yes / Stop stay human.",
      ask: "What card types can I pick?"
    };
    return true;
  }
  function boot() {
    if (add()) return;
    setTimeout(boot, 50);
    setTimeout(boot, 200);
    setTimeout(boot, 800);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
