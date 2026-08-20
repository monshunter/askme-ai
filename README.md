# Zhiwo

English | [中文](README.zh.md)

Zhiwo (知我; internal code name Askme) is a read-only personal knowledge assistant built as a product skin over [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It preserves the upstream Agent Loop, LLM adapter, reasoning, tool-call, streaming, and session-event behavior while replacing the coding product's exposed entities, public API, persistence, command, and browser interface.

The production artifact has one command, `zhiwo`. It contains no workspace selector, shell, terminal, web search, dynamic plugin loader, workflow, subagent, or coding UI. A model turn can use only revision-scoped `read`, `glob`, and `grep`; every displayed citation must resolve to a source actually accessed in that turn.

## Run

### Run from source

Install Node.js 24 or a supported Node.js 22 release and pnpm, then prepare the knowledge revision and product build:

```sh
pnpm install
pnpm run build
pnpm --filter @deepseek-ai/dsh-zhiwo exec zhiwo sync --source ./userdata
```

Set `ZHIWO_COOKIE_SECRET` to at least 32 bytes and provide `ZHIWO_MODEL`, `ZHIWO_MODEL_API_KEY`, and the HTTPS `ZHIWO_PUBLIC_ORIGIN`, then start the product:

```sh
pnpm --filter @deepseek-ai/dsh-zhiwo exec zhiwo serve
```

For loopback development, set `ZHIWO_DEVELOPMENT=true` and use an HTTP origin. The [operator guide](docs/user/zhiwo.md) covers compiler limits, key rotation, backup, rollback, retention, and production surface verification.

## Product commands

- `zhiwo sync [--check]` compiles every ordinary file under mutable `userdata/` into one immutable read-only revision.
- `zhiwo serve [--dev]` starts the product-only UI and API.
- `zhiwo doctor` validates the current revision and unified SQLite database.
- `zhiwo gc [--dry-run]` collects revisions that are neither current nor session-referenced.
- `zhiwo rollback <revision-id>` atomically selects a retained validated revision for new sessions.
- `zhiwo version` prints the product version and exact official upstream baseline.

## Development

`pnpm run zhiwo:test`, `zhiwo:build`, `zhiwo:surface`, and `zhiwo:release` are the stable product checks. The upstream developer harness remains in the repository for selective baseline sync and kernel regression work. Zhiwo ships the service definitions required by the native Agent Loop, but its composition, tool registry, HTTP routes, browser client, and release entry expose only the read-only career-knowledge product.

The fork inventory is recorded in [upstream maintenance](UPSTREAM.md), [package classification](docs/PACKAGE_CLASSIFICATION.md), [upstream delta](docs/UPSTREAM_DELTA.md), and [baseline architecture](docs/architecture/fork-baseline.md). Contributors follow [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE). Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); every product build also emits an SPDX SBOM and artifact checksums.
