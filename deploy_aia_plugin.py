#!/usr/bin/env python3
"""
AIA Plugin Global Integration Script for Grok Bot
Orchestrated by AIA Bot Admin (5-Bot Cluster)
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

PLUGIN_NAME = "automate-it-away"
ROOT = Path(__file__).resolve().parent
PLUGIN_DIR = ROOT / "plugins" / PLUGIN_NAME
MARKETPLACE_DIR = ROOT / ".marketplace" / "plugin-marketplace"


def run_cmd(command: str, cwd: Path | None = None) -> str:
    print(f"Executing: {command}")
    result = subprocess.run(
        command,
        shell=True,
        capture_output=True,
        text=True,
        cwd=str(cwd or ROOT),
    )
    if result.returncode != 0:
        print(f"Error: {result.stderr or result.stdout}")
        sys.exit(1)
    if result.stdout.strip():
        print(result.stdout)
    return result.stdout


def ensure_plugin() -> None:
    print(f"=== Builder: validating {PLUGIN_DIR} ===")
    if not PLUGIN_DIR.is_dir():
        print(f"Error: Plugin directory {PLUGIN_DIR} not found.")
        sys.exit(1)
    required = [
        ".grok-plugin/plugin.json",
        ".cursor-plugin/plugin.json",
        ".mcp.json",
        "mcp/server.mjs",
        "skills/automate-it-away/SKILL.md",
        "README.md",
        "LICENSE",
    ]
    missing = [rel for rel in required if not (PLUGIN_DIR / rel).exists()]
    if missing:
        print("Error: missing plugin files:")
        for rel in missing:
            print(f"  - {rel}")
        sys.exit(1)
    run_cmd("node scripts/check-aia-grok-plugin.js")


def ensure_marketplace_checkout() -> Path:
    print("=== Integrator: preparing plugin-marketplace checkout ===")
    MARKETPLACE_DIR.parent.mkdir(parents=True, exist_ok=True)
    if not (MARKETPLACE_DIR / ".git").exists():
        run_cmd(
            "git clone --depth 1 https://github.com/xai-org/plugin-marketplace.git "
            + str(MARKETPLACE_DIR)
        )
    else:
        run_cmd("git fetch origin main && git checkout main && git pull --ff-only origin main", cwd=MARKETPLACE_DIR)
    return MARKETPLACE_DIR


def plugin_commit_sha() -> str:
    out = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=str(ROOT), text=True)
    sha = out.strip().lower()
    if len(sha) != 40:
        print(f"Error: expected 40-char commit SHA, got {sha!r}")
        sys.exit(1)
    return sha


def upsert_marketplace_entry(marketplace: Path, sha: str) -> None:
    print("=== Integrator: registering catalog entry ===")
    catalog_path = marketplace / ".grok-plugin" / "marketplace.json"
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    entry = {
        "name": PLUGIN_NAME,
        "description": (
            "Automate It Away desks for Grok: capture exceptions, qualify work, "
            "ship with owner taps, and manage packs, rules, and queues via MCP + skills."
        ),
        "category": "productivity",
        "source": {
            "source": "url",
            "url": "https://github.com/funditaway/Automate-It-Away.git",
            "sha": sha,
            "path": f"plugins/{PLUGIN_NAME}",
        },
        "homepage": "https://automateitaway.com",
        "keywords": [
            "automate-it-away",
            "automate it away",
            "aia",
            "aia desk",
            "aia packs",
        ],
        "domains": ["automateitaway.com", "www.automateitaway.com", "api.automateitaway.com"],
    }
    plugins = catalog.setdefault("plugins", [])
    replaced = False
    for i, existing in enumerate(plugins):
        if existing.get("name") == PLUGIN_NAME:
            plugins[i] = entry
            replaced = True
            break
    if not replaced:
        plugins.append(entry)
    catalog_path.write_text(json.dumps(catalog, indent=2) + "\n", encoding="utf-8")
    print(f"Catalog entry {'updated' if replaced else 'added'} for {PLUGIN_NAME} @ {sha}")


def validate_marketplace(marketplace: Path) -> None:
    print("=== Validator: generate index + validate catalog ===")
    run_cmd("python3 scripts/generate-plugin-index.py", cwd=marketplace)
    run_cmd("python3 scripts/validate-catalog.py", cwd=marketplace)
    run_cmd("python3 scripts/generate-plugin-index.py --check", cwd=marketplace)


def main() -> None:
    print(f"=== Starting AIA Plugin Integration Pipeline for {PLUGIN_NAME} ===")
    ensure_plugin()

    # Local package tests
    if (PLUGIN_DIR / "tests").is_dir():
        run_cmd(f"pytest {PLUGIN_DIR / 'tests'}")
    else:
        print("No local tests directory found; skipping unit tests.")

    # Smoke the MCP initialize + tools/list + health
    print("=== Validator: MCP smoke ===")
    smoke = (
        'printf \'%s\\n\' '
        '\'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"deploy","version":"0"}}}\' '
        '\'{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\' '
        '\'{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"aia_health","arguments":{}}}\' '
        f"| node {PLUGIN_DIR / 'mcp' / 'server.mjs'}"
    )
    run_cmd(smoke)

    sha = plugin_commit_sha()
    marketplace = ensure_marketplace_checkout()
    upsert_marketplace_entry(marketplace, sha)
    validate_marketplace(marketplace)

    print("=== AIA Plugin successfully validated and prepared for global deployment! ===")
    print(f"Pinned SHA: {sha}")
    print(f"Marketplace checkout: {marketplace}")
    print("Next: open PR from fork against xai-org/plugin-marketplace main.")


if __name__ == "__main__":
    main()
