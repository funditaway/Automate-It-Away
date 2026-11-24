.PHONY: help keygen rotate doctor verify replay export verify-audit verify-slice verify-all status archive reconcile flush requeue watchdog smoke release start backup restore maintain install-service runbook test

SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help

help:
	@echo "AIA command targets: keygen | rotate | doctor | verify | replay | export | verify-audit | verify-slice | verify-all | status | archive | reconcile | flush | requeue | watchdog | smoke | release | start | backup | restore | maintain | install-service | runbook | test"

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

verify-all:
	node verifyAllIntegrity.js $(VERIFY_ALL_FLAGS)

reconcile:
	node reconcileQueue.js $(RECONCILE_FLAGS)

flush:
	node flushSpool.js $(FLUSH_FLAGS)

requeue:
	node requeueDeadletter.js $(REQUEUE_FLAGS)

watchdog:
	node watchdog.js $(WATCHDOG_FLAGS)

smoke:
	./smoke.sh

release:
	./releaseCheck.sh $(RELEASE_FLAGS)

start:
	./start.sh

backup:
	./backup.sh $(BACKUP_FLAGS)

restore:
	@test -n "$(ARCHIVE)" || (echo "Usage: make restore ARCHIVE=path/to/aia-state.tar.gz" >&2; exit 1)
	./restore.sh $(RESTORE_FLAGS) "$(ARCHIVE)"

maintain:
	./maintain.sh $(MAINTAIN_FLAGS)

install-service:
	./installService.sh $(INSTALL_SERVICE_FLAGS)

runbook:
	node generateRunbook.js $(RUNBOOK_FLAGS)

test:
	npm test
