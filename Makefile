.DEFAULT_GOAL := help

SHELL := /usr/bin/env bash
.SHELLFLAGS := -euo pipefail -c

BACKEND_DIR := backend
FRONTEND_DIR := frontend

NODE_WRAP := bash scripts/with_node.sh

.PHONY: help
help: ## Show available targets
	@grep -E '^[a-zA-Z0-9_.-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  %-26s %s\n", $$1, $$2}'

.PHONY: setup
setup: backend-sync frontend-sync ## Install/sync backend + frontend deps

.PHONY: all
all: setup format check ## Run everything (deps + format + CI-equivalent checks)

.PHONY: backend-sync
backend-sync: ## uv sync backend deps (includes dev extra)
	cd $(BACKEND_DIR) && uv sync --extra dev

.PHONY: frontend-tooling
frontend-tooling: ## Verify frontend toolchain (node + npm)
	@$(NODE_WRAP) --check

.PHONY: frontend-sync
frontend-sync: frontend-tooling ## npm install frontend deps
	$(NODE_WRAP) --cwd $(FRONTEND_DIR) npm install

.PHONY: format
format: backend-format frontend-format ## Format backend + frontend

.PHONY: backend-format
backend-format: ## Format backend (isort + black)
	cd $(BACKEND_DIR) && uv run isort .
	cd $(BACKEND_DIR) && uv run black .

.PHONY: frontend-format
frontend-format: frontend-tooling ## Format frontend (prettier)
	$(NODE_WRAP) --cwd $(FRONTEND_DIR) npx prettier --write "src/**/*.{ts,tsx,js,jsx,json,css,md}" "*.{ts,js,json,md,mdx}"

.PHONY: format-check
format-check: backend-format-check frontend-format-check ## Check formatting (no changes)

.PHONY: backend-format-check
backend-format-check: ## Check backend formatting (isort + black)
	cd $(BACKEND_DIR) && uv run isort . --check-only --diff
	cd $(BACKEND_DIR) && uv run black . --check --diff

.PHONY: frontend-format-check
frontend-format-check: frontend-tooling ## Check frontend formatting (prettier)
	$(NODE_WRAP) --cwd $(FRONTEND_DIR) npx prettier --check "src/**/*.{ts,tsx,js,jsx,json,css,md}" "*.{ts,js,json,md,mdx}"

.PHONY: lint
lint: backend-lint frontend-lint docs-lint ## Lint backend + frontend + docs

.PHONY: backend-lint
backend-lint: backend-format-check backend-typecheck ## Lint backend (isort/black checks + flake8 + mypy)
	cd $(BACKEND_DIR) && uv run flake8 --config .flake8

.PHONY: frontend-lint
frontend-lint: frontend-tooling ## Lint frontend (eslint)
	$(NODE_WRAP) --cwd $(FRONTEND_DIR) npm run lint

.PHONY: typecheck
typecheck: backend-typecheck frontend-typecheck ## Typecheck backend + frontend

.PHONY: backend-typecheck
backend-typecheck: ## Typecheck backend (mypy --strict)
	cd $(BACKEND_DIR) && uv run mypy

.PHONY: frontend-typecheck
frontend-typecheck: frontend-tooling ## Typecheck frontend (tsc)
	$(NODE_WRAP) --cwd $(FRONTEND_DIR) npx tsc -p tsconfig.json --noEmit

.PHONY: test
test: backend-test frontend-test ## Run tests

.PHONY: backend-test
backend-test: ## Backend tests (pytest)
	cd $(BACKEND_DIR) && uv run pytest

.PHONY: backend-coverage
backend-coverage: ## Backend tests with coverage gate (scoped 100% stmt+branch on selected modules)
	# Policy: enforce 100% coverage only for the explicitly scoped, unit-testable backend modules.
	# Rationale: overall API/DB coverage is currently low; we will expand the scope as we add tests.
	cd $(BACKEND_DIR) && uv run pytest \
		--cov=app.core.error_handling \
		--cov=app.services.mentions \
		--cov-branch \
		--cov-report=term-missing \
		--cov-report=xml:coverage.xml \
		--cov-report=json:coverage.json \
		--cov-fail-under=100

.PHONY: frontend-test
frontend-test: frontend-tooling ## Frontend tests (vitest)
	$(NODE_WRAP) --cwd $(FRONTEND_DIR) npm run test

.PHONY: backend-migrate
backend-migrate: ## Apply backend DB migrations (uses backend/migrations)
	cd $(BACKEND_DIR) && uv run alembic upgrade head

.PHONY: backend-migration-check
backend-migration-check: ## Validate migration graph + reversible path on clean Postgres
	@set -euo pipefail; \
	(cd $(BACKEND_DIR) && uv run python scripts/check_migration_graph.py); \
	CONTAINER_NAME="mc-migration-check-$$RANDOM"; \
	docker run -d --rm --name $$CONTAINER_NAME -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=migration_ci -p 55432:5432 postgres:16 >/dev/null; \
	cleanup() { docker rm -f $$CONTAINER_NAME >/dev/null 2>&1 || true; }; \
	trap cleanup EXIT; \
	for i in $$(seq 1 30); do \
		if docker exec $$CONTAINER_NAME pg_isready -U postgres -d migration_ci >/dev/null 2>&1; then break; fi; \
		sleep 1; \
		if [ $$i -eq 30 ]; then echo "Postgres did not become ready"; exit 1; fi; \
	done; \
	cd $(BACKEND_DIR) && \
		AUTH_MODE=local \
		LOCAL_AUTH_TOKEN=ci-local-token-ci-local-token-ci-local-token-ci-local-token \
		BASE_URL=http://localhost:8000 \
		DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:55432/migration_ci \
		uv run alembic upgrade head && \
		AUTH_MODE=local \
		LOCAL_AUTH_TOKEN=ci-local-token-ci-local-token-ci-local-token-ci-local-token \
		BASE_URL=http://localhost:8000 \
		DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:55432/migration_ci \
		uv run alembic downgrade base && \
		AUTH_MODE=local \
		LOCAL_AUTH_TOKEN=ci-local-token-ci-local-token-ci-local-token-ci-local-token \
		BASE_URL=http://localhost:8000 \
		DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:55432/migration_ci \
		uv run alembic upgrade head

.PHONY: build
build: frontend-build ## Build artifacts

.PHONY: frontend-build
frontend-build: frontend-tooling ## Build frontend (next build)
	$(NODE_WRAP) --cwd $(FRONTEND_DIR) npm run build

.PHONY: api-gen
api-gen: frontend-tooling ## Regenerate TS API client (requires backend running at 127.0.0.1:8000)
	$(NODE_WRAP) --cwd $(FRONTEND_DIR) npm run api:gen

.PHONY: docker-up
docker-up: ## Start full Docker stack with image rebuild
	docker compose -f compose.yml --env-file .env up -d --build

.PHONY: docker-watch
docker-watch: ## Start stack in watch mode (auto rebuild frontend on UI changes)
	docker compose -f compose.yml --env-file .env up --build --watch

.PHONY: docker-watch-only
docker-watch-only: ## Attach file watch to an already-running stack
	docker compose -f compose.yml --env-file .env watch

.PHONY: docker-down
docker-down: ## Stop full Docker stack
	docker compose -f compose.yml --env-file .env down

.PHONY: rq-worker
rq-worker: ## Run background queue worker loop
	cd $(BACKEND_DIR) && uv run python ../scripts/rq worker

.PHONY: backend-templates-sync
backend-templates-sync: ## Sync templates to existing gateway agents (usage: make backend-templates-sync GATEWAY_ID=<uuid> SYNC_ARGS="--reset-sessions --overwrite")
	@if [ -z "$(GATEWAY_ID)" ]; then echo "GATEWAY_ID is required (uuid)"; exit 1; fi
	cd $(BACKEND_DIR) && uv run python scripts/sync_gateway_templates.py --gateway-id "$(GATEWAY_ID)" $(SYNC_ARGS)

# ---------------------------------------------------------------------------
# Deploy helpers — run after any backend container rebuild to restore agent auth
# ---------------------------------------------------------------------------

# Auto-detect the first gateway ID from the running backend (requires LOCAL_AUTH_TOKEN in .env).
_GATEWAY_ID ?= $(shell \
	set -a && . ./.env && set +a && \
	curl -sf "$${BASE_URL:-http://localhost:8000}/api/v1/gateways?limit=1" \
		-H "Authorization: Bearer $${LOCAL_AUTH_TOKEN}" \
		2>/dev/null \
	| python3 -c "import json,sys; items=json.load(sys.stdin).get('items',[]); print(items[0]['id'] if items else '')" \
	2>/dev/null)

.PHONY: sync-tokens
sync-tokens: ## Rotate + sync agent tokens after a backend rebuild (fixes 401s) [auto-detects GATEWAY_ID]
	@set -a && . ./.env && set +a; \
	GW_ID="$${GATEWAY_ID:-$(_GATEWAY_ID)}"; \
	if [ -z "$$GW_ID" ]; then \
		echo "ERROR: Could not detect gateway ID. Set GATEWAY_ID=<uuid> or ensure the backend is running and LOCAL_AUTH_TOKEN is set in .env"; \
		exit 1; \
	fi; \
	echo "Rotating agent tokens for gateway $$GW_ID..."; \
	RESULT=$$(curl -sf -X POST \
		"$${BASE_URL:-http://localhost:8000}/api/v1/gateways/$$GW_ID/templates/sync?rotate_tokens=true" \
		-H "Authorization: Bearer $${LOCAL_AUTH_TOKEN}" \
		-H "Content-Type: application/json"); \
	if [ $$? -ne 0 ]; then echo "ERROR: sync request failed — is the backend running?"; exit 1; fi; \
	echo "$$RESULT" | python3 -c \
		"import json,sys; r=json.load(sys.stdin); print(f'  updated={r.get(\"agents_updated\",\"?\")}, skipped={r.get(\"agents_skipped\",\"?\")}, errors={len(r.get(\"errors\",[]))}')"; \
	echo "Token rotation complete. Agents will authenticate on next heartbeat."

.PHONY: deploy-backend
deploy-backend: ## Rebuild backend container + rotate agent tokens (run this instead of plain docker compose up)
	@echo "[1/2] Rebuilding backend container..."
	docker compose -f compose.yml --env-file .env up -d --build --no-deps backend
	@echo "Waiting for backend to become healthy..."
	@for i in $$(seq 1 30); do \
		if curl -sf http://localhost:$${BACKEND_PORT:-8000}/healthz >/dev/null 2>&1; then \
			echo "Backend is healthy."; break; \
		fi; \
		if [ $$i -eq 30 ]; then echo "Backend did not become healthy in time"; exit 1; fi; \
		sleep 2; \
	done
	@echo "[2/2] Rotating agent tokens..."
	@$(MAKE) sync-tokens

.PHONY: deploy-frontend
deploy-frontend: ## Rebuild frontend container only
	docker compose -f compose.yml --env-file .env up -d --build --no-deps frontend

.PHONY: deploy-all
deploy-all: ## Rebuild all containers + rotate agent tokens
	@echo "[1/2] Rebuilding all containers..."
	docker compose -f compose.yml --env-file .env up -d --build
	@echo "Waiting for backend to become healthy..."
	@for i in $$(seq 1 30); do \
		if curl -sf http://localhost:$${BACKEND_PORT:-8000}/healthz >/dev/null 2>&1; then \
			echo "Backend is healthy."; break; \
		fi; \
		if [ $$i -eq 30 ]; then echo "Backend did not become healthy in time"; exit 1; fi; \
		sleep 2; \
	done
	@echo "[2/2] Rotating agent tokens..."
	@$(MAKE) sync-tokens

.PHONY: check
check: lint typecheck backend-coverage frontend-test build ## Run lint + typecheck + tests + coverage + build


.PHONY: docs-lint
docs-lint: frontend-tooling ## Lint markdown files (tiny ruleset; avoids noisy churn)
	$(NODE_WRAP) npx markdownlint-cli2@0.15.0 --config .markdownlint-cli2.yaml "**/*.md"

.PHONY: docs-link-check
docs-link-check: ## Check for broken relative links in markdown docs
	python scripts/check_markdown_links.py

.PHONY: docs-check
docs-check: docs-lint docs-link-check ## Run all docs quality gates
