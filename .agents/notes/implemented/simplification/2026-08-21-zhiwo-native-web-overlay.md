# Agent Note: AskmeAI uses the native Web workspace

Status: implemented

English | [中文](2026-08-21-zhiwo-native-web-overlay.zh.md)

## Problem

AskmeAI, named “知我AI” in Chinese, is a localized shell with fewer model and browser capabilities. The internal package and preset id remains `zhiwo`. A separate application had grown around that requirement: it copied `userdata/` into immutable revisions, compiled document formats, introduced synchronization and rollback commands, composed another Agent runtime, and owned custom HTTP, identity, SQLite, and React layers. That system changed the meaning of a Workspace and made ordinary file updates pass through an owner pipeline before the Agent could see them.

The immutable design combined independent requirements: reproducible source snapshots, guest conversation isolation, validated citations, and an internet-facing service. Guest isolation does not require a copied Workspace or a second Session implementation. The selected directory itself is the authoritative Workspace, while native Session access still requires a visitor owner.

## Decision

AskmeAI is a patch over the shipped `dsh web` profile. The standard CLI, Host, API, Session persistence, Workspace Registry, Agent Loop, model route, and browser client remain the only runtime implementations. `packages/zhiwo/product` resolves `ZHIWO_WORKSPACE_ROOT` with a `userdata` default and passes it to the native Workspace Registry, which owns canonicalization and directory validation. The dedicated `DSH_HOME` stores only native DSH Workspace metadata and Session history.

The shipped `zhiwo` Agent preset contains a complete Chinese persona and mounts the maintained filesystem reader and search consumers. `@deepseek-ai/dsh-tool-fs` accepts generic `mutations` and `images` configuration fields; setting both to `false` registers only `read`, while both defaults preserve other profiles. The preset therefore exposes exactly `read`, `glob`, and `grep` over the Session `cwd`.

The product Patch selects that preset, pins read-only sandbox policy, removes unused configuration and coding occupants from the browser roster, disables the generic Workspace UI, Session-log download plugin, and local spill backend, and inserts `packages/zhiwo/ui`. The Host keeps its native directory-picker dependency, but the AskmeAI access policy does not expose its methods. The UI package fills native brand and hero-headline slots, projects the visitor's native Session store as a flat history list, uses the native Workspace and Session runtimes to connect a clean browser to the sole Workspace, removes the resident command/access-mode cluster, context meter, and Session statistics strip from presentation, and contributes a sidebar action for switching the native locale between Chinese and English. Both locales retain the “知我AI” product name. The blank greeting invites the visitor to get to know the material owner; it does not present the Agent as an independent subject. The native preview headline and badge remain the fallback for profiles that do not fill the slot. Model selection and sending stay on the native composer. The UI package owns no transport, persisted state, or conversation implementation. The product-specific route and confinement rules are owned by the [document-preview decision](../bug-fix/2026-08-21-zhiwo-workspace-confinement-and-document-preview.md).

The raw Workspace is the source of truth. Tool calls inspect current files directly. Zhiwo defines no compiler, content-derived index, synchronization lifecycle, generated corpus, source catalog, versioned knowledge format, custom database, HTTP server, or parallel browser entry. It does maintain a metadata-derived visitor-question catalog and cache, whose bounded input and invalidation rules are defined by the [personalized-question decision](../feature/2026-08-21-zhiwo-personalized-questions.md).

`packages/zhiwo/product` installs one access policy around the native Connection transport. The browser establishes a random subject before opening concurrent API and WebSocket connections; the Host upgrades it to a signed HttpOnly cookie. A Host-private HMAC derives an opaque owner prefix embedded in every native Session id. New Sessions are forced onto the registered Workspace, foreign Session ids are rejected before native dispatch, lists and Workspace projections are filtered, and both native event streams drop foreign Session frames. The policy stores one private signing key below `DSH_HOME`; it stores no visitor, message, or Session records.

## Alternatives considered

**Retain immutable revisions behind the native client.** This preserved reproducible snapshots but kept the compiler, synchronization lifecycle, storage format, and different Workspace semantics that caused the complexity.

**Keep a custom Zhiwo React application over the native API.** This removed part of the server duplication but still forked conversation behavior and required continuous parity work for streaming, history, tools, models, and Sessions.

**Fork the native Web bundle.** A source fork could hide features directly, but a Loader Patch and brand Slot occupants express the same product difference through maintained extension points.

## Consequences

Editing a text file changes the evidence available to later turns without synchronization or restart. Existing answers remain historical Session events and do not become reproducible snapshots of later file state. Binary formats receive only the support provided by native filesystem tools; Zhiwo does not convert them into text.

Separate browser profiles share the same read-only Workspace and cannot list, read, change, export, or receive events for each other's native Sessions. This anonymous isolation does not provide account login, authorization administration, rate limits, TLS termination, or other public-hosting controls.

Workspace is not a user-facing AskmeAI concept. The browser renders no Workspace name, grouping, ungrouped bucket, search, creation, settings, or picker. It also renders no Session-log download, command/access-mode control, context meter, Session statistics strip, preview headline, or preview badge. The sidebar retains a direct Chinese/English action because the generic Settings UI is absent. The Host registration remains an ordinary native Workspace relationship used internally by Session creation and filesystem tools.

Focused package tests verify raw Workspace registration, read-only filesystem composition, brand lifecycle, cookie tamper handling, cross-visitor API denial, list projection, fork ownership, and both event-stream filters. Configuration, type, build, and real browser checks verify that the native application starts with the overlay and answers from `userdata/` through the three-tool catalog. A versioned knowledge system is reconsidered only when reproducible source snapshots become an explicit requirement.
