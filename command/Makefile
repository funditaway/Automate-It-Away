.PHONY: help keygen rotate doctor verify replay export verify-audit verify-slice status archive reconcile smoke release start backup maintain test

SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help

help:
	@echo "AIA command targets: keygen | rotate | doctor | verify | replay | export | verify-audit | verify-slice | status | archive | reconcile | smoke | release | start | backup | maintain | test"

keygen:
	node keygen.js

rotate:
	node rotateKey.js

doctor:
	node doctor.js

verify:
	node verifyLedger.js

replay:
	node replayPacks.js

export:
	node exportAudit.js

verify-audit:
	@test -n "$(BUNDLE)" || (echo "Usage: make verify-audit BUNDLE=path/to/aia-audit.json" >&2; exit 1)
	node verifyAuditBundle.js "$(BUNDLE)"

status:
	node statusSummary.js

archive:
	node archiveLedgerWindow.js $(ARCHIVE_FLAGS)

verify-slice:
	@test -n "$(SLICE)" || (echo "Usage: make verify-slice SLICE=path/to/ledger-slice.ndjson" >&2; exit 1)
	node verifyLedgerSlice.js "$(SLICE)" $(META)

reconcile:
	node reconcileQueue.js $(RECONCILE_FLAGS)

smoke:
	./smoke.sh

release:
	./releaseCheck.sh

start:
	./start.sh

backup:
	./backup.sh

maintain:
	./maintain.sh

test:
	npm test
