# Agent Note: Zhiwo personalized question suggestions

Status: implemented

English | [中文](2026-08-21-zhiwo-personalized-questions.zh.md)

## Problem

The blank Zhiwo session offers only a greeting and the generic Web composer still asks what the user wants to build. Neither surface explains that Zhiwo is the material owner's personal Agent for visitors or which questions visitors can ask about that owner. After an answer, the composer also provides no grounded next step, so the visitor must invent a new question without seeing the projects or personal themes already available in `userdata/`.

The suggestions must remain private and responsive. Recursively reading a multi-gigabyte Workspace at startup would delay the application and expose a derived index lifecycle Zhiwo does not otherwise need. Generating suggestions with a model before any Session exists would add cost, failure modes, and model-visible input that the Session log cannot reconstruct.

## Decision

`packages/zhiwo/product` owns a derived question catalog over the raw Workspace. Startup schedules a non-blocking, read-only inventory of eligible immediate child directories and regular documents, ignoring hidden entries and symbolic links. The inventory fingerprints entry names, kinds, sizes, and modification times without reading document bodies. Directory names identify projects. The product compares that fingerprint with a versioned private cache below `DSH_HOME`: an exact hit publishes the cached catalog without rebuilding or rewriting it; a miss atomically publishes and caches 100 semantic question pairs. With projects, the catalog contains 50 global and 50 project questions; without projects it contains 100 global questions. Every semantic id has complete Simplified Chinese and English text.

The shipped `zhiwo` persona treats the material owner, visitor, and Agent as distinct actors. Zhiwo represents the owner to visitors; first-person answers refer to the owner, never the Agent or visitor, and visitor or machine-environment information must not be attributed to the owner. Answers cite only relative paths and never expose absolute paths. Suggestions are written as questions from a visitor to that represented owner.

The product registers one internal `zhiwo/questions` method on the existing Connection `/api` channel. The Zhiwo access policy admits that method and applies its existing visitor-owned Session-id check before dispatch. A welcome request returns four rotating questions, normally two global and two project-specific. A follow-up request is accepted only when the latest Turn ended with `completed`; it returns exactly two questions inferred from the latest user and assistant messages plus two questions selected from the initialized global pool. Context questions use a named project when the transcript mentions one, otherwise they use a short sanitized fragment of the user's latest prompt. Requests carry previously seen ids so automatic and manual refreshes rotate until the applicable category is exhausted.

`packages/zhiwo/ui` fills the existing `conversation.input.dock` list seat with the suggestion panel. A blank Session requests welcome questions. A newly completed Turn requests follow-up questions. Clicking a question writes it into the native composer draft; sending remains an explicit user action. Both phases expose one refresh button. Each Session and locale has at most one in-flight request, the button reports loading, and a failed, cancelled, interrupted, or malformed update leaves the previous four questions visible with a retry affordance. The browser validates every response and rejects a follow-up response unless its source tags prove the required two-plus-two split.

Zhiwo also intercepts the native conversation placeholder extension point. Its visible message textarea says “Ask about my experience, projects, strengths, or plans” in English and “问问我的经历、项目、能力或计划” in Chinese, where first person denotes the represented owner. The blank-session greeting similarly invites visitors to get to know that owner instead of introducing the Agent as an independent subject. Generic Web profiles retain their existing copy. The Zhiwo Patch resolves the Web port from an explicit `--port`, then `ZHIWO_LISTEN_PORT`, and finally `18000`; the bind host remains `127.0.0.1`. Invalid or occupied ports fail at startup and never fall back to an operating-system-selected port.

Zhiwo also owns browser-document branding. The Host replaces the initial build title, generic fish favicon, install manifest, and manifest icon before serving the page. The Client supplies “知我AI” through the product-title waterfall so blank and titled Sessions retain that name after React mounts; the icon is the same rounded “知” mark used in the application shell. Generic Web profiles retain their build-selected title, favicon, and install metadata.

## Privacy and lifecycle

Question text may contain sanitized top-level project names, but never absolute paths, `userdata`, DSH or Harness implementation names, system prompts, tool traces, or hidden entry names. The catalog cache uses a Workspace-path hash instead of the path itself and private directory and file permissions; it stores the derived catalog and fingerprint, not document content. Cache parsing, browser requests, and browser responses are untrusted JSON boundaries and reject unknown versions, invalid source tags, oversized fields, duplicate ids, and incorrect category counts.

The scan publishes only complete catalog revisions and its disposer prevents late completion from replacing state after plugin teardown. The UI aborts requests on Session, locale, or component changes and ignores stale results. A Turn that does not end in `completed` never replaces the last successful follow-up set.

## Alternatives considered

**Generate all suggestions through the LLM.** Rejected because startup has no Session log to own the model-visible Workspace summary, and the feature would become unavailable or costly when the provider is offline. The deterministic catalog and transcript projection need no additional model call.

**Recursively index every file in `userdata/`.** Rejected because project identity is available from immediate child directories. The root inventory still notices visible document metadata changes for cache invalidation, while recursive content indexing would add startup latency, binary-format policy, and another persisted knowledge representation.

**Change the generic conversation dictionary.** Rejected because coding-oriented copy remains correct for the shipped Harness Web profile. A narrow placeholder interception keeps product copy in the Zhiwo plugin.

**Build a Zhiwo-specific BFF or Session store.** Rejected because the existing Connection interceptor, visitor access policy, native Session log, and input Slots already own the required lifecycle and isolation.

## Testing

- Startup does not wait for the catalog inventory. It reads only eligible immediate child directory/document metadata and never document bodies. An unchanged fingerprint reuses the private cache without catalog initialization or a cache rewrite; a changed directory or document invalidates it. A complete catalog contains 100 unique semantic pairs and both locales have one complete rendering for every id.
- The blank Session displays four questions and manual refresh rotates them without replacing the visible set on failure. With eligible projects, the set contains two global and two project questions.
- Every newly completed assistant Turn replaces the panel with exactly two context and two global questions. Failed, aborted, blocked, max-token, and interrupted Turns retain the previous successful set.
- Chinese and English switches update the questions, controls, error text, and Zhiwo composer placeholder without changing semantic ids. No visible suggestion contains an absolute path or a forbidden implementation term.
- The greeting, placeholder, questions, and model persona consistently present Zhiwo as the material owner's visitor-facing Agent. First-person output denotes the owner, and visitor information is never attributed to the owner.
- The default Web URL is `http://127.0.0.1:18000`; `ZHIWO_LISTEN_PORT` and explicit `--port` overrides bind the requested port; an occupied port fails loudly.
- Blank and titled browser tabs and install metadata use “知我AI” and the rounded “知” icon, with no DSH product wording or generic fish mark.
- Focused unit and real-composition tests cover catalog construction, cache validation, visitor isolation, Turn completion, rotation, response validation, refresh failure, locale switching, and placeholder interception. A keyless assembled transcript or browser fixture pins the user-visible lifecycle.
- Computer Use acceptance against the real Zhiwo server and configured real model transport covers the initial four questions, manual refresh, one successful answer followed by a two-plus-two set, both locales, the placeholder copy, browser-tab branding, port behavior, and absence of forbidden text in rendered UI and transport responses.

## Consequences

Top-level directory names can be terse or technical, so project questions may be less natural than content-derived questions. The bounded approach deliberately prefers predictable startup and privacy; later content inference requires its own model-visible logging and invalidation design. Metadata-preserving edits with unchanged size and modification time are not distinguishable without reading document bodies, so the cache accepts that narrow filesystem limitation.
