# Operate Zhiwo

English | [中文](zhiwo.zh.md)

This runbook covers the single-node Zhiwo 0.4 product. Run owner commands from a fixed checkout whose `UPSTREAM_BASE` and `VERSION` have been reviewed.

## Install and configure

Install the locked workspace and build the product. The build creates the product CLI, browser assets, manifest, surface snapshot, SPDX SBOM, and `SHA256SUMS`.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm run zhiwo:build
```

The public runtime needs only state, immutable knowledge, model configuration, and secrets. Keep owner source variables out of the `serve` environment.

```sh
export ZHIWO_PUBLIC_ORIGIN=https://askme.example.com
export ZHIWO_LISTEN_HOST=127.0.0.1
export ZHIWO_LISTEN_PORT=13081
export ZHIWO_METRICS_PORT=13082
export ZHIWO_STATE_ROOT=/var/lib/zhiwo/state
export ZHIWO_KNOWLEDGE_ROOT=/var/lib/zhiwo/knowledge
export ZHIWO_COOKIE_SECRET_FILE=/run/secrets/zhiwo_cookie_secret
export ZHIWO_MODEL=deepseek-chat
export ZHIWO_MODEL_API_KEY_FILE=/run/secrets/model_api_key
```

## Prepare userdata and compiler settings

`userdata/` accepts arbitrary ordinary files and directories. Every ordinary file below this root enters the same read-only Agent data set; there are no file-level private, citation-only, or public classes. Symlinks, hardlinks, devices, sockets, FIFOs, `.git` internals, and the `zhiwo.yaml` control file are not sources. Text artifacts are previewable and cited original files are downloadable.

```yaml
version: 1
compiler:
  max_file_bytes: 52428800
  max_total_bytes: 2147483648
  max_archive_entries: 0
  git:
    enabled: true
    include_history_summary: true
    max_commits: 5000
starter_questions:
  - 他最有代表性的项目是什么？
  - 他适合 Agent Platform 岗位吗？
```

Text, PDF, DOCX, PPTX, and XLSX produce bounded text artifacts. Unknown formats remain catalogued and downloadable but do not provide model-readable text. Secret-like content inside `userdata/` is counted in the owner audit but is not filtered or blocked: placing a file under this root authorizes Agent reading. Git analysis uses local read-only commands with hooks, credential helpers, prompts, global configuration, and network operations disabled; it never publishes remote URLs.

## Validate, publish, and roll back a revision

Run sync in an owner or CI environment that mounts raw data and the knowledge volume but has no model key, Cookie secret, session database, SSH agent, or Docker socket. The `--check` run performs the compiler and audit without changing Current. Invalid compiler configuration, parser failure, checksum failure, or lock contention leaves Current unchanged.

```sh
export ZHIWO_SOURCE_ROOT=/app/userdata
export ZHIWO_CONFIG_FILE=/app/userdata/zhiwo.yaml
export ZHIWO_KNOWLEDGE_ROOT=/var/lib/zhiwo/knowledge
pnpm --filter @deepseek-ai/dsh-zhiwo exec zhiwo sync --check --json
pnpm --filter @deepseek-ai/dsh-zhiwo exec zhiwo sync --json
```

To roll back, choose a retained id from `knowledge/revisions/`. The command validates the manifest, catalog, audit, and artifacts before atomically changing Current. Existing sessions keep their original revision; only new sessions use the rolled-back Current.

```sh
pnpm --filter @deepseek-ai/dsh-zhiwo exec zhiwo rollback rev_example
```

## Start, observe, and diagnose

`serve` verifies release checksums, the fixed version/baseline, database schema, Current revision, empty global tool registry, exact public routes, browser chunks, model route, state permissions, and Cookie strength before listening. It refuses owner source variables instead of mounting raw data into the public process.

```sh
pnpm --filter @deepseek-ai/dsh-zhiwo exec zhiwo doctor
pnpm --filter @deepseek-ai/dsh-zhiwo exec zhiwo serve
curl -fsS http://127.0.0.1:13081/health/live
curl -fsS http://127.0.0.1:13081/health/ready
curl -fsS http://127.0.0.1:13082/metrics
```

JSON request logs contain a random request id, normalized low-cardinality route, status, latency, and safe error code; they omit prompts, answers, source text, paths, Cookies, visitor ids, IP addresses, provider bodies, and secrets. `X-Request-Id` correlates a browser failure with the log and is the MVP trace id. Alert on sustained model failures, rate-limit growth, readiness failure, active generation saturation, sync failure, database integrity failure, and revision GC failure. The metrics listener binds loopback and must not be proxied publicly.

## Rotate secrets

Rotate the model key file and restart `serve`; knowledge revisions do not change. Rotate the Cookie secret file and restart only after announcing that existing anonymous identity Cookies become invalid and visitors receive new isolated identities. The runtime never guesses an old identity from IP, user agent, localStorage, or browser fingerprint. Use filesystem or secret-manager atomic replacement and never print either value through `doctor` or logs.

## Back up and restore SQLite

Use Node's SQLite online backup API, encrypt the resulting file with deployment-owned tooling, and define a backup expiry window. Do not copy a live DB/WAL pair directly.

```sh
mkdir -p backup
node --input-type=module -e '
import { backup, DatabaseSync } from "node:sqlite";
const source = new DatabaseSync("runtime/state/zhiwo.db", { readOnly: true });
await backup(source, "backup/zhiwo.db");
source.close();
'
```

For recovery, stop `serve`, restore the backup into a new file through the same API, run SQLite integrity and foreign-key checks, retain the old DB/WAL files in a quarantine directory, atomically place the validated file, restart, and run `zhiwo doctor`. A restore drill is complete only after a retained session can be read and a newly deleted session remains absent after another restart.

## Delete data and run retention

The browser's clear-current, delete-one, and delete-all actions cancel active generation, wait for settlement, and physically cascade messages, upstream events, source access, citations, and grants from online SQLite. Repeating a delete is safe and does not reveal whether another visitor owns an id. Offline encrypted backups expire under the deployment's disclosed window.

```sh
pnpm --filter @deepseek-ai/dsh-zhiwo exec zhiwo gc --dry-run
pnpm --filter @deepseek-ai/dsh-zhiwo exec zhiwo gc
```

GC applies the configured session retention, removes orphan guests, preserves Current, preserves the newest configured revision count, and refuses to collect any session-referenced revision. Never remove a revision directory manually.

## Handle failures and source mistakes

### Model provider failure

Keep the fixed route; do not fall back to an unreviewed model. History, cited sources, and deletion remain available while new generation returns a stable product error. Verify endpoint reachability from the public network policy, key-file permissions, quota, model id, and low-cardinality metrics without logging a provider body.

### Parser or sync failure

Inspect only the aggregate audit counts and logical warning names. Keep the old Current serving, correct the offending file or compiler setting, rerun `sync --check`, then publish. Do not enable a runtime parser or shell as a workaround.

### Unintended source publication

Remove the unintended file from `userdata/`, publish a corrected revision, and atomically roll back if necessary. Delete affected visitor sessions and grants, rotate any exposed credentials, review access logs without content, determine encrypted-backup expiry, and preserve incident evidence outside the public runtime. A directory name or configuration rule cannot hide a source: membership under `userdata/` always means Agent-readable.

## Update the upstream baseline

Use an `upstream-sync/<version>` branch. Review the candidate official commit, update `UPSTREAM_BASE`, reconcile every entry in [upstream delta](../UPSTREAM_DELTA.md) and [package classification](../PACKAGE_CLASSIFICATION.md), then run preserved Kernel tests, Zhiwo type/build/surface gates, compiler and database tests, cross-guest/source/security E2E, and the evaluation set. Human review must confirm no new dependency, tool, route, prompt section, event requirement, or client chunk expands the product before merge.

## Verify a release has no Coding Surface

Run the fixed product gates and inspect the release identity. The surface gate scans only built browser JavaScript; startup independently verifies the manifest, SBOM, all checksums, route list, and client files.

```sh
pnpm run zhiwo:build
pnpm run zhiwo:test
pnpm run zhiwo:evaluate
pnpm run zhiwo:surface
pnpm --filter @deepseek-ai/dsh-zhiwo exec zhiwo version
pnpm --filter @deepseek-ai/dsh-zhiwo exec zhiwo doctor
```

Before public exposure, confirm the reverse proxy enforces HTTPS and the configured Origin, proxies only the Zhiwo public listener, preserves streaming without buffering, limits bodies and headers, never proxies metrics or owner commands, and mounts application/knowledge read-only with only state and approved logs writable.
