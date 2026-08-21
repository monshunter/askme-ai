# @deepseek-ai/dsh-zhiwo-product

English | [中文](README.zh.md)

This package is the thin AskmeAI overlay for the native `dsh web` profile. AskmeAI is the material owner's visitor-facing personal Agent and represents that owner when answering; `zhiwo` remains its internal package and preset id. It does not own an Agent Loop, API server, database, browser application, knowledge compiler, generated knowledge corpus, or revision format. It does own the bounded, derived question catalog described below.

The host plugin resolves `ZHIWO_WORKSPACE_ROOT` (default `userdata`) and passes it to the native DSH Workspace Registry, which owns canonicalization and directory validation. The bundle patch selects the shipped `zhiwo` Agent preset, read-only sandbox mode, the AskmeAI brand plugin, and a reduced browser roster. The generic Workspace UI and Session-log download plugin are not loaded; the AskmeAI client projects only visitor-owned native Sessions, automatically connects a clean browser to the sole Workspace, suppresses unused composer diagnostics, replaces the generic preview headline with the localized AskmeAI greeting, and exposes a direct Chinese/English switch in the sidebar. Launching still goes through the ordinary command:

```sh
DSH_HOME=.artifacts/zhiwo pnpm dsh web \
  --patch packages/zhiwo/product/cordis.patch.yml
```

The patched Web server binds `127.0.0.1:18000` by default. An explicit `--port` wins for one invocation; otherwise `ZHIWO_LISTEN_PORT` overrides `18000`. Invalid or occupied values fail startup instead of selecting a random port.

The `zhiwo` preset tells the model that it is the material owner's personal Agent for visitors. First-person answers refer to the owner, not the Agent or visitor, and test fixtures or examples are not owner facts without confirmation in formal owner material. The preset mounts the maintained filesystem consumer with `mutations: false` plus the maintained filesystem-search consumer, so the model sees exactly `read`, `glob`, and `grep`. The [`zhiwo-agent-policy`](../agent-policy/README.md) plugin resolves each requested read or search root through the filesystem provider and requires its canonical target to remain below the Session `cwd`; absolute paths, `..` traversal, and symlinks to outside targets fail before a read or search process starts. Successful read values expose only normalized relative paths. Files are still read live from `userdata/`; editing a file changes what a later turn can retrieve without a sync step.

The host plugin also installs one access policy around the native Connection transport. A stateless signed cookie derives an opaque owner prefix for native Session ids. The policy forces new Sessions onto the registered Workspace and `zhiwo` preset, requires both facts again before every existing-Session operation, filters lists and both native WebSocket streams, and projects the Workspace, Host home, and Session cwd as the virtual `/` root. Raw Session export remains unavailable. Authorized Session histories and model streams otherwise retain native DSH behavior; all material below `userdata/` may be read and shown. The policy persists one private signing key below `DSH_HOME` but owns no visitor, message, or Session database. Separate browser profiles therefore share the read-only Workspace while their native conversation histories remain isolated.

Native DSH document links normally use `host.openPath` to launch the operating system's default application. Zhiwo deliberately does not expose that API to an anonymous browser. Its client claims conversation file locations through the native Workspace runtime, fetches `/api/zhiwo/document`, verifies the response media type, and renders it in a same-page dialog. Markdown uses the rich-text renderer; other UTF-8 text and source files use the syntax-aware code view; PDF and PNG, JPEG, GIF, or WebP images use bounded inline viewers. HTML is served and shown as plain text, never executed. The Host accepts only virtual absolute paths, resolves the real file target below `userdata/`, rejects traversal, external symlinks, directories, oversized files, invalid PDF or image signatures, unsupported binary formats, and invalid UTF-8. Accepted responses carry `no-store` and `nosniff`; formats without a safe built-in viewer fail explicitly instead of invoking the Host operating system. The default preview limit is 2 MiB and is configurable through `documentMaxBytes`.

Zhiwo disables the local spill backend because its recovery locators are physical Host paths. Capped search results remain inline and tell the Agent to narrow the request; no temporary-file locator enters model context or the browser transcript.

Startup also schedules one non-blocking inventory of eligible immediate child directories and regular documents below the Workspace. It fingerprints names, kinds, sizes, and modification times without reading document bodies. A matching versioned private cache below `DSH_HOME` publishes its 100 bilingual semantic question pairs without rebuilding or rewriting; a changed directory or document rebuilds and atomically replaces the cache. With projects the catalog contains 50 global and 50 project pairs, otherwise 100 global pairs. The internal `zhiwo/questions` Remote travels through the existing Typert Gateway and visitor Session guard. Welcome responses contain four rotating questions; a completed Turn response contains exactly two questions derived from that Turn and two from the initialized global pool. No additional model call is made for suggestions.

The Host rewrites the initial document title and favicon before serving the Zhiwo page, and replaces the generic install manifest and icon asset with “知我AI” metadata. It serves the packaged AskmeAI logo and one shared watercolor background from fixed same-origin `/assets/zhiwo/*` routes. The Client uses the same logo in browser, install, sidebar, and greeting surfaces, while blank and titled tabs retain the “知我AI” product title. The access policy admits native message-feedback methods only after applying the same visitor Session ownership and preset checks used by other Session operations.

## Model Experience

Indirectly, through the shipped `zhiwo` preset selected by this package's bundle patch; that preset owns the persona and tool registrations.

#### KV Cache effect

The package itself adds no request tokens; cache behavior follows the stable persona and `read`/`glob`/`grep` schemas contributed by the selected preset.

## Known Limitations and Deferred Work

- AskmeAI inherits native DSH text-file behavior; it does not convert PDF, Office, archive, image, or other binary formats into a second text corpus.
- The overlay isolates anonymous browser Session histories. It does not provide account login, authorization administration, rate limits, TLS termination, or other public-hosting controls.
- Workspace history is stored by native DSH under `DSH_HOME`. Use a dedicated AskmeAI home to avoid mixing workspaces and sessions from another profile.
- Project suggestions use immediate directory names, not document content. A terse directory name can therefore produce a terse project label until the source directory is renamed.
