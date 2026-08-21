# Use AskmeAI

English | [中文](zhiwo.zh.md)

This tutorial starts the AskmeAI composition on the native DSH Web application and explains its raw-Workspace behavior. AskmeAI is the material owner's personal Agent for visitors: it represents that owner when answering, and first-person wording refers to the owner rather than the Agent or visitor.

## Prerequisites

Use a supported Node.js release, install pnpm dependencies, build the repository, and set `DEEPSEEK_API_KEY`. Place model-readable text anywhere below `userdata/`.

```sh
pnpm install
pnpm run build
export DEEPSEEK_API_KEY=your_key
```

## Start AskmeAI

Run the ordinary Web command with the AskmeAI patch:

```sh
DSH_HOME=.artifacts/zhiwo ZHIWO_WORKSPACE_ROOT=userdata \
  pnpm dsh web --patch packages/zhiwo/product/cordis.patch.yml
```

Open the URL printed by the command. The client connects the initial native Session to the registered `userdata/` Workspace; no directory selection or import step is required. Workspace names, groups, search, creation, settings, and pickers are not rendered in AskmeAI. Session-log download, command/access-mode controls, the context meter, and the statistics strip are also absent; model selection and sending remain available. Use the language action at the bottom of the sidebar to switch the whole interface and the Session history between Chinese and English. The sidebar name is `AskmeAI` in English and `知我AI` in Chinese; the blank-session headline invites a visitor with `Hi, get to know me here` or `你好，欢迎来了解我`, with no preview badge. Visitors see only their conversations. `pnpm run zhiwo:demo` is a shortcut for the same command.

The default URL is `http://127.0.0.1:18000`. Set `ZHIWO_LISTEN_PORT` for a stable deployment override, or pass `--port` for one invocation; the explicit flag wins. AskmeAI fails when the selected port is invalid or occupied and never chooses a random fallback.

Each browser profile receives an anonymous identity. Its native Session history is private to that profile, while every visitor reads the same read-only `userdata/` Workspace.

## Ask questions

Ask about the material owner using facts present in the Workspace. The AskmeAI Agent represents that owner in first-person answers, discovers raw files with `glob` and `grep`, reads relevant sections with `read`, and cites important evidence as relative `path:line` locations. It never exposes absolute paths, derives owner facts from host usernames or other machine-environment data, treats a visitor's information as the owner's, or invents an answer when evidence is missing.

At startup, AskmeAI inventories visible immediate child directories and regular documents and prepares 100 bilingual semantic question pairs. It compares name/type/size/modification-time metadata with a private cache below `DSH_HOME`; unchanged content reuses the cache without rebuilding it, while a changed directory or document refreshes it. Document bodies are not read for this catalog. With project directories, half the questions are global and half name a specific project. A blank Session shows four rotating questions that a visitor can ask about the owner; select one to place it in the draft, then send it normally. Use **Refresh** to request another set. The message box itself says “Ask about my experience, projects, strengths, or plans” in English and “问问我的经历、项目、能力或计划” in Chinese.

After each successfully completed answer, the panel changes to **Keep asking** and contains exactly two questions inferred from that completed conversation plus two from the initialized global pool. The refresh button remains available. If the Turn is cancelled, interrupted, blocked, reaches its token limit, or fails—or if question refresh fails—the last successful four questions remain visible. Switching language translates the same four semantic questions rather than replacing them.

The model cannot edit files or use Shell, Web search, Skills, plans, goals, workflows, jobs, or Subagents. Browser controls for those capabilities are absent from this composition.

## Update the data

Edit, add, rename, or remove files directly in `userdata/`. A later question reads the current filesystem state; there is no sync command or generated corpus to refresh. Existing answers remain Session history and are not rewritten when a source file changes.

`ZHIWO_WORKSPACE_ROOT` may point at another existing directory for local testing. Relative paths resolve from the directory where the command starts.

The question inventory reads immediate entry metadata only. It does not read document bodies, follow symbolic links, create a content index, or expose Workspace paths in suggestions. Editing content affects later Agent answers immediately; changed top-level documents and project directories invalidate the private question cache on the next AskmeAI start. Browser tabs and install metadata use the “知我AI” product title and rounded “知” icon rather than the generic DSH build branding.

## State and formats

Native DSH stores Workspace metadata and Session logs below `DSH_HOME`. AskmeAI stores one private identity-signing key there and uses owner-prefixed native Session ids; it does not add a visitor, message, or Session database. Use the dedicated `.artifacts/zhiwo` home to keep this state separate from other profiles.

AskmeAI inherits native DSH text reading and search. It does not convert PDF, Office, archive, image, or other binary formats; provide a text representation in the Workspace when the Agent must inspect that content.

## Deployment limit

The composition isolates anonymous browser Session histories. It does not add account login, authorization administration, rate limits, TLS termination, or a hardened public HTTP service.
