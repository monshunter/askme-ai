# Zhiwo fork baseline

English | [中文](fork-baseline.zh.md)

Zhiwo 0.4 is based on the official DeepSeek Harness commit `141eb6fef83422698aef7a981029e843e8161534`. `UPSTREAM_BASE` is immutable for the release; updating an upstream branch does not update the product until the selective sync procedure completes.

## Product topology

```text
Owner / CI
  -> userdata + zhiwo.yaml
  -> zhiwo sync
  -> immutable Knowledge Revision

Visitor browser
  -> apps/zhiwo static client
  -> narrow Zhiwo HTTP API
  -> guest-owned SQLite data
  -> fixed Zhiwo Agent
  -> upstream Agent Loop + DeepSeek adapter + compaction
  -> revision-scoped read / glob / grep
```

The owner plane alone sees raw data and runs PDF, Office, Git, and secret-audit work. The public process sees a read-only validated revision and writable product state. A model turn receives only the current session revision tools; it cannot select a filesystem root, model route, persona, tool set, plugin, or revision.

## Source and artifact planes

Source-based TypeScript gates resolve workspace packages to `src/`. `pnpm run zhiwo:build` first builds the fixed preserved service closure, then emits the Zhiwo CLI and product-only browser assets. The delivered directory contains no generic DSH Web entry, dynamic product profile, source map, development database, secret, or `userdata/`.

The release manifest binds Zhiwo version, upstream baseline, build commit/time, lockfile checksum, Agent Definition, tool catalog, public route templates, client route, compiler version, database schema, SBOM checksum, and static artifact checksums. `SHA256SUMS` covers the manifest, SBOM, surface snapshot, and browser files. Startup revalidates them before opening the public listener.

## Negative product graph

Coding packages remain in the fork only for baseline maintenance. `apps/zhiwo` has one product dependency; `packages/zhiwo/product` explicitly composes the preserved Kernel packages and contains no shell, subprocess provider, writable filesystem tool, terminal, web tool, skill, plan, goal, todo, job, workflow, subagent, generic host, or generic client dependency. Tool schemas are registered inside a per-session Agent scope, while the global tool registry must remain empty.

See [package classification](../PACKAGE_CLASSIFICATION.md) and [upstream delta](../UPSTREAM_DELTA.md) for the maintained inventory and review obligations.
