# Zhiwo upstream delta

English | [中文](UPSTREAM_DELTA.zh.md)

Fork baseline: `141eb6fef83422698aef7a981029e843e8161534`. Product version: `0.4.0`. These records describe durable product differences, not individual commits.

## Durable deltas

| Delta ID | Upstream location / package | Type | Product reason | Security impact | Current owner | Covered tests | Upstream sync risk | Upstreamable | Last reviewed version |
|---|---|---|---|---|---|---|---|---|---|
| DELTA-ZW-001 | `apps/cli`, generic Web bundles; `apps/zhiwo` | replaced | One public Zhiwo command and one product-only browser route replace the coding product. | Removes developer routes, runtime composition inputs, and hidden Coding UI. | Zhiwo maintainers | `apps/zhiwo/tests/server.spec.ts`; surface snapshot | High: generic app changes must never be merged into the Zhiwo entrypoint implicitly. | No, product-specific | 0.4.0 |
| DELTA-ZW-002 | Core tool runtime; `packages/zhiwo/product/src/tools.ts` | adapted | Each turn registers only revision-scoped `read`, `glob`, and `grep`. | Absolute paths, traversal, symlinks, hardlinks, write, shell, network, workflow, and subagent capabilities remain unreachable. | Zhiwo maintainers | `product.spec.ts`; build surface audit | High: upstream default tools or prompt sections could expand model authority. | Root-scoped read primitives may be upstreamable | 0.4.0 |
| DELTA-ZW-003 | Generic session persistence and projections; `database.ts` | replaced | Guest ownership, public messages, upstream session events, access records, citations, and grants use one SQLite model. | Every visitor query carries ownership; hard deletion cascades across the complete online record. | Zhiwo maintainers | Product database and cross-guest server tests | High: upstream event format changes require replay and migration review. | No, product-specific | 0.4.0 |
| DELTA-ZW-004 | No upstream owner-data compiler; `knowledge.ts`, `policy.ts` | adapted | Mutable `userdata/` becomes an immutable, policy-filtered, checksummed revision before public use. | Private/control files and filesystem escapes are excluded; failed sync leaves Current unchanged. | Zhiwo maintainers | Compiler, Office, Git, secret, checksum, and revision tests | Medium: parser/dependency updates need fixture and resource-limit review. | Compiler utilities may be upstreamable | 0.4.0 |
| DELTA-ZW-005 | Generic host/API/client; `server.ts`, `apps/zhiwo/src/client` | replaced | A narrow guest-owned API and Chinese-first product UI replace the developer host. | CSRF, exact Origin, secure Cookie, CSP, safe source projection, exact static routes, and separate loopback metrics are mandatory. | Zhiwo maintainers | HTTP ownership/source tests; Chrome acceptance | High: upstream host/client changes are ignored unless deliberately ported. | No, product-specific | 0.4.0 |
| DELTA-ZW-006 | Generic build; Zhiwo build/release scripts | adapted | The release fixes version, baseline, tools, routes, client entry, schema, SBOM, and checksums. | Unknown Coding Surface, local paths, source maps, manifest drift, or checksum drift blocks startup/release. | Zhiwo maintainers | `zhiwo:build`, `zhiwo:surface`, `zhiwo:release` | Medium: package graph changes require SBOM and artifact review. | Surface-gate patterns may be upstreamable | 0.4.0 |

## Selective sync procedure

Create `upstream-sync/<version>` from the product branch, update the candidate `UPSTREAM_BASE`, merge or cherry-pick only required upstream work, resolve every affected delta, and run preserved Kernel tests plus Zhiwo tool/API/client snapshots, compiler fixtures, isolation/security tests, and evaluation. Update this file and [package classification](PACKAGE_CLASSIFICATION.md), then obtain human review before changing the fixed baseline.
