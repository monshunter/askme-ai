import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import type { ConnectionApiAccess, HostConnectionHandle } from '@deepseek-ai/dsh-client-connection'
import type { WebRoute, WebServer } from '@deepseek-ai/dsh-host-webserver'
import { SessionStore } from '@deepseek-ai/dsh-session'
import * as ZhiwoProduct from '../src/index.ts'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

class WorkspaceRegistryFixture extends Service {
  readonly created: Array<{ path: string; title: string | undefined }> = []

  constructor(ctx: Context) {
    super(ctx, 'workspaceRegistry')
  }

  async create(path: string, title?: string): Promise<object> {
    this.created.push({ path, title })
    return { id: 'workspace-userdata', path }
  }
}

class ConnectionFixture extends Service {
  access: ConnectionApiAccess | undefined

  constructor(ctx: Context) {
    super(ctx, 'connection')
  }

  readonly apiAccess: HostConnectionHandle['apiAccess'] = {
    register: (access) => {
      this.access = access
      return async () => { this.access = undefined }
    },
  }

  readonly rpc: HostConnectionHandle['rpc'] = {
    handle: () => async () => undefined,
    intercept: () => async () => undefined,
  }
}

async function requestRoute(route: WebRoute): Promise<{ status: number; contentType: string | null; body: string }> {
  const server = createServer((request, response) => { void route.handler(request, response) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  try {
    const response = await fetch(`http://127.0.0.1:${String(address.port)}${route.path}`)
    return {
      status: response.status,
      contentType: response.headers.get('content-type'),
      body: await response.text(),
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error === undefined) resolve()
        else reject(error)
      })
    })
  }
}

describe('Zhiwo native web overlay', () => {
  it('registers userdata as one ordinary native Workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zhiwo-workspace-'))
    temporaryRoots.push(root)
    const ctx = new Context()
    const indexes: Array<(html: string) => string> = []
    const routes: WebRoute[] = []
    ctx.provide('webServer', {
      register(route) {
        routes.push(route)
        return () => { routes.splice(routes.indexOf(route), 1) }
      },
      tapIndex(transform) {
        indexes.push(transform)
        return () => { indexes.splice(indexes.indexOf(transform), 1) }
      },
    } as WebServer)
    await ctx.plugin(ConnectionFixture).await()
    await ctx.plugin(SessionStore).await()
    await ctx.plugin(WorkspaceRegistryFixture).await()
    await ctx.plugin(ZhiwoProduct, { workspaceRoot: root, dshHome: join(root, '.dsh') }).await()

    const registry = ctx.get('workspaceRegistry') as unknown as WorkspaceRegistryFixture
    expect(registry.created).toEqual([{ path: root, title: undefined }])
    expect((ctx.get('connection') as unknown as ConnectionFixture).access).toBeDefined()
    expect(indexes).toHaveLength(1)
    const html = indexes[0]!('<html><head><link rel="icon" type="image/svg+xml" href="/favicon.svg" /><title>DSH Local Build</title></head></html>')
    expect(html).toContain('zhiwo_guest=v0.')
    expect(html).toContain('<title>知我AI</title>')
    expect(html).toContain('data:image/svg+xml')
    expect(html).not.toContain('DSH Local Build')
    expect(html).not.toContain('/favicon.svg')

    expect(routes.map(route => route.path).toSorted()).toEqual(['/favicon.svg', '/manifest.webmanifest'])
    const manifest = await requestRoute(routes.find(route => route.path === '/manifest.webmanifest')!)
    expect(manifest).toMatchObject({ status: 200, contentType: 'application/manifest+json' })
    expect(JSON.parse(manifest.body)).toMatchObject({
      name: '知我AI',
      short_name: '知我AI',
      icons: [{ src: '/favicon.svg', type: 'image/svg+xml' }],
    })
    expect(manifest.body).not.toMatch(/DeepSeek Harness|DSH/u)
    const favicon = await requestRoute(routes.find(route => route.path === '/favicon.svg')!)
    expect(favicon).toMatchObject({ status: 200, contentType: 'image/svg+xml' })
    expect(favicon.body).toContain('>知</text>')
  })
})
