.PHONY: help keygen doctor verify replay smoke start backup maintain test

SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help

help:
	@echo "AIA command targets: keygen | doctor | verify | replay | smoke | start | backup | maintain | test"

keygen:
	node keygen.js

doctor:
	node doctor.js

verify:
	node verifyLedger.js

replay:
	node replayPacks.js

smoke:
	./smoke.sh

start:
	./start.sh

backup:
	./backup.sh

maintain:
	./maintain.sh

test:
	npm test
