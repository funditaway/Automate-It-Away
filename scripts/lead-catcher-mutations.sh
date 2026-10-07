#!/usr/bin/env bash
# Lead Catcher: break one safety rule at a time in a throwaway copy and confirm check-lead-catcher.js FAILS.
# "caught" = the checks notice that rule being removed. Never edits this working tree.
set -u
SRC="$(cd "$(dirname "$0")/.." && pwd)"; W="$(mktemp -d)"
tar -C "$SRC" --exclude=.git -cf - . | tar -C "$W" -xf -; cd "$W"
run(){ name=$1; file=$2; from=$3; to=$4; cp "$file" "$W/.bak"
  python3 - "$file" "$from" "$to" <<'PY'
import sys
f,a,b=sys.argv[1:4]; s=open(f).read(); assert a in s, ('pattern missing', a); open(f,'w').write(s.replace(a,b,1))
PY
  if timeout 120 node scripts/check-lead-catcher.js >/dev/null 2>&1; then echo "NOT CAUGHT  $name"; else echo "caught      $name"; fi; cp "$W/.bak" "$file"; }
run no-approval-check  api/_lc-engine.js "if (!a) deny('no_approval'" "if (false) deny('no_approval'"
run no-hash-check      api/_lc-engine.js "draftLib.payloadHash({ tenant_id: D.slug, id: c.id }, d) !== a.payload_hash) deny" "false) deny"
run no-invalidate      api/_lc-engine.js "if (!live.length) return 0;" "return 0;"
run no-idempotency     api/_lc-engine.js "if (done) {" "if (false) {"
run no-desk-filter     api/_lc-engine.js "const c = D.cards.find((x) => x.id === String(cardId || '') && x.desk === D.slug);" "const c = Object.values(store.load().desks).flatMap((x) => x.cards).find((x) => x.id === String(cardId || ''));"
run perm-always-true   api/_lc-policy.js "return row[i] === true;" "return true;"
run no-pack-gate       api/_lc-engine.js "function requirePackOn(D) { if (!D.pack || !D.pack.on)" "function requirePackOn(D) { if (false)"
run no-turn-on-yes     api/_lc-engine.js "if (b.confirm !== true) throw new HttpError(409, 'needs_yes', 'Turning on" "if (false) throw new HttpError(409, 'needs_yes', 'Turning on"
run no-kill-second-tap api/_lc-engine.js "if (b.confirm !== true) throw new HttpError(409, 'needs_second_tap'" "if (false) throw new HttpError(409, 'needs_second_tap'"
run desk-ai-gets-seat  api/lead-catcher.js "(ais.actorIsDeskAi(p) ? \"none\" : (D.roles && D.roles[p.id]) || defaultRole(p))" "((D.roles && D.roles[p.id]) || defaultRole(p))"
run no-injection-flag  api/_lc-extract.js "if (INJECTION.test(t)) {" "if (false) {"
run no-model-allowlist api/_lc-model.js "if (ALLOWED[k] && ALLOWED[k](v)) kept[k] = v; else dropped.push(k);" "kept[k] = v;"
run no-dedupe          api/_lc-engine.js "if (existing) {" "if (false) {"
run no-ttl             api/_lc-engine.js "> ttlMs()" "> 1e15"
run no-rerun-guard     api/_lc-engine.js "if (D.approvals.some((a) => a.draft_id === d.id && a.status === 'executed'))" "if (false)"
run no-live-block      api/_lc-store.js "return String(process.env.VERCEL_ENV || '') === 'production';" "return false;"
run silent-market-use  api/_packs.js "if ((pack.packId || pack.id) === \"lead-catcher\") {" "if (false) {"
rm -rf "$W"
