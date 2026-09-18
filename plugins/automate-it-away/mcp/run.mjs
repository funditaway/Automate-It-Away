#!/usr/bin/env node
/** Resolve plugin root whether Grok/Claude substitutes CLAUDE_PLUGIN_ROOT or not. */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const server = join(here, "server.mjs");
const child = spawn(process.execPath, [server], { stdio: "inherit", env: process.env });
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
