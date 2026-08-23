SHELL := /bin/sh
.DEFAULT_GOAL := help

USERDATA_DIR ?= $(if $(ZHIWO_USERDATA),$(ZHIWO_USERDATA),userdata)
DSH_HOME_DIR ?= .artifacts/zhiwo
ZHIWO_PORT ?= 18000
ZHIWO_IMAGE ?= zhiwo-ai:local
DSH_CLIENT_COMMIT_HASH ?= $(shell git rev-parse HEAD)
COMPOSE_BUILD_ENV = DSH_CLIENT_COMMIT_HASH="$(DSH_CLIENT_COMMIT_HASH)" ZHIWO_IMAGE="$(ZHIWO_IMAGE)"
COMPOSE_ENV = $(COMPOSE_BUILD_ENV) ZHIWO_USERDATA="$(abspath $(USERDATA_DIR))" ZHIWO_PORT="$(ZHIWO_PORT)"

.PHONY: help zhiwo-install zhiwo-build zhiwo-run zhiwo-test zhiwo-check-env zhiwo-check-userdata \
	zhiwo-docker-package zhiwo-docker-build zhiwo-docker-deploy zhiwo-docker-up \
	zhiwo-docker-down zhiwo-docker-restart \
	zhiwo-docker-logs zhiwo-docker-status zhiwo-docker-config

help: ## Show the Zhiwo command targets.
	@awk 'BEGIN { FS = ":.*## " } /^[a-zA-Z0-9_-]+:.*## / { printf "%-24s %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

zhiwo-install: ## Install the pinned workspace dependencies.
	pnpm install --frozen-lockfile

zhiwo-build: ## Build the libraries and Web frontend used by Zhiwo.
	pnpm run build

zhiwo-check-userdata:
	@test -d "$(USERDATA_DIR)" || { printf 'Zhiwo userdata directory does not exist: %s\n' "$(USERDATA_DIR)" >&2; exit 1; }

zhiwo-check-env:
	@node --input-type=module -e 'import { readFileSync } from "node:fs"; import { parseEnv } from "node:util"; const path = ".env"; let value; try { value = parseEnv(readFileSync(path, "utf8")).DEEPSEEK_API_KEY } catch (error) { console.error(`Zhiwo environment file is unavailable or invalid: $${path}`); process.exit(1) } if (!value?.trim()) { console.error(`Zhiwo environment file must define DEEPSEEK_API_KEY: $${path}`); process.exit(1) }'

zhiwo-run: zhiwo-check-userdata zhiwo-check-env ## Run Zhiwo from source; override USERDATA_DIR, DSH_HOME_DIR, or ZHIWO_PORT.
	env -u DEEPSEEK_API_KEY -u DEEPSEEK_BASE_URL -u DEEPSEEK_SEARCH_BASE_URL \
	DSH_HOME="$(abspath $(DSH_HOME_DIR))" \
	ZHIWO_WORKSPACE_ROOT="$(abspath $(USERDATA_DIR))" \
	ZHIWO_LISTEN_PORT="$(ZHIWO_PORT)" \
	node --env-file=.env --import tsx/esm apps/cli/src/bin.ts web \
		--patch packages/zhiwo/product/cordis.patch.yml --no-open

zhiwo-test: ## Run the focused Zhiwo test suite.
	pnpm run zhiwo:test

zhiwo-docker-package: ## Package the self-contained Zhiwo application and production dependencies.
	$(COMPOSE_BUILD_ENV) docker compose build

zhiwo-docker-build: zhiwo-docker-package ## Alias for zhiwo-docker-package.

zhiwo-docker-deploy: zhiwo-check-userdata zhiwo-check-env ## Deploy the already packaged image and wait for health.
	$(COMPOSE_ENV) docker compose up --detach --wait --no-build

zhiwo-docker-up: zhiwo-docker-package zhiwo-check-userdata zhiwo-check-env ## Package, deploy, and wait for the persistent Zhiwo container.
	$(COMPOSE_ENV) docker compose up --detach --wait --no-build

zhiwo-docker-down: ## Stop the container while retaining its persistent state volume.
	$(COMPOSE_ENV) docker compose down

zhiwo-docker-restart: zhiwo-check-userdata zhiwo-check-env ## Restart Zhiwo without rebuilding or deleting persistent state.
	$(COMPOSE_ENV) docker compose restart zhiwo
	$(COMPOSE_ENV) docker compose up --detach --wait --no-build zhiwo

zhiwo-docker-logs: ## Follow Zhiwo container logs.
	$(COMPOSE_ENV) docker compose logs --follow zhiwo

zhiwo-docker-status: ## Show the Zhiwo container and health status.
	$(COMPOSE_ENV) docker compose ps

zhiwo-docker-config: zhiwo-check-userdata zhiwo-check-env ## Render Compose deployment without exposing env-file values.
	$(COMPOSE_ENV) docker compose config --no-env-resolution
