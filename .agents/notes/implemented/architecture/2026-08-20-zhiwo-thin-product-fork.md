# Agent Note: Zhiwo thin product fork

Status: implemented

English | [中文](2026-08-20-zhiwo-thin-product-fork.zh.md)

## Problem

Zhiwo changes the public user, data authority, tools, identity, persistence, API, browser interface, and release entry. Treating it as a bundle inside the generic coding product leaves dangerous defaults reachable and splits ownership across unrelated stores. Rewriting the Agent Kernel would discard mature loop, adapter, streaming, session-event, tool-protocol, and compaction behavior without improving the product security model.

## Decision

The repository delivers Zhiwo as a thin product fork whose behavioral core remains DeepSeek Harness. `apps/zhiwo` is the sole product entry and depends on `packages/zhiwo/product`, which composes the preserved upstream Agent Loop, LLM/DeepSeek adapter, session, system-prompt, tool, token-meter, and compaction services directly. The composition fixes one persona, one model route, and a per-session tool catalog containing only revision-scoped `read`, `glob`, and `grep`; it does not replace or short-circuit the Agent Loop.

The owner plane compiles mutable `userdata/` into immutable checksummed revisions. Every ordinary file below that root belongs to one read-only Agent data set; directory names and owner configuration do not create private, citation-only, or public classes. Source-format support determines whether the Agent receives text, not whether it has permission to inspect the file. The public runtime reads those revisions and uses one SQLite schema for anonymous ownership, public messages, preserved session events, source access, citations, grants, and deletion. The HTTP server and browser client implement an allowlisted product surface rather than wrapping the generic DSH API or client.

The browser projection retains the upstream conversation pattern: context injection, reasoning, tool actions, interim assistant text, and the final Markdown answer are streamed in session order. It hides workspace, model, settings, generic coding entities, raw tool results, and host paths; read actions use `userdata/` logical paths. The public event stream admits final assistant text only after current-turn source-access and citation validation. Repeated references to one source merge their logical line range before projection, so incomplete citation locations never become browser-visible facts.

Coding packages remain available in the source tree for selective upstream maintenance. The deployable package includes the peer service definitions required to load the native Agent Loop, including definitions shared with coding profiles, but the Zhiwo composition never mounts their providers or consumers. Its scoped tool registry, HTTP routes, browser chunks, and release entry expose only read, glob, and grep over the compiled `userdata/` revision. Build manifests, surface snapshots, SBOM/checksum files, startup audits, and negative tests preserve that exclusion.

The two Zhiwo workspace manifests are private and follow the product `VERSION`. They are excluded from the upstream-maintenance `dsh` npm family and are delivered by the product release command as a CLI plus audited browser artifacts. Source-archive builds validate the reviewed baseline snapshot, record `UPSTREAM_BASE` with dirty provenance, and inject the workspace dependency graph into a self-contained release directory whose CLI executes before the runtime image is assembled. This preserves the upstream family's own version and source metadata without letting its release scripts retag or publish Zhiwo.

## Alternatives considered

An in-tree bundle over the generic CLI/Web composition cannot make the generic API, dynamic loading, coding tools, ownership projections, or client routes structurally absent. An out-of-tree plugin adds an unstable delivery seam even though all major product surfaces differ. A full Kernel rewrite increases replay, cancellation, provider, and compaction risk while duplicating upstream services that already meet the product requirements.

## Consequences

Product appearance and capability restrictions concentrate under `apps/zhiwo` and `packages/zhiwo`; upstream Kernel work remains recognizable and selectively syncable. Existing sessions retain their bound revision while new sessions follow the atomic Current pointer. A baseline update requires explicit review of the package classification and durable delta inventory, followed by Kernel, compiler, ownership, surface, security, and evaluation regression. Operators must treat placement under `userdata/` as affirmative authorization for Agent reading and source presentation.

The release build may compile preserved workspace dependencies, but the delivered entry and browser artifacts expose only Zhiwo. Multi-node persistence, semantic retrieval, pixel-faithful Office rendering, and a vision-enabled `read_image` composition remain separate changes that require evidence and explicit product configuration.
