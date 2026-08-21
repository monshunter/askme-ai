/** Zhiwo ownership policy around the native DSH browser API. */

import { randomUUID } from 'node:crypto'
import {
  clientRequestSchema,
  type ClientRequest,
  type HostFrame,
  type MuxFrame,
  type RpcRequest,
  type WorkspaceView,
} from '@deepseek-ai/dsh-host-apiproxy/api'
import type {
  ConnectionApiAccess,
  ConnectionApiFetchNext,
  ConnectionApiHeaders,
} from '@deepseek-ai/dsh-client-connection'
import type { VisitorIdentities, VisitorIdentity } from './identity.ts'
import { containsUnsafeValue } from './output-policy.ts'
import { ZHIWO_QUESTIONS_ENDPOINT } from './questions.ts'

const ALLOWED_METHODS = new Set([
  'host.describe',
  'llm.models',
  'llm.providers',
  'session.cancel',
  'session.create',
  'session.fork',
  'session.history',
  'session.list',
  'session.models',
  'session.prompt',
  'session.rename',
  'session.search',
  'session.selectModel',
  'session.updateQueue',
  'workspace.archiveSession',
  'workspace.insertSessionBefore',
  'workspace.list',
  ZHIWO_QUESTIONS_ENDPOINT,
])

const SESSION_ID_FIELDS = ['sessionId', 'parentSessionId', 'childSessionId', 'beforeSessionId'] as const

type JsonRecord = Record<string, unknown>

/** Resolve whether an owned Session also has the configured Zhiwo workspace and preset. */
export type SessionAuthorizer = (sessionId: string, signal?: AbortSignal) => Promise<boolean>

function record(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : undefined
}

function owns(identity: VisitorIdentity, sessionId: unknown): sessionId is string {
  return typeof sessionId === 'string' && sessionId.startsWith(identity.sessionPrefix)
}

function foreignSessionId(identity: VisitorIdentity, payload: unknown): string | undefined {
  const value = record(payload)
  if (value === undefined) return undefined
  for (const field of SESSION_ID_FIELDS) {
    const sessionId = value[field]
    if (typeof sessionId === 'string' && !owns(identity, sessionId)) return sessionId
  }
  return undefined
}

function methodArguments(method: string, payload: unknown): unknown {
  if (method !== ZHIWO_QUESTIONS_ENDPOINT) return payload
  return record(record(payload)?.['args'])?.['request']
}

function visibleSummary(
  value: unknown,
  workspaceRoot: string,
  identity: VisitorIdentity,
): JsonRecord | undefined {
  const summary = record(value)
  if (summary === undefined
    || !owns(identity, summary['sessionId'])
    || summary['cwd'] !== workspaceRoot
    || summary['agentPreset'] !== 'zhiwo') return undefined
  return { ...summary, cwd: '/' }
}

function workspaceView(value: unknown, workspaceId: string, identity: VisitorIdentity): WorkspaceView | undefined {
  const workspace = record(value)
  if (workspace?.['workspaceId'] !== workspaceId) return undefined
  const sessionIds = Array.isArray(workspace['sessionIds'])
    ? workspace['sessionIds'].filter(sessionId => owns(identity, sessionId))
    : []
  // The native response has already passed the Host schema; this adapter changes only its Session-id array.
  return { ...workspace, path: '/', sessionIds } as unknown as WorkspaceView
}

async function filteredValue(
  method: string,
  value: unknown,
  workspaceId: string,
  workspaceRoot: string,
  identity: VisitorIdentity,
  authorizeSession: SessionAuthorizer,
  signal?: AbortSignal,
): Promise<unknown> {
  const body = record(value)
  if (body === undefined) return value
  switch (method) {
    case 'session.list': {
      const items = Array.isArray(body['items'])
        ? body['items'].map(item => visibleSummary(item, workspaceRoot, identity)).filter(item => item !== undefined)
        : []
      return {
        ...body,
        items: items.filter(item => !containsUnsafeValue(item, workspaceRoot)),
      }
    }
    case 'session.search': {
      const items: unknown[] = Array.isArray(body['items']) ? body['items'] : []
      const visibility = await Promise.all(items.map(async (item) => {
        const row = record(item)
        const sessionId = row?.['sessionId']
        return owns(identity, sessionId)
          && await authorizeSession(sessionId, signal)
          && !containsUnsafeValue(row, workspaceRoot)
          ? item
          : undefined
      }))
      return { ...body, items: visibility.filter(item => item !== undefined) }
    }
    case 'workspace.list':
      return {
        ...body,
        items: Array.isArray(body['items'])
          ? body['items'].map(item => workspaceView(item, workspaceId, identity)).filter(item => item !== undefined)
          : [],
        archivedSessionIds: Array.isArray(body['archivedSessionIds'])
          ? body['archivedSessionIds'].filter(sessionId => owns(identity, sessionId))
          : [],
      }
    case 'workspace.insertSessionBefore':
      return { ...body, workspace: workspaceView(body['workspace'], workspaceId, identity) }
    case 'workspace.archiveSession':
      return {
        ...body,
        archivedSessionIds: Array.isArray(body['archivedSessionIds'])
          ? body['archivedSessionIds'].filter(sessionId => owns(identity, sessionId))
          : [],
      }
    case 'host.describe':
      return {
        ...body,
        cwd: '/',
        home: '/',
        attachedSessions: 0,
        canOpenPath: false,
      }
    case 'session.create':
    case 'session.fork':
      return owns(identity, body['sessionId']) ? value : undefined
    default:
      return value
  }
}

async function filterRpcResponse(
  method: string,
  body: unknown,
  workspaceId: string,
  workspaceRoot: string,
  identity: VisitorIdentity,
  authorizeSession: SessionAuthorizer,
  signal?: AbortSignal,
): Promise<unknown> {
  const envelope = record(body)
  const result = record(envelope?.['result'])
  if (envelope === undefined || result?.['ok'] !== true) return body
  if (method === 'session.history'
    && containsUnsafeValue(result['value'], workspaceRoot)) {
    return {
      ...envelope,
      result: { ...result, value: { events: [], hasMore: false } },
    }
  }
  const value = await filteredValue(
    method,
    result['value'],
    workspaceId,
    workspaceRoot,
    identity,
    authorizeSession,
    signal,
  )
  if (value === undefined && (method === 'session.create' || method === 'session.fork')) {
    return {
      ...envelope,
      result: {
        ok: false,
        error: { code: 'internal', message: 'Zhiwo refused an unowned Session identity', details: {} },
      },
    }
  }
  return {
    ...envelope,
    result: {
      ...result,
      value,
    },
  }
}

function rewrittenRequest(request: Request, message: ClientRequest): Request {
  const headers = new Headers(request.headers)
  headers.delete('content-length')
  return new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify(message),
    signal: request.signal,
  })
}

function withIdentityCookie(response: Response, identity: VisitorIdentity): Response {
  if (identity.setCookie === undefined) return response
  const headers = new Headers(response.headers)
  headers.append('set-cookie', identity.setCookie)
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

async function filteredHostFrame(
  frame: RpcRequest<HostFrame>,
  workspaceId: string,
  workspaceRoot: string,
  identity: VisitorIdentity,
  authorizeSession: SessionAuthorizer,
): Promise<RpcRequest<HostFrame> | undefined> {
  const payload = frame.payload
  switch (payload.type) {
    case 'host/session-added':
      return owns(identity, payload.sessionId)
        && payload.cwd === workspaceRoot
        && payload.agentPreset === 'zhiwo'
        ? { ...frame, payload: { ...payload, cwd: '/' } }
        : undefined
    case 'host/session-removed':
      return owns(identity, payload.sessionId) ? frame : undefined
    case 'host/session-status':
      return owns(identity, payload.sessionId) && await authorizeSession(payload.sessionId) ? frame : undefined
    case 'host/agent-error':
      return owns(identity, payload.sessionId) && await authorizeSession(payload.sessionId)
        ? { ...frame, payload: { ...payload, message: 'Zhiwo request failed' } }
        : undefined
    case 'host/workspace-changed': {
      const workspace = workspaceView(payload.workspace, workspaceId, identity)
      return workspace === undefined
        ? undefined
        : { ...frame, payload: { ...payload, workspace } }
    }
    case 'host/workspace-removed':
      return payload.workspaceId === workspaceId ? frame : undefined
    case 'host/workspace-order-changed':
      return {
        ...frame,
        payload: {
          ...payload,
          workspaceIds: payload.workspaceIds.filter(id => id === workspaceId),
        },
      }
    case 'host/archived-sessions-changed':
      return {
        ...frame,
        payload: {
          ...payload,
          archivedSessionIds: payload.archivedSessionIds.filter(id => owns(identity, id)),
        },
      }
    case 'host/remote-event':
      return undefined
    case 'stream/error':
      return frame
  }
}

async function filteredMuxFrame(
  frame: RpcRequest<MuxFrame>,
  identity: VisitorIdentity,
  authorizeSession: SessionAuthorizer,
): Promise<RpcRequest<MuxFrame> | undefined> {
  return frame.payload.type === 'stream/error'
    || (owns(identity, frame.payload.sessionId) && await authorizeSession(frame.payload.sessionId))
    ? frame
    : undefined
}

/** Browser API adapter that leaves native DSH state authoritative and filters it by visitor-owned Session ids. */
export class ZhiwoApiAccess implements ConnectionApiAccess {
  /**
   * @param identities - stateless signed-cookie resolver.
   * @param workspaceId - the sole native Workspace exposed by Zhiwo.
   * @param workspaceRoot - canonical path used for every new Session.
   * @param authorizeSession - validates the Session's workspace and preset.
   */
  constructor(
    private readonly identities: VisitorIdentities,
    private readonly workspaceId: string,
    private readonly workspaceRoot: string,
    private readonly authorizeSession: SessionAuthorizer,
  ) {}

  /** Authorize and filter one native API exchange. */
  async fetch(request: Request, next: ConnectionApiFetchNext): Promise<Response> {
    const identity = this.identities.resolve(request.headers.get('cookie') ?? undefined)
    const url = new URL(request.url)
    const method = url.pathname.startsWith('/api/') ? url.pathname.slice('/api/'.length) : undefined
    if (request.method !== 'POST' || method === undefined || !ALLOWED_METHODS.has(method)) {
      return withIdentityCookie(new Response('not found', { status: 404 }), identity)
    }

    let parsed: ReturnType<typeof clientRequestSchema.safeParse>
    try {
      parsed = clientRequestSchema.safeParse(await request.clone().json())
    } catch {
      return withIdentityCookie(await next.fetch(request), identity)
    }
    if (!parsed.success || parsed.data.method !== method) {
      return withIdentityCookie(await next.fetch(request), identity)
    }
    const payload = record(parsed.data.payload)
    const argumentsValue = methodArguments(method, payload)
    const foreign = foreignSessionId(identity, argumentsValue)
    if (method !== 'session.create' && (foreign !== undefined || await Promise.all(
      SESSION_ID_FIELDS.map(async (field) => {
        const sessionId = record(argumentsValue)?.[field]
        return typeof sessionId === 'string' && !await this.authorizeSession(sessionId, request.signal)
      }),
    ).then(results => results.some(Boolean)))) {
      return withIdentityCookie(new Response('not found', { status: 404 }), identity)
    }

    let message = parsed.data
    if (method === 'session.create') {
      message = {
        ...message,
        payload: {
          sessionId: `${identity.sessionPrefix}${randomUUID()}`,
          workspaceId: this.workspaceId,
        },
      }
    } else if (method === 'session.fork') {
      message = {
        ...message,
        payload: {
          ...payload,
          childSessionId: `${identity.sessionPrefix}${randomUUID()}`,
        },
      }
    } else if ((method === 'workspace.insertSessionBefore' || method === 'workspace.archiveSession')
      && payload?.['workspaceId'] !== undefined && payload['workspaceId'] !== this.workspaceId) {
      return withIdentityCookie(new Response('not found', { status: 404 }), identity)
    }

    const response = await next.fetch(message === parsed.data ? request : rewrittenRequest(request, message))
    if (!response.headers.get('content-type')?.startsWith('application/json')) {
      return withIdentityCookie(response, identity)
    }
    let body: unknown
    try {
      body = await response.clone().json()
    } catch {
      return withIdentityCookie(response, identity)
    }
    const filtered = await filterRpcResponse(
      method,
      body,
      this.workspaceId,
      this.workspaceRoot,
      identity,
      this.authorizeSession,
      request.signal,
    )
    const headers = new Headers(response.headers)
    headers.delete('content-length')
    if (identity.setCookie !== undefined) headers.append('set-cookie', identity.setCookie)
    return Response.json(filtered, { status: response.status, headers })
  }

  /** Filter native event streams by the same owner prefix used for unary RPCs. */
  async *stream<F extends MuxFrame | HostFrame>(
    kind: 'mux' | 'host',
    headers: ConnectionApiHeaders,
    source: AsyncIterable<RpcRequest<F>>,
  ): AsyncIterable<RpcRequest<F>> {
    const identity = this.identities.resolve(headers['cookie'])
    for await (const frame of source) {
      const visible = kind === 'host'
        ? await filteredHostFrame(
          frame as RpcRequest<HostFrame>,
          this.workspaceId,
          this.workspaceRoot,
          identity,
          this.authorizeSession,
        )
        : await filteredMuxFrame(frame as RpcRequest<MuxFrame>, identity, this.authorizeSession)
      // `F` is fixed by the caller's stream kind; filtering never changes a frame's discriminant family.
      if (visible !== undefined) yield visible as RpcRequest<F>
    }
  }
}
