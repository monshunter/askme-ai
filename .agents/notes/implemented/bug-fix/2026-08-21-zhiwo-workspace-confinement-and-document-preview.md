# Agent Note: Zhiwo confines reads and previews documents in the browser

Status: implemented

English | [中文](2026-08-21-zhiwo-workspace-confinement-and-document-preview.zh.md)

## Problem

The native conversation client resolves a relative tool location against the Session cwd and sends the resulting path to `host.openPath`, as defined by the [Web Workspace file-link decision](../feature/2026-07-31-web-workspace-file-links.md). That operation correctly opens a local file with the Host operating system, but the Zhiwo browser access policy does not expose it. A Zhiwo read-card click therefore called an unavailable `/api/host.openPath` endpoint and displayed an HTTP 404 transport error.

Zhiwo also relied on its persona and read-only sandbox to keep discovery within `userdata/`. Read-only sandbox mode prevents mutation; it does not restrict reads. The `read` tool accepted absolute paths and traversal, while `glob` and `grep` accepted an external search root. Successful read results carried the filesystem provider's absolute display path into the model, Session log, and browser. An instruction to use relative citations could not enforce those runtime properties.

## Decision

The client Workspace runtime exposes a `workspaces/open-path` claim waterfall. Every product listener delegates with `next()` and returns whether it handled the location. No claim preserves the native `host.openPath` fallback, so desktop profiles keep their operating-system integration. Zhiwo claims the location, fetches the same-origin `/api/zhiwo/document` endpoint, verifies its media type, and renders a same-page dialog. Markdown, other UTF-8 text or source, PDF, and PNG/JPEG/GIF/WebP raster images receive type-specific views. HTML remains plain text, while unsupported binary formats and mismatched PDF or image signatures fail explicitly. The Host accepts only a virtual absolute path, resolves its real target below the configured Workspace, and rejects traversal, external symlinks, non-files, and oversized files. Accepted responses carry cache and content-sniffing protections. Keeping the endpoint below `/api` also prevents an absent exact route from falling through to the chat application's HTML shell.

The `zhiwo` Agent preset mounts a scoped execution policy for `read`, `glob`, and `grep`. Before dispatch, the policy resolves both the Session cwd and requested target through `ctx.fs` and requires canonical containment. It rejects absolute and cross-platform path syntax before resolution. A successful `read` value replaces the provider display path with the normalized request-relative path, which also supplies the browser read card and its clickable location.

The browser transport treats the Session-id owner prefix as necessary but insufficient. Existing Session operations also require the configured Workspace cwd and `zhiwo` preset, while Session and Workspace projections expose `/` instead of a Host path. Raw Session export is unavailable. Authorized Session history and model output retain native DSH behavior because every file below `userdata/` is owner-visible material. Zhiwo disables the local spill backend: capped discovery output asks the Agent to narrow its query instead of publishing a physical temporary-file locator.

The persona separately excludes tests, fixtures, mocks, and examples from owner facts unless formal owner material confirms them. This semantic rule complements filesystem confinement: a file can be inside `userdata/` and still be unsuitable evidence about its owner.

## Alternatives considered

Exposing `host.openPath` to the anonymous Zhiwo browser would have restored the native click path, but it would let a remote visitor ask the Host operating system to open local paths. A browser preview keeps the interaction useful without widening that authority.

Persona instructions alone cannot constrain filesystem providers. A read-only sandbox also addresses mutation rather than discovery. Runtime checks at tool execution and Session ownership are therefore required.

## Consequences

Conversation document links now render bounded UTF-8 text in the browser without granting anonymous visitors the Host native opener. Ordinary dsh products still use `host.openPath` when no product claims the path.

Zhiwo discovery cannot read through absolute paths, traversal, or external symlinks. Neither successful tool output nor API metadata exposes the physical Workspace root. Authorized histories and model streams remain complete, so the native Agent can continue from reasoning into tool calls and publish material found below `userdata/` without a product-specific content filter.

## Verification

Focused tests cover native opener fallback and product claims; Markdown, source, PDF, and image dialog views; SPA-fallback and unsupported-format rejection; safe document responses and traversal refusal; canonical tool denial with relative successful read values; exact Workspace/preset Session authorization; virtual path projections; raw-export refusal; and complete authorized history projection. The assembled keyless Zhiwo Web scenario mounts the shipped preset, executes a real in-Workspace read, rejects an external traversal, verifies that an over-cap glob result has no Host spill locator, checks the three-tool catalog and complete persona, and replays the visible answer through the native Agent Loop.
