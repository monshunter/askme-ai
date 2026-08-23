# Agent Note: Zhiwo public Host authority

Status: implemented

English | [中文](2026-08-23-zhiwo-public-host-authority.zh.md)

## Problem

The [Docker deployment](../feature/2026-08-23-zhiwo-docker-deployment.md) served static files through a public reverse proxy while publishing the Host port only on loopback. More importantly, the API browser-trust check received the preserved public `Host` and returned `403` before RPC dispatch because that deployment authority was not declared. The page opened, but `host.describe`, event streams, and Session creation could not connect.

## Decision

Compose publishes the selected container port on `0.0.0.0` and requires `ZHIWO_TRUSTED_HOST` from the deployment's `.env`. The value is a canonical `host` or `host:port` without a scheme and is passed to the existing `--trusted-host` option. The reusable Compose file contains no deployment-specific domain; each operator supplies the authority visitors actually use.

The native Host and Origin checks remain active. A request must use the declared authority and same-origin browser markers, while loopback-only privileged methods retain their existing restriction. The reverse proxy preserves the browser-facing Host rather than rewriting or stripping security headers.

## Alternatives considered

**Hardcode the current public domain in Compose.** Rejected because it couples every installation to one deployment and makes another operator's valid domain fail.

**Rewrite the proxy Host to loopback.** Rejected because the browser Origin would then disagree with Host; stripping or forging Origin would weaken the existing cross-site defense.

**Accept every Host.** Rejected because it removes the DNS-rebinding defense instead of declaring the authority this deployment owns.

## Testing

The rendered Compose configuration records the instance-provided authority and `0.0.0.0` publication. Real acceptance requires public `host.describe` and `session.create` responses with HTTP 200, an enabled New Session control and composer in the browser, and no `403` or `forbidden` state after selecting New Session.

## Consequences

The Host port is reachable on every Host interface, so authentication, TLS termination, and traffic controls remain deployment responsibilities. A missing or malformed `ZHIWO_TRUSTED_HOST` fails before a public deployment can silently serve a page with unusable APIs. The application image and Compose file remain reusable across domains.
