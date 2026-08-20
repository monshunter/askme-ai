# Zhiwo package classification

English | [中文](PACKAGE_CLASSIFICATION.zh.md)

This inventory fixes how the official baseline `141eb6fef83422698aef7a981029e843e8161534` participates in Zhiwo 0.4. Source retained for upstream maintenance is not automatically part of the production dependency graph.

## Classification

| Class | Baseline locations | Zhiwo treatment |
|---|---|---|
| Preserved | `vendor/cordis`, `packages/core/{agent,agent-loop,llm,session,system-prompt,tools}`, `packages/llm/{llm-deepseek,token-meter}`, `packages/compaction/{compaction-basic,compaction-tool-result-pruner}` | Reused programmatically as the fixed Agent Kernel; ordinary upstream tests remain regression evidence. |
| Adapted | `packages/zhiwo/product`, root TypeScript/build faces | Compose the preserved services with one persona, one model route, revision-scoped tools, compaction, citation validation, and product invariants. |
| Replaced | `apps/zhiwo`, Zhiwo SQLite schema, Zhiwo HTTP server and React client | Replace the generic CLI/Web product, generic public API assembly, generic ownership projection, and coding-oriented browser shell. |
| Excluded | Shell, subprocess, filesystem coding tools, terminal, web tools, skill, plan, goal, todo, job, workflow, subagent, workspace/settings/model-selection UI, dynamic loader bundles | May remain in the fork for upstream sync, but no Zhiwo package, release route, tool schema, static chunk, or runtime registration reaches them. |

## Dependency rule

`apps/zhiwo` depends only on `@deepseek-ai/dsh-zhiwo-product`; the product package names every preserved service it composes. The release manifest and surface snapshot freeze the model tool catalog, public route templates, and single client route. An unknown tool, API route, browser route, or product module fails startup or a release gate rather than loading a generic DSH fallback.

Both Zhiwo workspace manifests are private and carry the product `VERSION`. They are delivered by `zhiwo:release` as the CLI and audited browser artifact, not published by the upstream-maintenance `dsh` npm sequence. The upstream package family retains its own root version and repository metadata, so selective upstream maintenance cannot silently retag Zhiwo or publish it under the upstream release.

The generated repository-wide [module graph](module-graph.md) includes maintenance-only source. Production exclusion is proven separately by the Zhiwo package manifests, built artifact scan, route/tool snapshots, and startup audit.
