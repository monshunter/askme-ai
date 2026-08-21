# AskmeAI

English | [中文](README.zh.md)

AskmeAI is a thin configuration and branding layer over the native DeepSeek Harness Web application. It starts through the ordinary `dsh web` command, uses the upstream Host, Agent Loop, sessions, API, and browser client, and opens `userdata/` as its default Workspace.

There is no AskmeAI revision, knowledge compiler, synchronization command, generated corpus, custom API server, or product database. The files under `userdata/` are the source of truth and later turns read their current contents.

<a id="run-from-source"></a>

## Run

Install dependencies, build the repository, and provide a DeepSeek credential:

```sh
pnpm install
pnpm run build
export DEEPSEEK_API_KEY=your_key
```

Start the native Web profile with the AskmeAI patch:

```sh
DSH_HOME=.artifacts/zhiwo ZHIWO_WORKSPACE_ROOT=userdata \
  pnpm dsh web --patch packages/zhiwo/product/cordis.patch.yml
```

Open the URL printed by `dsh web`. The shortcut `pnpm run zhiwo:demo` runs the same command. `ZHIWO_WORKSPACE_ROOT` may name another directory when testing, but the product default is `userdata`.

## Behavior

The startup overlay registers the configured directory through the native Workspace Registry, and the native browser automatically connects its initial Session to that Workspace. AskmeAI exposes only conversations in the browser: Workspace names, groups, search, creation, settings, and pickers are absent. The shipped `zhiwo` Agent preset exposes only the maintained `read`, `glob`, and `grep` tools. Filesystem writes, Shell, Web search, Skills, plans, goals, workflows, jobs, and Subagents are absent from the model tool catalog.

The browser retains native conversation, streaming, history, model-selection, and Session behavior. A small client plugin displays `AskmeAI` in English and `知我AI` in Chinese, replaces the generic preview headline with a localized greeting, and provides the sidebar language switch. Workspace controls, Session-log download, the command/access-mode cluster, the context meter, and the statistics strip are absent from the AskmeAI surface.

Each browser profile receives an anonymous signed identity. AskmeAI uses that identity to scope native Session ids, Session lists, direct Session operations, Workspace projections, and both event streams. A browser cannot read, change, or receive another browser's conversations. All visitors deliberately read the same read-only `userdata/` Workspace; the isolation applies to conversations, not to the source material.

Native DSH stores sessions and Workspace metadata below `DSH_HOME`. Keep the dedicated AskmeAI home if another DSH profile uses the same machine.

## Scope

AskmeAI inherits native DSH text-file reading and search behavior. It does not create model-readable copies of PDF, Office, archive, image, or other binary files. Anonymous browser Session isolation is part of this composition. Account login, authorization administration, rate limits, TLS termination, and hardened public hosting remain deployment concerns.

Implementation details live in the [AskmeAI package overview](packages/zhiwo/README.md) and the [user guide](docs/user/zhiwo.md).
