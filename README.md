# AskmeAI

English | [中文](README.zh.md)

AskmeAI is a personal Agent through which visitors get to know the material owner. It represents that owner when answering from their material. The product is a thin configuration and branding layer over the native DeepSeek Harness Web application: it starts through the ordinary `dsh web` command, uses the upstream Host, Agent Loop, sessions, API, and browser client, and opens `userdata/` as its default Workspace.

There is no AskmeAI revision, knowledge compiler, synchronization command, generated corpus, custom API server, or product database. The files under `userdata/` are the source of truth and later turns read their current contents.

<a id="run-from-source"></a>

## Run from source

Create the gitignored project environment file once, then install and build:

```sh
cp .env.example .env
make zhiwo-install
make zhiwo-build
make zhiwo-run
```

Open the URL printed by `dsh web`. The Makefile is the command index for AskmeAI: run `make help` to see source, test, build, and Docker lifecycle targets. Both source and Docker launches require the project-local `.env`, so neither command depends on a credential exported by the launching shell or stored in a user-home environment file. `make zhiwo-run USERDATA_DIR=/absolute/materials DSH_HOME_DIR=/absolute/state ZHIWO_PORT=19000` overrides the three local paths and port. The existing `pnpm run zhiwo:demo` shortcut remains available with its `userdata/`, `.artifacts/zhiwo`, and port `18000` defaults.

## Run with Docker

Start the persistent service with the same project `.env`:

```sh
make zhiwo-docker-up
```

`make zhiwo-docker-package` packages the deployed CLI, frontend, native launcher, and complete production plugin dependency closure into `zhiwo-ai:local`; the resulting application image has no source-checkout, Host `node_modules`, credentials, or user material. `userdata` is always runtime input and is never copied into an image layer. `make zhiwo-docker-deploy` deploys that existing image, while `make zhiwo-docker-up` performs both stages. Compose injects `.env` at container start, requires a read-only bind mount of the selected data directory at `/data/userdata`, waits for the health check, publishes `0.0.0.0:18000`, and keeps native DSH Sessions, identity, Workspace metadata, and the question cache in the named `zhiwo-state` volume. Set `ZHIWO_TRUSTED_HOST` in `.env` to this deployment's browser-facing `host` or `host:port`; Compose passes it to the API Host/Origin checks without coupling the reusable configuration to one domain. The data mount defaults to the repository's local `userdata/`; set the Host environment variable `ZHIWO_USERDATA=/absolute/materials` or pass `USERDATA_DIR=/absolute/materials` to a deployment target to select another existing directory without rebuilding the image. Use `ZHIWO_PORT=19000` to expose another port. `make zhiwo-docker-status`, `make zhiwo-docker-logs`, and `make zhiwo-docker-restart` operate the service; `make zhiwo-docker-down` stops it without deleting the state volume.

## Behavior

The startup overlay registers the configured directory through the native Workspace Registry, and the native browser automatically connects its initial Session to that Workspace. AskmeAI exposes only conversations in the browser: Workspace names, groups, search, creation, settings, and pickers are absent. The shipped `zhiwo` Agent preset exposes only the maintained `read`, `glob`, and `grep` tools. Filesystem writes, Shell, Web search, Skills, plans, goals, workflows, jobs, and Subagents are absent from the model tool catalog.

The browser retains native conversation, streaming, history, model-selection, and Session behavior. A small client plugin displays `AskmeAI` in English and `知我AI` in Chinese, speaks about the material owner in the first person, replaces the generic preview headline with a localized invitation to get to know that owner, places a GitHub source link next to the expanded sidebar wordmark, and provides the sidebar language switch. Workspace controls, Session-log download, the command/access-mode cluster, the context meter, and the statistics strip are absent from the AskmeAI surface.

Each browser profile receives an anonymous signed identity. AskmeAI uses that identity to scope native Session ids, Session lists, direct Session operations, Workspace projections, and both event streams. A browser cannot read, change, or receive another browser's conversations. All visitors deliberately read the same read-only `userdata/` Workspace; the isolation applies to conversations, not to the source material.

Native DSH stores sessions and Workspace metadata below `DSH_HOME`. Keep the dedicated AskmeAI home if another DSH profile uses the same machine.

## Scope

AskmeAI inherits native DSH text-file reading and search behavior. It does not create model-readable copies of PDF, Office, archive, image, or other binary files. Anonymous browser Session isolation is part of this composition. Account login, authorization administration, rate limits, TLS termination, and hardened public hosting remain deployment concerns.

Implementation details live in the [AskmeAI package overview](packages/zhiwo/README.md) and the [user guide](docs/user/zhiwo.md).
