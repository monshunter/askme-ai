# Use AskmeAI

English | [中文](zhiwo.zh.md)

This tutorial starts the AskmeAI composition on the native DSH Web application and explains its raw-Workspace behavior.

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

Open the URL printed by the command. The client connects the initial native Session to the registered `userdata/` Workspace; no directory selection or import step is required. Workspace names, groups, search, creation, settings, and pickers are not rendered in AskmeAI. Session-log download, command/access-mode controls, the context meter, and the statistics strip are also absent; model selection and sending remain available. Use the language action at the bottom of the sidebar to switch the whole interface and the Session history between Chinese and English. The sidebar name is `AskmeAI` in English and `知我AI` in Chinese; the blank-session headline is the localized greeting `Hello, I'm AskmeAI` or `你好，我是知我AI`, with no preview badge. Users see only their conversations. `pnpm run zhiwo:demo` is a shortcut for the same command.

Each browser profile receives an anonymous identity. Its native Session history is private to that profile, while every visitor reads the same read-only `userdata/` Workspace.

## Ask questions

Ask about facts present in the Workspace. The AskmeAI Agent discovers raw files with `glob` and `grep`, reads relevant sections with `read`, and cites important evidence as relative `path:line` locations. It reports missing evidence instead of inventing an answer.

The model cannot edit files or use Shell, Web search, Skills, plans, goals, workflows, jobs, or Subagents. Browser controls for those capabilities are absent from this composition.

## Update the data

Edit, add, rename, or remove files directly in `userdata/`. A later question reads the current filesystem state; there is no sync command or generated corpus to refresh. Existing answers remain Session history and are not rewritten when a source file changes.

`ZHIWO_WORKSPACE_ROOT` may point at another existing directory for local testing. Relative paths resolve from the directory where the command starts.

## State and formats

Native DSH stores Workspace metadata and Session logs below `DSH_HOME`. AskmeAI stores one private identity-signing key there and uses owner-prefixed native Session ids; it does not add a visitor, message, or Session database. Use the dedicated `.artifacts/zhiwo` home to keep this state separate from other profiles.

AskmeAI inherits native DSH text reading and search. It does not convert PDF, Office, archive, image, or other binary formats; provide a text representation in the Workspace when the Agent must inspect that content.

## Deployment limit

The composition isolates anonymous browser Session histories. It does not add account login, authorization administration, rate limits, TLS termination, or a hardened public HTTP service.
