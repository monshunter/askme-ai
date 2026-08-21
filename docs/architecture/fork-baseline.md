# Zhiwo fork baseline

English | [中文](fork-baseline.zh.md)

Zhiwo 0.4 is based on official DeepSeek Harness commit `141eb6fef83422698aef7a981029e843e8161534`. Its product architecture is a patch over the native Web profile.

## Runtime topology

```text
dsh web
  + packages/zhiwo/product/cordis.patch.yml
      -> register userdata/ in the native Workspace Registry
      -> select the shipped zhiwo Agent preset
      -> keep native Host / API / Session / Agent Loop / browser
      -> expose native read / glob / grep
      -> fill native brand slots
```

The Session `cwd` is the canonical `userdata/` path. Native filesystem consumers resolve model paths against that Workspace and inspect the current files. Native DSH persistence below `DSH_HOME` owns Workspace metadata and Session history.

## Source and artifact planes

The repository uses the ordinary host and client aggregates and the ordinary `pnpm run build`. The product package emits a host entry and its Patch; the UI package emits one client plugin. The standard CLI remains the only executable entry.

## Negative product graph

Zhiwo has no separate Server, API, database, Agent Loop, browser application, compiler, index, synchronized corpus, or versioned knowledge format. The Agent preset omits mutation, Shell, network, and orchestration tools. Browser reductions are patch-layer choices over the native client roster rather than a fork of the client.

See [package classification](../PACKAGE_CLASSIFICATION.md) and [upstream delta](../UPSTREAM_DELTA.md) for the maintained inventory.
