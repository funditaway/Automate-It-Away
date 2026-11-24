.PHONY: help keygen rotate doctor verify replay export smoke release start backup maintain test

SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help

help:
	@echo "AIA command targets: keygen | rotate | doctor | verify | replay | export | smoke | release | start | backup | maintain | test"

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
