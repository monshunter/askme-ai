# Zhiwo package classification

English | [中文](PACKAGE_CLASSIFICATION.zh.md)

This inventory records how Zhiwo 0.4 relates to the native DSH package graph. Zhiwo is an overlay, not a replacement application.

## Classification

| Class | Locations | Zhiwo treatment |
|---|---|---|
| Preserved | `apps/cli`; `packages/bundle/{base,web-app}`; native Host, API, Agent Loop, Session, persistence, Workspace, model, tool, and client packages | Used through the ordinary `dsh web` composition without a Zhiwo fork of their runtime behavior. |
| Adapted | `packages/fs/tool-fs` | The generic `mutations` option lets a preset mount the maintained reader without registering `write` or `edit`; the default remains `true` for other profiles. |
| Added | `packages/zhiwo/{product,ui}`; `apps/cli/config/agent-presets/zhiwo` | Registers one raw Workspace, pins the read-only Agent composition, reduces the browser roster, and supplies Zhiwo branding. |
| Unmounted | Mutation, Shell, terminal, Web, Skill, plan, goal, todo, job, workflow, and Subagent consumers; configuration and coding-specific browser occupants | Remain maintained DSH packages but are absent from the Zhiwo Agent tool catalog or browser roster. |

## Dependency rule

The CLI names `@deepseek-ai/dsh-zhiwo-product` so the Loader can resolve the overlay named by `--patch`. The product package depends on the brand package and otherwise consumes native service definitions through peer dependencies. Both Zhiwo packages are private and carry the product `VERSION`; they do not join the upstream npm release family.

The product package contains no Agent Loop, server, persistence implementation, model adapter, knowledge compiler, or browser application. The [native overlay decision](../.agents/notes/implemented/simplification/2026-08-21-zhiwo-native-web-overlay.md) owns the rationale.
