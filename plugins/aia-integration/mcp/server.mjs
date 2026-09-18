#!/usr/bin/env node
/**
 * Automate It Away — stdio MCP server for Grok Build.
 *
 * JSON-RPC over stdin/stdout. Proxies only to AIA_BASE_URL
 * (default https://automateitaway.com). Auth via X-Workspace / X-Pin / X-Session.
 * No shell, no third-party hosts, no secret exfiltration.
 */
import { createInterface } from "node:readline";

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "automate-it-away", version: "1.0.0" };
const DEFAULT_BASE = "https://automateitaway.com";

function clean(v) {
  const s = String(v == null ? "" : v).trim();
  if (!s || /^\$\{[A-Z0-9_]+\}$/.test(s)) return "";
  return s;
}

function baseUrl() {
  return (clean(process.env.AIA_BASE_URL) || DEFAULT_BASE).replace(/\/+$/, "");
}

function authHeaders(extra = {}) {
  const headers = { Accept: "application/json", "Content-Type": "application/json" };
  const workspace = clean(extra.workspace) || clean(process.env.AIA_WORKSPACE);
  const pin = clean(extra.pin) || clean(process.env.AIA_PIN);
  const session = clean(extra.session) || clean(process.env.AIA_SESSION);
  if (workspace) headers["X-Workspace"] = workspace;
  if (pin) headers["X-Pin"] = pin;
  if (session) headers["X-Session"] = session;
  return { headers, workspace };
}

async function aia(method, path, { workspace, pin, session, body, query } = {}) {
  const { headers } = authHeaders({ workspace, pin, session });
  const url = new URL(baseUrl() + path);
  if (query && typeof query === "object") {
    for (const [k, v] of Object.entries(query)) {
      if (v != null && v !== "") url.searchParams.set(k, String(v));
    }
  }
  const init = { method, headers };
  if (body != null && method !== "GET" && method !== "HEAD") {
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 2000) };
  }
  if (!res.ok) {
    const err = new Error((data && (data.error || data.message)) || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function ok(obj) {
  return {
    content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }],
  };
}

function fail(e) {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify(
          { error: e.message, status: e.status || null, detail: e.data || null },
          null,
          2
        ),
      },
    ],
  };
}

const TOOLS = [
  {
    name: "aia_health",
    description: "Check Automate It Away engine health (GET /api/health).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "aia_status",
    description: "Desk status snapshot (GET /api/health?view=status).",
    inputSchema: {
      type: "object",
      properties: {
        workspace: { type: "string" },
        pin: { type: "string" },
        session: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "aia_open_desk",
    description: "Open or create a desk session (POST /api/auth).",
    inputSchema: {
      type: "object",
      properties: {
        workspace: { type: "string" },
        pin: { type: "string" },
        name: { type: "string" },
        action: { type: "string" },
      },
      required: ["workspace"],
      additionalProperties: false,
    },
  },
  {
    name: "aia_list_jobs",
    description: "List queue cards (GET /api/jobs). Optional audit/money/inbox views.",
    inputSchema: {
      type: "object",
      properties: {
        workspace: { type: "string" },
        pin: { type: "string" },
        session: { type: "string" },
        view: { type: "string", enum: ["queue", "audit", "money", "inbox"] },
      },
      additionalProperties: false,
    },
  },
  {
    name: "aia_capture",
    description: "Capture a new exception/card (POST /api/jobs action=capture).",
    inputSchema: {
      type: "object",
      properties: {
        workspace: { type: "string" },
        pin: { type: "string" },
        session: { type: "string" },
        title: { type: "string" },
        notes: { type: "string" },
        pack: { type: "string" },
        contactName: { type: "string" },
        phone: { type: "string" },
        kind: { type: "string" },
      },
      required: ["title"],
      additionalProperties: false,
    },
  },
  {
    name: "aia_qualify",
    description: "Qualify an existing card (POST /api/jobs action=qualify).",
    inputSchema: {
      type: "object",
      properties: {
        workspace: { type: "string" },
        pin: { type: "string" },
        session: { type: "string" },
        id: { type: "string" },
        notes: { type: "string" },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "aia_ship",
    description: "Owner-ship a card (POST /api/jobs action=ship). Confirm with the owner first.",
    inputSchema: {
      type: "object",
      properties: {
        workspace: { type: "string" },
        pin: { type: "string" },
        session: { type: "string" },
        id: { type: "string" },
        text: { type: "string" },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "aia_kill",
    description: "Kill a card. Requires confirm=true after explicit owner approval.",
    inputSchema: {
      type: "object",
      properties: {
        workspace: { type: "string" },
        pin: { type: "string" },
        session: { type: "string" },
        id: { type: "string" },
        killReason: { type: "string" },
        confirm: { type: "boolean" },
      },
      required: ["id", "confirm"],
      additionalProperties: false,
    },
  },
  {
    name: "aia_list_rules",
    description: "List When→If→Then rules (GET /api/rules).",
    inputSchema: {
      type: "object",
      properties: {
        workspace: { type: "string" },
        pin: { type: "string" },
        session: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "aia_list_packs",
    description: "Fetch public pack JSON from /packs/{id}.json.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
];

async function callTool(name, args = {}) {
  try {
    switch (name) {
      case "aia_health":
        return ok(await aia("GET", "/api/health"));
      case "aia_status":
        return ok(
          await aia("GET", "/api/health", {
            workspace: args.workspace,
            pin: args.pin,
            session: args.session,
            query: { view: "status" },
          })
        );
      case "aia_open_desk": {
        const body = { workspace: args.workspace };
        if (args.pin) body.pin = args.pin;
        if (args.name) body.name = args.name;
        if (args.action) body.action = args.action;
        return ok(await aia("POST", "/api/auth", { workspace: args.workspace, pin: args.pin, body }));
      }
      case "aia_list_jobs": {
        const view = args.view || "queue";
        const query =
          view === "audit"
            ? { audit: "1" }
            : view === "money"
              ? { money: "1" }
              : view === "inbox"
                ? { inbox: "1" }
                : {};
        return ok(
          await aia("GET", "/api/jobs", {
            workspace: args.workspace,
            pin: args.pin,
            session: args.session,
            query,
          })
        );
      }
      case "aia_capture":
        return ok(
          await aia("POST", "/api/jobs", {
            workspace: args.workspace,
            pin: args.pin,
            session: args.session,
            body: {
              action: "capture",
              title: args.title,
              notes: args.notes,
              pack: args.pack,
              contactName: args.contactName,
              phone: args.phone,
              kind: args.kind,
            },
          })
        );
      case "aia_qualify":
        return ok(
          await aia("POST", "/api/jobs", {
            workspace: args.workspace,
            pin: args.pin,
            session: args.session,
            body: { action: "qualify", id: args.id, notes: args.notes },
          })
        );
      case "aia_ship":
        return ok(
          await aia("POST", "/api/jobs", {
            workspace: args.workspace,
            pin: args.pin,
            session: args.session,
            body: { action: "ship", id: args.id, text: args.text },
          })
        );
      case "aia_kill":
        if (args.confirm !== true) return fail(new Error("aia_kill requires confirm=true"));
        return ok(
          await aia("POST", "/api/jobs", {
            workspace: args.workspace,
            pin: args.pin,
            session: args.session,
            body: {
              action: "kill",
              id: args.id,
              confirm: true,
              killReason: args.killReason || "Owner kill",
            },
          })
        );
      case "aia_list_rules":
        return ok(
          await aia("GET", "/api/rules", {
            workspace: args.workspace,
            pin: args.pin,
            session: args.session,
          })
        );
      case "aia_list_packs": {
        const id = String(args.id || "")
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, "")
          .slice(0, 40);
        if (!id) return fail(new Error("pack id required"));
        return ok(await aia("GET", `/packs/${id}.json`));
      }
      default:
        return fail(new Error(`Unknown tool: ${name}`));
    }
  } catch (e) {
    return fail(e);
  }
}

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

async function handle(msg) {
  if (!msg || typeof msg !== "object") return;
  if (msg.method && msg.id === undefined) return;
  const { id, method, params } = msg;
  try {
    if (method === "initialize") {
      return send({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        },
      });
    }
    if (method === "ping") return send({ jsonrpc: "2.0", id, result: {} });
    if (method === "tools/list") return send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
    if (method === "tools/call") {
      const result = await callTool(params && params.name, (params && params.arguments) || {});
      return send({ jsonrpc: "2.0", id, result });
    }
    return send({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    });
  } catch (e) {
    return send({
      jsonrpc: "2.0",
      id,
      error: { code: -32000, message: e.message || String(e) },
    });
  }
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  const trimmed = String(line || "").trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return;
  }
  handle(msg);
});
