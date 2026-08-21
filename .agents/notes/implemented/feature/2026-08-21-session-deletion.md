# Agent Note: Session deletion

Status: implemented

English | [中文](2026-08-21-session-deletion.zh.md)

## Problem

The Zhiwo sidebar lists durable Sessions but has no destructive action for histories that are no longer wanted. Removing a row only in the browser would make it return on reload, while deleting a live log without its lifecycle owner could race pending writes and leave false removal frames or corrupt persistence. Workspace removal and archive are different operations: they preserve Session logs.

## Decision

`session.delete({ sessionId })` permanently removes exactly one ordinary Session log. The Host waits for a concurrent create of the same id, rejects subagent-owned Sessions and live Sessions owned by another component, and retains the `AgentHandle` for every lifecycle it creates or cold-resumes. A live target is disposed through that handle so its active turn, event drain, and Session retirement finish through the owning lifecycle.

The Host suppresses the ordinary `session/disposed` removal increment during this disposal. It then calls `SessionPersistence.delete`, whose coordinator waits for retirement, serializes the operation with writes for that id, rejects a remaining live owner, and invalidates retained preparation state before the backend deletes its JSONL artifact or SQLite rows. Only after durable deletion succeeds does the Host remove the id from every Workspace account and the global archive set and emit one `host/session-removed` frame. If durable deletion fails, the RPC returns an error without a removal frame or Workspace mutation, so the visible row remains available for retry.

`SessionManager.delete` applies the successful unary response and the Host increment through the same idempotent local removal path. `SessionRuntime.delete` selects the newest remaining Session when the deleted id was current. The Zhiwo row exposes a trash icon, opens a destructive confirmation Modal, disables dismissal and duplicate submission while pending, and keeps the Modal open with a retryable error on failure.

The operation does not delete the Session cwd, attachment-store objects, ordinary fork descendants, or subagent descendant logs. Those objects have different ownership and retention rules. The generic Workspace browser keeps its non-destructive Archive action; destructive deletion is an explicit Zhiwo row action.

## Alternatives considered

**Delete the client row only.** Rejected because the durable log returns in the next `session.list` baseline.

**Delete persistence while the Session is live.** Rejected because pending event writes and lifecycle cleanup would race the destructive backend operation.

**Publish removal on `session/disposed`.** Rejected because a later persistence failure would tell every connected client that a still-stored Session had been deleted.

**Cascade into descendants, attachments, or the working directory.** Rejected because the selected Session does not own those independent records or user files.

## Consequences

Deletion is irreversible for the selected Session log. A failed durable delete leaves the row and Workspace account visible for retry; a successful delete converges through both the unary response and Host stream and stays absent after reload. Workspace cleanup after the irreversible persistence commit is best effort and logs a warning if its storage write fails; Session list persistence remains the authoritative visibility baseline.
