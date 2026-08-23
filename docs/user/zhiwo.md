# Use AskmeAI

English | [中文](zhiwo.zh.md)

This tutorial starts the AskmeAI composition on the native DSH Web application and explains its raw-Workspace behavior. AskmeAI is the material owner's personal Agent for visitors: it represents that owner when answering, and first-person wording refers to the owner rather than the Agent or visitor.

## Prerequisites

Use a supported Node.js release and put `DEEPSEEK_API_KEY` in the gitignored project `.env`. Place model-readable text anywhere below `userdata/`.

```sh
cp .env.example .env
make zhiwo-install
make zhiwo-build
```

The Make targets validate this file before starting either runtime. The source target clears inherited DeepSeek provider variables before Node preloads the project file, and Compose injects the same file into the container, so these supported paths do not require or prefer an exported shell variable or `~/.env`. Keep `.env` local; the Docker build excludes it from every image layer.

## Start AskmeAI

Start the ordinary Web application with the AskmeAI patch:

```sh
make zhiwo-run
```

Open the URL printed by the command. The client connects the initial native Session to the registered `userdata/` Workspace; no directory selection or import step is required. Workspace names, groups, search, creation, settings, and pickers are not rendered in AskmeAI. Session-log download, command/access-mode controls, the context meter, and the statistics strip are also absent; model selection and sending remain available. Use the language action at the bottom of the sidebar to switch the whole interface and the Session history between Chinese and English. The sidebar name is `AskmeAI` in English and `知我AI` in Chinese; its adjacent GitHub icon opens the AskmeAI repository in a new tab. The blank-session headline invites a visitor with `Hi, get to know me here` or `你好，欢迎来了解我`, with no preview badge. Visitors see only their conversations. `pnpm run zhiwo:demo` remains a shortcut with the default paths.

The default URL is `http://127.0.0.1:18000`. Use `make zhiwo-run USERDATA_DIR=/absolute/materials DSH_HOME_DIR=/absolute/state ZHIWO_PORT=19000` to override the Workspace, state directory, or port. The underlying patch resolves an explicit `--port` before `ZHIWO_LISTEN_PORT`; AskmeAI fails when the selected port is invalid or occupied and never chooses a random fallback.

Each browser profile receives an anonymous identity. Its native Session history is private to that profile, while every visitor reads the same read-only `userdata/` Workspace.

## Run a persistent Docker service

Docker Compose keeps the application running with `restart: unless-stopped` and waits for the Web health check during startup:

```sh
make zhiwo-docker-package
make zhiwo-docker-deploy
make zhiwo-docker-status
```

The package stage injects every Workspace package into a production deployment and rejects broken package links. The resulting `zhiwo-ai:local` contains the CLI, frontend, native launcher, and complete production plugin dependency closure; it contains no source checkout, Host `node_modules`, credentials, or `userdata`. User material is required runtime input rather than an image asset. `make zhiwo-docker-up` is the one-command package-and-deploy form. Compose bind-mounts the selected existing directory at `/data/userdata`, read-only. Native DSH state lives separately in the named `zhiwo-state` volume at `/data/dsh`; rebuilding, restarting, or running `make zhiwo-docker-down` does not delete that volume. Do not use `docker compose down --volumes` when this state must be preserved.

Choose another existing data directory or host port with Make variables:

```sh
ZHIWO_USERDATA=/absolute/materials make zhiwo-docker-deploy ZHIWO_PORT=19000
# Equivalent Make-variable form:
make zhiwo-docker-deploy USERDATA_DIR=/absolute/materials ZHIWO_PORT=19000
```

The container listens on all of its own interfaces, but Compose publishes it only on the Host loopback address. Use a separate authenticated reverse proxy with TLS, traffic controls, and an explicit exposure decision before serving AskmeAI beyond the local machine. `make help` lists the build, start, stop, restart, log, status, configuration, source, and test targets.

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
