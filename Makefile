.DEFAULT_GOAL := help

PORT = 8828

# ── Help ──────────────────────────────────────────────────────────────────────
.PHONY: help
help:
	@echo ""
	@echo "  make serve    Start dev server → http://localhost:$(PORT)"
	@echo "  make test     Run the module tests (no browser, no backend)"
	@echo "  make kill     Kill this project's HTTP server"
	@echo ""

# ── Tests ─────────────────────────────────────────────────────────────────────
# js/state.js imports nothing and touches no DOM, so it runs under node as it
# ships. Anything needing a real page is a browser check, not a test here.
.PHONY: test
test:
	@node --test 'tests/*.test.mjs'

# ── Dev server ────────────────────────────────────────────────────────────────
.PHONY: serve
serve:
	@echo "Serving → http://localhost:$(PORT)"
	@python3 server.py

# ── Kill ──────────────────────────────────────────────────────────────────────
.PHONY: kill
kill:
	@lsof -ti :$(PORT) | xargs kill 2>/dev/null && echo "Stopped server on port $(PORT)" || echo "No server running on port $(PORT)"

# ── Backend ───────────────────────────────────────────────────────────────────
.PHONY: convex
convex:
	@npx convex dev

.PHONY: install
install:
	@npm install
