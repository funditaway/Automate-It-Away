        if (window.AIADropSteps && AIADropSteps.go) AIADropSteps.go("share");
        const card = document.getElementById("embed-card");
        if (card && card.scrollIntoView) card.scrollIntoView({ block: "nearest", behavior: "smooth" });
        return;