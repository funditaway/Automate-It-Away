(function (w) {
  var HOW = [
    { id: "life", label: "Home & family", family: "Automate It Away", mean: "School form. Oil change. Neighbor text." },
    { id: "estate", label: "Estate & consignment", family: "Consign It Away", mean: "Photo to comps to listing draft. Payout waits." },
    { id: "assets", label: "Titled assets", family: "Consign It Away", mean: "VIN and title photo. Settlement waits on title." },
    { id: "auto", label: "Wholesale auto", family: "Consign It Away", mean: "Stock photo and VIN. Funds before keys is owner." },
    { id: "vita", label: "Insurance", display: "Insurance", family: "Quote It Away", mean: "Fact-find to packet draft. Bind stays off the desk." },
    { id: "legal", label: "Legal & fiduciary", family: "Automate It Away", mean: "Consult to engagement letter draft." },
    { id: "land", label: "Rural land", family: "Tony Oddo land", mean: "Parcel in. Flood, access, title." },
    { id: "btr", label: "Build-to-rent / lots", family: "Tony Oddo land", mean: "Lot reservation. City hold is owner." },
    { id: "fund", label: "Private lending", family: "Fund It Away", mean: "Deal file to term sheet. Credit waits." },
    { id: "storm", label: "Storm restoration", family: "Automate It Away", mean: "Roof photos to estimate draft." },
    { id: "gc", label: "GC & trades", family: "Automate It Away", mean: "Missed call to slot + estimate." },
    { id: "practice", label: "Practice ops", family: "Automate It Away", mean: "Recall to confirm text draft." },
    { id: "pm", label: "Property management", family: "Automate It Away", mean: "Work order to vendor draft." },
    { id: "storage", label: "Self-storage", family: "Automate It Away", mean: "Late unit to notice draft." }
  ];
  var EXTRA = [
    { id: "church", label: "Church & nonprofit", extra: 1, mean: "Thank-you and one pledge nudge." },
    { id: "repair", label: "Repair shop", extra: 1, mean: "Bay photo to estimate draft." },
    { id: "delivery", label: "Delivery & towing", extra: 1, mean: "Pin drop to ETA draft." },
    { id: "school", label: "School desk", extra: 1, mean: "Form and pickup note. Private desk." },
    { id: "files", label: "Files & paper", extra: 1, mean: "Photo or PDF. Reminder draft." },
    { id: "bakery", label: "Bakery", extra: 1, mean: "Wedding cake ticket. Wholesale invoice draft." },
    { id: "salon", label: "Salon", extra: 1, mean: "Consult follow-up. Chair fills if they ghost." },
    { id: "movers", label: "Movers", extra: 1, mean: "Phone photos to cube count draft." },
    { id: "daycare", label: "Daycare", extra: 1, mean: "Tuition retry note. Not a hallway talk." },
    { id: "photo", label: "Photo studio", extra: 1, mean: "Gallery delivery draft. Print upsell rides along." },
    { id: "tax", label: "Tax shop", extra: 1, mean: "Organizer link. Only the silent ones get a call." },
    { id: "gym", label: "Gym", extra: 1, mean: "Card-on-file decline text draft." },
    { id: "realty", label: "Listings desk", extra: 1, mean: "Address in. Flyer and remarks draft." },
    { id: "pest", label: "Pest route", extra: 1, mean: "Spring renewal link draft." },
    { id: "tow", label: "Towing", extra: 1, mean: "Pin, nearest truck, ETA draft." },
    { id: "lawn", label: "Lawn route", extra: 1, mean: "Rain skip draft. Friday refill." },
    { id: "florist", label: "Florist", extra: 1, mean: "Inquiry to packet draft." },
    { id: "vet", label: "Vet clinic", extra: 1, mean: "Due list to book-link draft." },
    { id: "clean", label: "Cleaning", extra: 1, mean: "Cancel and refill draft." },
    { id: "boutique", label: "Boutique", extra: 1, mean: "Restock and caption draft." },
    { id: "ink", label: "Tattoo", extra: 1, mean: "Consult deposit note draft." },
    { id: "brewery", label: "Brewery", extra: 1, mean: "Patio packet and tap list draft." }
  ];
  function phone(i) {
    return "417-555-01" + String(i).padStart(2, "0");
  }
  function card(desk, step, i) {
    return {
      title: "DEMO · " + desk.label + " · " + step,
      step: step,
      who: "Sam Reed",
      phone: phone(i),
      email: "demo." + desk.id + "@example.com",
      notes: desk.mean,
      draft: "Draft only. Copy, text, email, or hand it off. Desk does not send.",
      next: "Owner taps Stop."
    };
  }
  function decorate(list) {
    return list.map(function (d, i) {
      var desk = {
        id: d.id,
        label: d.label,
        display: d.display || d.label,
        family: d.family || "Automate It Away",
        mean: d.mean,
        extra: !!d.extra,
        cards: [card(d, "capture", i), card(d, "qualify", i), card(d, "do", i)]
      };
      if (d.id === "vita") {
        desk.cards.push({
          title: "DEMO · Already covered",
          step: "follow",
          who: "Jordan Lee",
          phone: "417-555-0104",
          email: "jordan.lee@example.com",
          notes: "Not a fit this year. Stop.",
          draft: "Stop. Already covered. No premium. No bind.",
          next: "Done."
        });
      }
      return desk;
    });
  }
  var desks = decorate(HOW.concat(EXTRA));
  function cards() {
    var out = [];
    desks.forEach(function (d) {
      (d.cards || []).forEach(function (c) {
        out.push({ id: d.id, label: d.label, display: d.display, family: d.family, extra: d.extra, card: c });
      });
    });
    return out;
  }
  function find(id) {
    return desks.filter(function (d) { return d.id === id; })[0] || desks[0];
  }
  var listeners = [];
  function ready(fn) {
    if (desks && desks.length) fn(desks);
    else listeners.push(fn);
  }
  function applyJson(json) {
    if (!json || !json.desks || !json.desks.length) return;
    var by = {};
    json.desks.forEach(function (d) { by[d.id] = d; });
    desks = desks.map(function (d) {
      var hit = by[d.id];
      if (!hit || !hit.cards) return d;
      return {
        id: d.id,
        label: hit.label || d.label,
        display: hit.displayPack || hit.label || d.display,
        family: hit.family || d.family,
        mean: hit.does || d.mean,
        extra: d.extra,
        cards: hit.cards.map(function (c) {
          return {
            title: c.title,
            step: c.step || "capture",
            who: c.contactName || "Sam Reed",
            phone: c.phone || "417-555-0100",
            email: c.email || "demo@example.com",
            notes: c.notes || d.mean,
            draft: c.draft || "Draft only.",
            next: c.next || "Owner taps Stop."
          };
        })
      };
    });
    listeners.forEach(function (fn) { fn(desks); });
  }
  if (typeof fetch === "function") {
    fetch("data/demo-world.json").then(function (r) { return r.ok ? r.json() : null; }).then(applyJson).catch(function () {});
  }
  w.AIADemo = { desks: desks, cards: cards, find: find, ready: ready, how: HOW, extra: EXTRA };
})(window);
