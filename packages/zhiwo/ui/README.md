# @deepseek-ai/dsh-zhiwo-ui

English | [中文](README.zh.md)

This browser-only plugin fills the native DSH brand and blank-session headline slots, projects visitor-owned native Sessions into a Workspace-free history list, and connects a clean browser to the one Host-projected Workspace through the native Workspace and Session runtimes. It displays `AskmeAI` and `Hello, I'm AskmeAI` in English, and `知我AI` and `你好，我是知我AI` in Chinese; the generic preview badge is replaced with that greeting. The generic Workspace browser and picker are absent from the AskmeAI composition. Its presentation stylesheet also removes the leading command/access-mode cluster, context meter, and Session statistics strip while preserving the model selector and send control. A visible sidebar action switches the native interface and the AskmeAI Session history between Chinese and English without restoring the generic Settings UI. This package contributes no API, state store, routing, conversation implementation, or model-visible content.

## Model Experience

None, as the package contributes browser presentation only; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- AskmeAI inherits the native DSH layout and conversation components. Its only custom list is a presentation of the native Session store; it owns no conversation state.
