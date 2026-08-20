# Zhiwo application

English | [中文](README.zh.md)

`apps/zhiwo` is the only supported product entry. It ships the `zhiwo` CLI and a React client that calls only the narrow Public Runtime API from `@deepseek-ai/dsh-zhiwo-product`; it imports no `packages/client` coding UI package. The client preserves the native Agent transcript style by streaming context injection, reasoning, tool actions, interim text, the final Markdown answer, and citation cards in one ordered conversation.

Assistant answers use an independent GFM renderer that drops raw HTML, permits only explicit HTTP(S) and mail links, replaces remote images with inert alt text, and gives code blocks, tables, and long links bounded narrow-screen overflow.

Run `pnpm run zhiwo:build` from the repository root. The build emits the CLI bundle, minified static client without source maps, `build-manifest.json`, `surface-snapshot.json`, `sbom.spdx.json`, and `SHA256SUMS`. The manifest fixes the version, upstream baseline, agent definition, tool names, route templates, database schema, dependency lock checksum, and static artifact checksums.

The production Docker build supports source archives without `.git`: it validates the reviewed upstream-surface snapshot, records `UPSTREAM_BASE` as the build commit with `dirty: true`, injects workspace packages into a self-contained release directory, and executes `zhiwo version` from that directory before creating the non-root runtime image.

The CLI subcommands are `serve`, `sync`, `doctor`, `gc`, `rollback`, and `version`. Owner-only compilation, revision rollback, and retention remain CLI operations; no visitor API can trigger them. `serve` exposes product traffic on the configured public listener and low-cardinality Prometheus metrics on a separate loopback-only listener.

`pnpm --filter @deepseek-ai/dsh-zhiwo run acceptance:browser` starts a temporary real product server over a deterministic mock model for manual browser acceptance. Its required prompt is `askme 是一个什么项目？`, and the fixture proves the process transcript, structured Markdown answer, and citation source. Set `ZHIWO_ACCEPTANCE_REAL_API=true` and provide `DEEPSEEK_API_KEY` to exercise the same disposable server through the real DeepSeek provider. It prints the assigned loopback origins and removes its generated knowledge, database, and source fixture after `SIGTERM`.

The repository keyless snapshot tier runs the real knowledge compiler and upstream Agent Loop, then pins the exact three-tool catalog and citation-validated browser event transcript.
