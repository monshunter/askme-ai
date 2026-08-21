import { describe, expect, it, vi } from 'vitest'
import type { HostFrame, MuxFrame, RpcRequest } from '@deepseek-ai/dsh-host-apiproxy/api'
import { VisitorIdentities } from '../src/identity.ts'
import { ZhiwoApiAccess } from '../src/api-access.ts'

const WORKSPACE_ID = 'workspace-userdata'
const WORKSPACE_ROOT = '/srv/zhiwo/userdata'
const SUBJECT_A = 'AAAAAAAAAAAAAAAAAAAAAA'
const SUBJECT_B = 'BBBBBBBBBBBBBBBBBBBBBB'

function cookie(subject: string): string {
  return `zhiwo_guest=v0.${subject}`
}

function call(method: string, payload: unknown, subject = SUBJECT_A): Request {
  return new Request(`http://dsh.internal/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: cookie(subject) },
    body: JSON.stringify({ type: 'client-request', rpcId: 'rpc-1', method, payload }),
  })
}

function response(value: unknown): Response {
  return Response.json({
    type: 'server-response',
    rpcId: 'rpc-1',
    result: { ok: true, value },
  })
}

function access(): { policy: ZhiwoApiAccess; identities: VisitorIdentities } {
  const identities = new VisitorIdentities(Buffer.alloc(32, 7), 3600)
  return {
    identities,
    policy: new ZhiwoApiAccess(identities, WORKSPACE_ID, WORKSPACE_ROOT),
  }
}

describe('Zhiwo native API ownership', () => {
  it('assigns native Session ids to the visitor and forces the userdata Workspace', async () => {
    const { policy, identities } = access()
    let forwarded: unknown
    const result = await policy.fetch(call('session.create', {
      cwd: '/escape',
      agentPreset: 'developer',
    }), {
      async fetch(request) {
        const envelope = await request.json() as { payload: { sessionId: string } }
        forwarded = envelope
        return response({ sessionId: envelope.payload.sessionId, agentPreset: 'zhiwo' })
      },
    })

    const prefix = identities.resolve(cookie(SUBJECT_A)).sessionPrefix
    const forwardedPayload = (forwarded as {
      payload: { sessionId: string; workspaceId: string }
    }).payload
    expect(forwardedPayload.sessionId).toMatch(new RegExp(`^${prefix}`))
    expect(forwardedPayload.workspaceId).toBe(WORKSPACE_ID)
    expect(result.headers.get('set-cookie')).toMatch(/HttpOnly; SameSite=Strict/)
    const resultBody = await result.json() as {
      result: { ok: boolean; value: { sessionId: string } }
    }
    expect(resultBody.result.ok).toBe(true)
    expect(resultBody.result.value.sessionId).toMatch(new RegExp(`^${prefix}`))
  })

  it('filters Session and Workspace baselines to one browser visitor', async () => {
    const { policy, identities } = access()
    const a = `${identities.resolve(cookie(SUBJECT_A)).sessionPrefix}a`
    const b = `${identities.resolve(cookie(SUBJECT_B)).sessionPrefix}b`
    const sessions = await policy.fetch(call('session.list', {}), {
      fetch: () => Promise.resolve(response({
        items: [
          { sessionId: a, updatedAt: 1, running: false, blank: false },
          { sessionId: b, updatedAt: 2, running: false, blank: false },
        ],
      })),
    })
    expect((await sessions.json() as { result: { value: { items: Array<{ sessionId: string }> } } })
      .result.value.items.map(item => item.sessionId)).toEqual([a])

    const workspaces = await policy.fetch(call('workspace.list', {}), {
      fetch: () => Promise.resolve(response({
        items: [
          {
            workspaceId: WORKSPACE_ID,
            path: WORKSPACE_ROOT,
            title: 'userdata',
            sessionIds: [a, b],
            createdAt: '2026-08-21T00:00:00.000Z',
            updatedAt: '2026-08-21T00:00:00.000Z',
          },
          {
            workspaceId: 'other',
            path: '/other',
            title: 'other',
            sessionIds: [a],
            createdAt: '2026-08-21T00:00:00.000Z',
            updatedAt: '2026-08-21T00:00:00.000Z',
          },
        ],
        archivedSessionIds: [a, b],
      })),
    })
    expect((await workspaces.json() as { result: { value: unknown } }).result.value).toMatchObject({
      items: [{ workspaceId: WORKSPACE_ID, sessionIds: [a] }],
      archivedSessionIds: [a],
    })
  })

  it('denies another visitor before any native Session operation runs', async () => {
    const { policy, identities } = access()
    const a = `${identities.resolve(cookie(SUBJECT_A)).sessionPrefix}private`
    const native = vi.fn(() => Promise.resolve(response({ events: [], hasMore: false })))
    const denied = await policy.fetch(call('session.history', { sessionId: a }, SUBJECT_B), { fetch: native })

    expect(denied.status).toBe(404)
    expect(native).not.toHaveBeenCalled()
  })

  it('preallocates an owned fork child without changing the native fork lifecycle', async () => {
    const { policy, identities } = access()
    const prefix = identities.resolve(cookie(SUBJECT_A)).sessionPrefix
    let childSessionId: string | undefined
    const result = await policy.fetch(call('session.fork', { sessionId: `${prefix}parent`, atSeq: 4 }), {
      async fetch(request) {
        const envelope = await request.json() as { payload: { childSessionId: string } }
        childSessionId = envelope.payload.childSessionId
        return response({ sessionId: childSessionId })
      },
    })

    expect(childSessionId).toMatch(new RegExp(`^${prefix}`))
    expect((await result.json() as { result: { value: { sessionId: string } } }).result.value.sessionId)
      .toBe(childSessionId)
  })

  it('filters both native event streams before frames reach a browser', async () => {
    const { policy, identities } = access()
    const a = `${identities.resolve(cookie(SUBJECT_A)).sessionPrefix}a`
    const b = `${identities.resolve(cookie(SUBJECT_B)).sessionPrefix}b`
    async function* muxFrames(): AsyncIterable<RpcRequest<MuxFrame>> {
      yield { rpcId: '1' as never, payload: { type: 'session/subscribed', sessionId: a as never, lastSeq: 0 } }
      yield { rpcId: '2' as never, payload: { type: 'session/subscribed', sessionId: b as never, lastSeq: 0 } }
    }
    const mux: string[] = []
    for await (const frame of policy.stream('mux', { cookie: cookie(SUBJECT_A) }, muxFrames())) {
      if (frame.payload.type !== 'stream/error') mux.push(frame.payload.sessionId)
    }
    expect(mux).toEqual([a])

    const workspace = {
      workspaceId: WORKSPACE_ID as never,
      path: WORKSPACE_ROOT,
      title: 'userdata',
      sessionIds: [a, b] as never,
      createdAt: '2026-08-21T00:00:00.000Z',
      updatedAt: '2026-08-21T00:00:00.000Z',
    }
    async function* hostFrames(): AsyncIterable<RpcRequest<HostFrame>> {
      yield { rpcId: '3' as never, payload: { type: 'host/workspace-changed', workspace } }
      yield { rpcId: '4' as never, payload: { type: 'host/session-added', sessionId: b as never, blank: true } }
      yield { rpcId: '5' as never, payload: { type: 'host/remote-event', event: 'settings/document-updated', args: [] } }
    }
    const host: HostFrame[] = []
    for await (const frame of policy.stream('host', { cookie: cookie(SUBJECT_A) }, hostFrames())) host.push(frame.payload)
    expect(host).toEqual([{ type: 'host/workspace-changed', workspace: { ...workspace, sessionIds: [a] } }])
  })

  it('hides the generic configuration and host-filesystem API', async () => {
    const { policy } = access()
    const native = vi.fn(() => Promise.resolve(response({})))
    for (const method of ['settings.describe', 'credentials.describe', 'host.listDirectory', 'workspace.create']) {
      expect((await policy.fetch(call(method, {}), { fetch: native })).status).toBe(404)
    }
    expect(native).not.toHaveBeenCalled()
  })
})

describe('Zhiwo visitor cookies', () => {
  it('upgrades the script bootstrap to a signed HttpOnly identity', () => {
    const identities = new VisitorIdentities(Buffer.alloc(32, 9), 3600)
    const first = identities.resolve(cookie(SUBJECT_A))
    const sealed = first.setCookie?.split(';', 1)[0]
    expect(sealed).toMatch(/^zhiwo_guest=v1\./)
    const stable = identities.resolve(sealed)
    expect(stable.sessionPrefix).toBe(first.sessionPrefix)
    expect(stable.setCookie).toBeUndefined()

    const tampered = identities.resolve(`${sealed?.slice(0, -1)}x`)
    expect(tampered.sessionPrefix).not.toBe(first.sessionPrefix)
    expect(tampered.setCookie).toBeDefined()
    expect(identities.bootstrapScript()).toContain('crypto.getRandomValues')
  })
})
