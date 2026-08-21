# @deepseek-ai/dsh-zhiwo-ui

English | [中文](README.zh.md)

This browser-only plugin fills the native DSH brand, blank-session headline, input-dock, product-title, and message-placeholder extension points; projects visitor-owned native Sessions into a Workspace-free history list; and connects a clean browser to the one Host-projected Workspace through the native Workspace and Session runtimes. It displays `AskmeAI` and `Hi, get to know me here` in English, and `知我AI` and `你好，欢迎来了解我` in Chinese; “me” refers to the material owner represented by the Agent. Browser, install, sidebar, and greeting surfaces use the same packaged AskmeAI logo, and the generic preview badge is replaced with the localized greeting. The stylesheet changes only the leading icon and title of native `grep`, `glob`, `read`, and reasoning rows: search uses the product globe with “Global search,” read uses the product folder with “Source extraction,” and reasoning uses “Thinking.” Native summaries, file links, expandable cards, reasoning bodies, document preview actions, and inspection controls remain unchanged. The running tail replaces `Deep diving...` with product-specific Chinese and English copy. The message box says “Ask about my experience, projects, strengths, or plans” instead of addressing the visitor as the subject or asking what to build. The product supports only the light theme and pins the native theme runtime to `light`, so operating-system or stored dark preferences cannot mix dark component tokens into its green-and-cream visual system. One shared same-origin watercolor background is served at `/assets/zhiwo/index-bg.png`; blank Sessions use a compact icon rail, while active Sessions expose the full history sidebar.

The input dock validates and renders four bilingual semantic questions from the product's private Connection method. Blank Sessions show welcome questions; the latest completed Turn shows exactly two context and two global questions. Clicking a question fills the native draft without sending it. Automatic and manual refreshes are single-flight, and a failed or malformed refresh leaves the previous four questions in place. Switching language changes the text of the same semantic ids without another request.

Workspace file-location clicks open a dialog over the current conversation without changing the browser URL. Markdown receives rich-text rendering; other UTF-8 text and source files receive a syntax-aware code view; PDF and PNG, JPEG, GIF, or WebP responses receive bounded inline viewers. The client accepts only the documented media types from the product's same-origin endpoint, so an SPA HTML fallback becomes a visible load failure instead of displaying the current chat as document content.

The generic Workspace browser and picker are absent from the AskmeAI composition. Its presentation stylesheet also removes the leading command/access-mode cluster, context meter, and Session statistics strip while preserving the model selector and send control. A visible sidebar action switches the native interface and the AskmeAI Session history between Chinese and English without restoring the generic Settings UI. This package contributes no API, durable state store, routing, conversation implementation, or model-visible content.

Each Session-history row exposes a trash action on selection, pointer hover, or keyboard focus. The action opens a localized permanent-deletion confirmation, waits for `SessionRuntime.delete`, and keeps the dialog open with a retryable error if the Host refuses the operation; clicking the trash action never opens the row.

## Model Experience

None, as the package contributes browser presentation only; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- AskmeAI inherits the native DSH layout, draft, and conversation state. Its custom Session and question lists are browser projections; neither replaces native conversation state or persists a second copy.
