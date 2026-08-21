# Zhiwo upstream delta

English | [中文](UPSTREAM_DELTA.zh.md)

Fork baseline: `141eb6fef83422698aef7a981029e843e8161534`. Product version: `0.4.0`. These records describe durable product differences rather than the packages Zhiwo inherits unchanged.

## Durable deltas

| Delta ID | Location | Type | Product reason | Current verification | Upstreamable |
|---|---|---|---|---|---|
| DELTA-ZW-001 | `packages/zhiwo/product` | added | Register `userdata/` as an ordinary native Workspace and apply the restricted Web composition. | Product tests and real Web startup. | No, product-specific. |
| DELTA-ZW-002 | `apps/cli/config/agent-presets/zhiwo` | added | Give the native Agent a complete Chinese read-only persona and only `read`, `glob`, and `grep`. | Assembled composition and browser question round. | No, product-specific. |
| DELTA-ZW-003 | `packages/fs/tool-fs` | adapted | Let any composition reuse the native reader without registering mutation tools. | Filesystem consumer tests with `mutations: false`. | Yes. |
| DELTA-ZW-004 | `packages/zhiwo/ui` | added | Fill native branding slots while retaining the native client application. | Client plugin tests and browser inspection. | No, product-specific. |

## Selective sync procedure

Review upstream changes against these four locations and the native extension points they consume. Run the focused package tests, configuration checks, build, and a real `dsh web` question over `userdata/`. Update this file only when a durable delta changes.
