.PHONY: lint format format-check test run backend-lint backend-format backend-format-check backend-test frontend-lint frontend-format frontend-format-check frontend-test frontend-e2e-test

ifneq (,$(wildcard .env))
include .env
export $(shell sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)=.*/\1/p' .env)
endif

GPU_BOOKING_FRONTEND_PORT ?= 3000
GPU_BOOKING_BACKEND_PORT ?= 8000
BACKEND_VENV_BIN := backend/.venv/bin
RUFF := $(BACKEND_VENV_BIN)/ruff
PYTEST := $(BACKEND_VENV_BIN)/pytest
PNPM := pnpm --dir frontend

lint: backend-lint frontend-lint

format: backend-format frontend-format

format-check: backend-format-check frontend-format-check

test: backend-test frontend-test frontend-e2e-test

run:
	GPU_BOOKING_FRONTEND_PORT=$(GPU_BOOKING_FRONTEND_PORT) GPU_BOOKING_BACKEND_PORT=$(GPU_BOOKING_BACKEND_PORT) ./run-dev.sh --frontend-port $(GPU_BOOKING_FRONTEND_PORT) --backend-port $(GPU_BOOKING_BACKEND_PORT)

backend-lint:
	@test -x $(RUFF) || { echo "Missing $(RUFF). Install backend dev dependencies first."; exit 1; }
	cd backend && .venv/bin/ruff check . && .venv/bin/ruff format --check .

backend-format:
	@test -x $(RUFF) || { echo "Missing $(RUFF). Install backend dev dependencies first."; exit 1; }
	cd backend && .venv/bin/ruff check --fix . && .venv/bin/ruff format .

backend-format-check:
	@test -x $(RUFF) || { echo "Missing $(RUFF). Install backend dev dependencies first."; exit 1; }
	cd backend && .venv/bin/ruff format --check .

backend-test:
	@test -x $(PYTEST) || { echo "Missing $(PYTEST). Install backend dev dependencies first."; exit 1; }
	cd backend && .venv/bin/pytest tests/ -v

frontend-lint:
	$(PNPM) lint && $(PNPM) format:check

frontend-format:
	$(PNPM) format

frontend-format-check:
	$(PNPM) format:check

frontend-test:
	$(PNPM) test

frontend-e2e-test:
	$(PNPM) test:e2e
