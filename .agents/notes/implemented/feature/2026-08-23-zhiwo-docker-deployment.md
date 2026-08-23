# Agent Note: Zhiwo Docker deployment and repository action

Status: implemented

English | [中文](2026-08-23-zhiwo-docker-deployment.zh.md)

## Problem

Zhiwo's source command, build prerequisites, state paths, and operational steps were spread across package scripts and documentation. There was no supported long-running container composition, so operators had to decide which files were durable, how to mount `userdata`, and how to expose the Web port. The expanded sidebar also identified the product without offering a direct route to its source repository.

## Decision

The repository root Makefile is the Zhiwo command index. Its targets install dependencies, build, run and test the source composition, validate the project `.env` and selected data directory, and build, start, stop, restart, inspect, and follow logs for the Docker composition. `USERDATA_DIR`, `DSH_HOME_DIR`, and `ZHIWO_PORT` are explicit overrides; their defaults retain the existing `userdata`, `.artifacts/zhiwo`, and `18000` behavior. The source target clears inherited DeepSeek provider variables before Node preloads the project `.env`, and Compose injects the same file, so neither supported launch depends on or prefers a credential from the inherited process or a user-home file.

The production Dockerfile builds the workspace, statically builds the matching Linux Landlock launcher, injects every production Workspace dependency into a self-contained `@deepseek-ai/dsh` deployment, rejects broken package links, and runs the ordinary `dsh web` entry point with the packaged Zhiwo Patch as the unprivileged Node user. The CLI composition root directly supplies the Service Definition and infrastructure peers imported by its production plugin graph, so pnpm includes them in the deployment rather than relying on the development Workspace root. App Boot follows each installed package to its real location before traversing its dependency graph, so pnpm's injected virtual-store layout populates the profile module fallback with the complete plugin closure. The runtime image contains no source checkout, development dependency, Host package link, credential, or user material. Compose injects the project `.env` only when the container starts, requires a read-only bind mount of the selected user data directory, keeps DSH Sessions, identity, Workspace metadata, and Zhiwo's private question cache in the named `zhiwo-state` volume at `/data/dsh`, waits for an HTTP health check, and restarts the service unless explicitly stopped. The Web server listens on all container interfaces through `ZHIWO_LISTEN_HOST=0.0.0.0`, while Compose publishes only Host loopback by default. Docker teardown does not delete the named state volume.

The generic sidebar declares `sidebar.brand.action` as an optional root-scoped single slot beside, but outside, the brand's New Session button. Zhiwo registers an accessible GitHub icon in that slot, links it to `https://github.com/monshunter/askme-ai` in a new tab with opener isolation, and uses existing sidebar tokens for hover and focus presentation. Generic compositions leave the slot empty.

## Alternatives considered

**Copy the whole repository into the runtime image.** Rejected because the runtime needs the deployed CLI and production dependencies, not source, tests, package-manager caches, or local `userdata`.

**Bake user material into the image.** Rejected because `userdata` is user-owned runtime input, not an application dependency. Embedding it would couple a reusable image to one user's private material and make updates require rebuilding. Compose therefore requires a read-only Host mount selected at startup. DSH state remains a separate named volume because Sessions and identity must survive image replacement.

**Bake `.env` credentials into the image.** Rejected because credentials must remain replaceable local configuration and must not persist in image layers. The required project file removes the dependency on user-home or inherited configuration while Compose runtime injection keeps the image distributable.

**Publish the container on every Host interface.** Rejected because the composition does not provide account login, rate limits, TLS termination, or hardened public hosting. Loopback publication keeps external exposure an explicit reverse-proxy decision.

**Make the brand identity or its repository link start a Session.** Rejected because the dedicated New Session control already owns that behavior. Static identity plus a sibling action avoids ambiguous and nested interactions while letting other product compositions add an independent control without replacing sidebar geometry.

## Testing

Focused App Boot tests cover dependency-closure healing through a pnpm-style package symlink. Focused sidebar and Zhiwo UI tests cover the slot declaration, registration lifecycle, independent link semantics, localized accessible name, and expanded layout. The assembled keyless Zhiwo browser snapshot requires the repository address, new-tab target, and opener isolation. Compose configuration checks pin the read-only absolute data mount, named state volume, loopback port, restart policy, and health check. Real deployment acceptance starts the built container, opens the product in a browser, verifies the expanded sidebar action, restarts the service, and confirms the service and persistent state recover.

## Consequences

The production image build compiles and injects the repository packages, so it is intentionally slower but remains reusable across user data directories. The resulting runtime excludes development dependencies, credentials, source-path dependencies, and user material. Operators select current `userdata` when the container starts without rebuilding the image, and routine restarts or Compose teardown retain conversation state. Deleting the named volume remains a separate destructive operation. Public deployment still requires an authenticated TLS reverse proxy and traffic controls.
