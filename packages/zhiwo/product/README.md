# @deepseek-ai/dsh-zhiwo-product

English | [中文](README.zh.md)

This package is the thin AskmeAI overlay for the native `dsh web` profile; `zhiwo` remains its internal package and preset id. It does not own an Agent Loop, API server, database, browser application, knowledge compiler, source catalog, or revision format.

The host plugin resolves `ZHIWO_WORKSPACE_ROOT` (default `userdata`) and passes it to the native DSH Workspace Registry, which owns canonicalization and directory validation. The bundle patch selects the shipped `zhiwo` Agent preset, read-only sandbox mode, the AskmeAI brand plugin, and a reduced browser roster. The generic Workspace UI and Session-log download plugin are not loaded; the AskmeAI client projects only visitor-owned native Sessions, automatically connects a clean browser to the sole Workspace, suppresses unused composer diagnostics, replaces the generic preview headline with the localized AskmeAI greeting, and exposes a direct Chinese/English switch in the sidebar. Launching still goes through the ordinary command:

```sh
DSH_HOME=.artifacts/zhiwo pnpm dsh web \
  --patch packages/zhiwo/product/cordis.patch.yml
```

The `zhiwo` preset mounts the maintained filesystem consumer with `mutations: false` plus the maintained filesystem-search consumer. The model therefore sees exactly `read`, `glob`, and `grep`, and those tools operate on the Session `cwd` exactly as they do in native DSH. Files are read live from `userdata/`; editing a file changes what a later turn can retrieve without a sync step.

The host plugin also installs one access policy around the native Connection transport. A stateless signed cookie derives an opaque owner prefix for native Session ids. The policy forces new Sessions onto the registered Workspace, rejects foreign Session ids before dispatch, filters lists and Workspace projections, and filters both native WebSocket streams. It persists one private signing key below `DSH_HOME` but owns no visitor, message, or Session database. Separate browser profiles therefore share the read-only Workspace while their native conversation histories remain isolated.

## Model Experience

Indirectly, through the shipped `zhiwo` preset selected by this package's bundle patch; that preset owns the persona and tool registrations.

#### KV Cache effect

The package itself adds no request tokens; cache behavior follows the stable persona and `read`/`glob`/`grep` schemas contributed by the selected preset.

## Known Limitations and Deferred Work

- AskmeAI inherits native DSH text-file behavior; it does not convert PDF, Office, archive, image, or other binary formats into a second text corpus.
- The overlay isolates anonymous browser Session histories. It does not provide account login, authorization administration, rate limits, TLS termination, or other public-hosting controls.
- Workspace history is stored by native DSH under `DSH_HOME`. Use a dedicated AskmeAI home to avoid mixing workspaces and sessions from another profile.
