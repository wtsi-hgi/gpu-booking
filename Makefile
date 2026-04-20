.PHONY: lint format test run backend-lint backend-format backend-test frontend-lint frontend-format frontend-test frontend-e2e-test

FRONTEND_PORT ?= 3000
BACKEND_PORT ?= 8000
BACKEND_VENV_BIN := backend/.venv/bin
RUFF := $(BACKEND_VENV_BIN)/ruff
PYTEST := $(BACKEND_VENV_BIN)/pytest
PNPM := pnpm --dir frontend

lint: backend-lint frontend-lint

format: backend-format frontend-format

test: backend-test frontend-test frontend-e2e-test

run:
	FRONTEND_PORT=$(FRONTEND_PORT) BACKEND_PORT=$(BACKEND_PORT) ./run-dev.sh --frontend-port $(FRONTEND_PORT) --backend-port $(BACKEND_PORT)

backend-lint:
	@test -x $(RUFF) || { echo "Missing $(RUFF). Install backend dev dependencies first."; exit 1; }
	cd backend && .venv/bin/ruff check .

backend-format:
	@test -x $(RUFF) || { echo "Missing $(RUFF). Install backend dev dependencies first."; exit 1; }
	cd backend && .venv/bin/ruff check --fix . && .venv/bin/ruff format .

backend-test:
	@test -x $(PYTEST) || { echo "Missing $(PYTEST). Install backend dev dependencies first."; exit 1; }
	cd backend && .venv/bin/pytest tests/ -v

frontend-lint:
	$(PNPM) lint

frontend-format:
	$(PNPM) format

frontend-test:
	$(PNPM) test

frontend-e2e-test:
	$(PNPM) test:e2e