# @deepseek-ai/dsh-zhiwo-ui

English | [中文](README.zh.md)

This browser-only plugin fills the native DSH brand, blank-session headline, input-dock, product-title, and message-placeholder extension points; projects visitor-owned native Sessions into a Workspace-free history list; and connects a clean browser to the one Host-projected Workspace through the native Workspace and Session runtimes. It displays `AskmeAI` and `Hi, get to know me here` in English, and `知我AI` and `你好，欢迎来了解我` in Chinese; “me” refers to the material owner represented by the Agent. Browser tabs always use “知我AI” plus the rounded “知” favicon, and the generic preview badge is replaced with the localized greeting. The message box says “Ask about my experience, projects, strengths, or plans” instead of addressing the visitor as the subject or asking what to build.

The input dock validates and renders four bilingual semantic questions from the product's private Connection method. Blank Sessions show welcome questions; the latest completed Turn shows exactly two context and two global questions. Clicking a question fills the native draft without sending it. Automatic and manual refreshes are single-flight, and a failed or malformed refresh leaves the previous four questions in place. Switching language changes the text of the same semantic ids without another request.

Workspace file-location clicks open a dialog over the current conversation without changing the browser URL. Markdown receives rich-text rendering; other UTF-8 text and source files receive a syntax-aware code view; PDF and PNG, JPEG, GIF, or WebP responses receive bounded inline viewers. The client accepts only the documented media types from the product's same-origin endpoint, so an SPA HTML fallback becomes a visible load failure instead of displaying the current chat as document content.

The generic Workspace browser and picker are absent from the AskmeAI composition. Its presentation stylesheet also removes the leading command/access-mode cluster, context meter, and Session statistics strip while preserving the model selector and send control. A visible sidebar action switches the native interface and the AskmeAI Session history between Chinese and English without restoring the generic Settings UI. This package contributes no API, durable state store, routing, conversation implementation, or model-visible content.

## Model Experience

None, as the package contributes browser presentation only; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- AskmeAI inherits the native DSH layout, draft, and conversation state. Its custom Session and question lists are browser projections; neither replaces native conversation state or persists a second copy.
