/**
 * Gemini AIA Desk — standalone queue / card workspace.
 * Simulation mode by default. Toggle Live API to hit serve-queue on 127.0.0.1:3080.
 * Desk AIs draft only; approve marks Draft Ready — human Yes/Stop still ships.
 */
const API_BASE = "http://127.0.0.1:3080";

const INITIAL_CARDS = [
  {
    id: "AIA-101",
    title: "Inbound Policy Quote Intake — Commercial Auto",
    cardType: "intake-normalizer",
    priority: "HIGH",
    status: "QUEUED",
    ageMinutes: 14,
    slaMinutes: 30,
    payload: {
      source: "web-form",
      applicant: "Apex Logistics LLC",
      fleetSize: 6,
      requestedEffectiveDate: "2026-12-01",
    },
    output: null,
    auditLog: [
      { ts: "14:46:10", event: "INGESTED_FROM_WEBHOOK" },
      { ts: "14:46:11", event: "SCHEMA_VALIDATED (queue-card-schema.json)" },
    ],
  },
  {
    id: "AIA-102",
    title: "Broker of Record (BOR) Verification & Follow-Up",
    cardType: "compliance-review",
    priority: "CRITICAL",
    status: "NEEDS_APPROVAL",
    ageMinutes: 42,
    slaMinutes: 45,
    payload: {
      carrier: "Travelers",
      policyNumber: "TRV-884120",
      actionRequired: "Human sign-off on outbound carrier notice",
    },
    output: JSON.stringify(
      {
        recommendation: "APPROVE_DISPATCH",
        confidence: 0.96,
        summary: "Signature and effective date verified against state producer license.",
        hitl: "Draft Ready — human Yes required before send",
      },
      null,
      2
    ),
    auditLog: [
      { ts: "14:18:02", event: "INGESTED_FROM_DESK" },
      { ts: "14:19:05", event: "GEMINI_DRAFT_READY (Awaiting human gate)" },
    ],
  },
  {
    id: "AIA-103",
    title: "Renewal Retention Outreach — Home & Umbrella Bundle",
    cardType: "followup-drafter",
    priority: "NORMAL",
    status: "COMPLETED",
    ageMinutes: 110,
    slaMinutes: 120,
    payload: {
      accountId: "ACCT-4490",
      renewalDeltaPct: "+6.2%",
      channel: "email",
    },
    output: JSON.stringify(
      {
        subject: "Your Upcoming Policy Renewal Review",
        status: "DRAFT_READY_IN_OUTBOX",
        note: "Human Yes still required — desk never auto-sends",
      },
      null,
      2
    ),
    auditLog: [
      { ts: "13:10:00", event: "INGESTED_FROM_BATCH" },
      { ts: "13:10:04", event: "GEMINI_EXECUTED (gemini-2.5-flash)" },
      { ts: "13:12:30", event: "HUMAN_MARKED_DRAFT_READY" },
    ],
  },
];

let cards = structuredClone(INITIAL_CARDS);
let selectedIds = new Set();
let activeCardId = "AIA-101";
let liveApi = false;

const queueListEl = document.getElementById("queue-list");
const filterStatusEl = document.getElementById("filter-status");
const filterSearchEl = document.getElementById("filter-search");
const selectAllCheckbox = document.getElementById("select-all-checkbox");
const bulkActionsBar = document.getElementById("bulk-actions-bar");
const selectedCountEl = document.getElementById("selected-count");
const liveToggle = document.getElementById("live-api-toggle");
const apiBanner = document.getElementById("api-banner");

function nowStamp() {
  return new Date().toTimeString().slice(0, 8);
}

function setBanner(message, isError = false) {
  if (!message) {
    apiBanner.hidden = true;
    apiBanner.textContent = "";
    return;
  }
  apiBanner.hidden = false;
  apiBanner.textContent = message;
  apiBanner.classList.toggle("error", isError);
}

function mapApiItem(item) {
  const id = String(item.id || item.item_id || item.itemId || "");
  const statusRaw = String(item.status || item.state || "QUEUED").toUpperCase();
  const statusMap = {
    PENDING: "QUEUED",
    QUEUED: "QUEUED",
    PROCESSING: "QUEUED",
    NEEDS_REVIEW: "NEEDS_APPROVAL",
    READY: "NEEDS_APPROVAL",
    DRAFT_READY: "NEEDS_APPROVAL",
    NEEDS_APPROVAL: "NEEDS_APPROVAL",
    ESCALATED: "ESCALATED",
    FAILED: "ESCALATED",
    COMPLETED: "COMPLETED",
    DONE: "COMPLETED",
    APPROVED: "COMPLETED",
  };
  const priorityRaw = String(item.priority || "NORMAL").toUpperCase();
  const priorityMap = {
    LOW: "NORMAL",
    MEDIUM: "NORMAL",
    HIGH: "HIGH",
    URGENT: "CRITICAL",
    CRITICAL: "CRITICAL",
    NORMAL: "NORMAL",
  };
  const output =
    typeof item.output === "string"
      ? item.output
      : item.output
        ? JSON.stringify(item.output, null, 2)
        : typeof item.draft_output === "string"
          ? item.draft_output
          : item.draft_output
            ? JSON.stringify(item.draft_output, null, 2)
            : item.draft
              ? JSON.stringify(item.draft, null, 2)
              : null;
  return {
    id,
    title: item.title || item.summary || item.intent || `Queue item ${id}`,
    cardType: item.cardType || item.card_id || item.type || item.pack || "queue-item",
    priority: priorityMap[priorityRaw] || priorityRaw,
    status: statusMap[statusRaw] || statusRaw,
    ageMinutes: Number(item.ageMinutes ?? item.ageMins ?? 0),
    slaMinutes: Number(item.slaMinutes ?? item.slaMins ?? 30),
    payload: item.payload || item.extracted_entities || item.input || item.data || {},
    output,
    auditLog: Array.isArray(item.auditLog)
      ? item.auditLog
      : Array.isArray(item.audit)
        ? item.audit.map((e) =>
            typeof e === "string"
              ? { ts: nowStamp(), event: e }
              : { ts: e.ts || e.at || nowStamp(), event: e.event || e.message || String(e) }
          )
        : [{ ts: nowStamp(), event: "HYDRATED_FROM_API" }],
  };
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(body?.error || body?.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

async function hydrateFromApi() {
  const body = await apiFetch("/api/queue/status");
  const list = Array.isArray(body)
    ? body
    : body?.items || body?.queue || body?.cards || [];
  if (!list.length) {
    setBanner("Live API connected — queue empty; keeping local seed cards until intake arrives.");
    return false;
  }
  cards = list.map(mapApiItem);
  activeCardId = cards[0]?.id || null;
  selectedIds.clear();
  setBanner(`Live API · hydrated ${cards.length} card(s) from ${API_BASE}`);
  return true;
}

function getFilteredCards() {
  const statusFilter = filterStatusEl.value;
  const query = filterSearchEl.value.trim().toLowerCase();

  return cards.filter((card) => {
    const matchesStatus = statusFilter === "ALL" || card.status === statusFilter;
    const matchesQuery =
      !query ||
      card.id.toLowerCase().includes(query) ||
      card.title.toLowerCase().includes(query) ||
      card.cardType.toLowerCase().includes(query);
    return matchesStatus && matchesQuery;
  });
}

function updateMetrics() {
  document.getElementById("metric-total").textContent = cards.length;
  document.getElementById("metric-pending").textContent = cards.filter(
    (c) => c.status === "QUEUED"
  ).length;
  document.getElementById("metric-approval").textContent = cards.filter(
    (c) => c.status === "NEEDS_APPROVAL"
  ).length;
  document.getElementById("metric-escalated").textContent = cards.filter(
    (c) => c.status === "ESCALATED"
  ).length;
  document.getElementById("metric-completed").textContent = cards.filter(
    (c) => c.status === "COMPLETED"
  ).length;
}

function renderQueue() {
  const visibleCards = getFilteredCards();
  queueListEl.innerHTML = "";

  if (!visibleCards.length) {
    const empty = document.createElement("div");
    empty.className = "inspector-placeholder";
    empty.textContent = "No cards match this filter.";
    queueListEl.appendChild(empty);
    syncBulkToolbar(visibleCards);
    return;
  }

  visibleCards.forEach((card) => {
    const el = document.createElement("div");
    el.className = `queue-card ${card.id === activeCardId ? "active" : ""}`;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedIds.has(card.id);
    checkbox.addEventListener("click", (e) => {
      e.stopPropagation();
      if (checkbox.checked) selectedIds.add(card.id);
      else selectedIds.delete(card.id);
      syncBulkToolbar(visibleCards);
    });

    const body = document.createElement("div");
    body.className = "card-body";
    body.innerHTML = `
      <div class="card-header-row">
        <div>
          <span class="mono-tag">${escapeHtml(card.id)}</span>
          <span class="card-title">${escapeHtml(card.title)}</span>
        </div>
        <span class="status-badge status-${card.status}">${card.status.replaceAll("_", " ")}</span>
      </div>
      <div class="card-meta-row">
        <span>Type: <strong>${escapeHtml(card.cardType)}</strong></span>
        <span>Priority: <strong>${escapeHtml(card.priority)}</strong></span>
        <span>Age: <strong>${card.ageMinutes}m / ${card.slaMinutes}m SLA</strong></span>
      </div>
    `;

    el.appendChild(checkbox);
    el.appendChild(body);
    el.addEventListener("click", () => {
      activeCardId = card.id;
      renderAll();
    });

    queueListEl.appendChild(el);
  });

  syncBulkToolbar(visibleCards);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function syncBulkToolbar(visibleCards) {
  const count = selectedIds.size;
  bulkActionsBar.hidden = count === 0;
  selectedCountEl.textContent = `${count} selected`;
  selectAllCheckbox.checked =
    visibleCards.length > 0 && visibleCards.every((c) => selectedIds.has(c.id));
}

function renderInspector() {
  const card = cards.find((c) => c.id === activeCardId);
  const emptyEl = document.getElementById("inspector-empty");
  const contentEl = document.getElementById("inspector-content");

  if (!card) {
    emptyEl.hidden = false;
    contentEl.hidden = true;
    return;
  }

  emptyEl.hidden = true;
  contentEl.hidden = false;

  document.getElementById("insp-id").textContent = card.id;
  document.getElementById("insp-title").textContent = card.title;

  const badge = document.getElementById("insp-status-badge");
  badge.textContent = card.status.replaceAll("_", " ");
  badge.className = `status-badge status-${card.status}`;

  document.getElementById("insp-type").textContent = card.cardType;
  document.getElementById("insp-priority").textContent = card.priority;
  document.getElementById("insp-age").textContent = `${card.ageMinutes}m / ${card.slaMinutes}m`;
  document.getElementById("insp-payload").textContent = JSON.stringify(card.payload, null, 2);
  document.getElementById("insp-output").textContent =
    card.output || "Awaiting Gemini card execution...";

  const auditListEl = document.getElementById("insp-audit-list");
  auditListEl.innerHTML = card.auditLog
    .map(
      (entry) =>
        `<li><span>${escapeHtml(entry.event)}</span><span class="audit-time">${escapeHtml(entry.ts)}</span></li>`
    )
    .join("");
}

function simulateExecute(card) {
  if (card.status === "COMPLETED") return;

  const simulatedResponse = {
    cardId: card.id,
    model: "gemini-2.5-flash",
    processedAt: new Date().toISOString(),
    normalizedIntent: card.cardType,
    requiresHumanGate: card.priority === "CRITICAL" || card.priority === "HIGH",
    extractedFields: card.payload,
    hitl: "Draft Ready — does not auto-send",
  };

  card.output = JSON.stringify(simulatedResponse, null, 2);
  card.status =
    card.priority === "CRITICAL" || card.priority === "HIGH"
      ? "NEEDS_APPROVAL"
      : "NEEDS_APPROVAL";
  card.auditLog.push({
    ts: nowStamp(),
    event: `GEMINI_RUN_OK -> ${card.status} (simulation)`,
  });
}

function simulateApprove(card) {
  if (card.status === "COMPLETED") return;
  card.status = "COMPLETED";
  card.auditLog.push({
    ts: nowStamp(),
    event: "HUMAN_MARKED_DRAFT_READY -> COMPLETED (desk gate only; Yes/Stop still ships)",
  });
}

async function executeCard(card) {
  if (card.status === "COMPLETED") return;
  if (liveApi) {
    try {
      const body = await apiFetch("/api/queue/process", {
        method: "POST",
        body: JSON.stringify({ id: card.id }),
      });
      const source = body?.item || body;
      const mapped = mapApiItem({ ...card, ...source, id: card.id, item_id: card.id });
      Object.assign(card, mapped);
      if (!card.auditLog.some((e) => e.event === "API_PROCESS_OK")) {
        card.auditLog = [...(card.auditLog || []), { ts: nowStamp(), event: "API_PROCESS_OK" }];
      }
      if (card.status === "QUEUED") card.status = "NEEDS_APPROVAL";
      setBanner(`Processed ${card.id} via live API`);
      return;
    } catch (err) {
      setBanner(`Live process failed for ${card.id}: ${err.message} — fell back to simulation`, true);
    }
  }
  simulateExecute(card);
}

async function approveCard(card) {
  if (card.status === "COMPLETED") return;
  if (liveApi) {
    try {
      const body = await apiFetch("/api/queue/approve", {
        method: "POST",
        body: JSON.stringify({ id: card.id }),
      });
      const source = body?.item || body;
      const mapped = mapApiItem({ ...card, ...source, id: card.id, item_id: card.id });
      Object.assign(card, mapped);
      // Desk "approve" marks Draft Ready for human Yes — surface as COMPLETED in desk UI only.
      card.status = "COMPLETED";
      if (!card.auditLog.some((e) => String(e.event).includes("API_APPROVE_OK"))) {
        card.auditLog = [
          ...(card.auditLog || []),
          { ts: nowStamp(), event: "API_APPROVE_OK (Draft Ready)" },
        ];
      }
      setBanner(`Approved ${card.id} via live API (Draft Ready — Yes/Stop still ships)`);
      return;
    } catch (err) {
      setBanner(`Live approve failed for ${card.id}: ${err.message} — fell back to simulation`, true);
    }
  }
  simulateApprove(card);
}

function renderAll() {
  updateMetrics();
  renderQueue();
  renderInspector();
}

filterStatusEl.addEventListener("change", renderQueue);
filterSearchEl.addEventListener("input", renderQueue);

selectAllCheckbox.addEventListener("change", () => {
  const visible = getFilteredCards();
  if (selectAllCheckbox.checked) {
    visible.forEach((c) => selectedIds.add(c.id));
  } else {
    visible.forEach((c) => selectedIds.delete(c.id));
  }
  renderQueue();
});

liveToggle.addEventListener("change", async () => {
  liveApi = liveToggle.checked;
  if (!liveApi) {
    cards = structuredClone(INITIAL_CARDS);
    activeCardId = "AIA-101";
    selectedIds.clear();
    setBanner("Simulation mode — in-memory mock queue");
    renderAll();
    return;
  }
  try {
    await hydrateFromApi();
  } catch (err) {
    liveApi = false;
    liveToggle.checked = false;
    setBanner(
      `Could not reach ${API_BASE}/api/queue/status (${err.message}). Start serve-queue.mjs on loopback.`,
      true
    );
  }
  renderAll();
});

document.getElementById("btn-insp-run").addEventListener("click", async () => {
  const card = cards.find((c) => c.id === activeCardId);
  if (card) {
    await executeCard(card);
    renderAll();
  }
});

document.getElementById("btn-insp-approve").addEventListener("click", async () => {
  const card = cards.find((c) => c.id === activeCardId);
  if (card) {
    await approveCard(card);
    renderAll();
  }
});

document.getElementById("btn-process-all").addEventListener("click", async () => {
  for (const c of cards) {
    if (c.status === "QUEUED" || c.status === "ESCALATED") {
      await executeCard(c);
    }
  }
  renderAll();
});

document.getElementById("btn-escalate").addEventListener("click", () => {
  cards.forEach((c) => {
    if (c.status !== "COMPLETED") {
      c.ageMinutes += 20;
      if (c.ageMinutes >= c.slaMinutes && c.status !== "ESCALATED") {
        c.status = "ESCALATED";
        c.priority = "CRITICAL";
        c.auditLog.push({
          ts: nowStamp(),
          event: `SLA_BREACH_ESCALATED (${c.ageMinutes}m >= ${c.slaMinutes}m)`,
        });
      }
    }
  });
  renderAll();
});

document.getElementById("btn-seed").addEventListener("click", () => {
  const nextNum = 100 + cards.length + 1;
  const newCard = {
    id: `AIA-${nextNum}`,
    title: `Endorsement Request #${nextNum} — Vehicle Substitution`,
    cardType: "endorsement-intake",
    priority: "NORMAL",
    status: "QUEUED",
    ageMinutes: 1,
    slaMinutes: 30,
    payload: {
      vinLookup: "VERIFIED",
      action: "ADD_REPLACEMENT_VEHICLE",
    },
    output: null,
    auditLog: [{ ts: nowStamp(), event: "SEEDED_INTO_QUEUE" }],
  };
  cards.unshift(newCard);
  activeCardId = newCard.id;
  renderAll();
});

document.getElementById("btn-bulk-approve").addEventListener("click", async () => {
  for (const c of cards) {
    if (selectedIds.has(c.id)) await approveCard(c);
  }
  selectedIds.clear();
  renderAll();
});

document.getElementById("btn-bulk-run").addEventListener("click", async () => {
  for (const c of cards) {
    if (selectedIds.has(c.id)) await executeCard(c);
  }
  selectedIds.clear();
  renderAll();
});

document.getElementById("btn-bulk-archive").addEventListener("click", () => {
  cards = cards.filter((c) => !selectedIds.has(c.id));
  if (!cards.some((c) => c.id === activeCardId)) {
    activeCardId = cards[0]?.id || null;
  }
  selectedIds.clear();
  renderAll();
});

setBanner("Simulation mode — toggle Live API to hydrate from serve-queue on 127.0.0.1:3080");
renderAll();
