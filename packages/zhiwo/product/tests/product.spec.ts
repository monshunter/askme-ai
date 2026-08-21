import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import type { ConnectionApiAccess, HostConnectionHandle } from '@deepseek-ai/dsh-client-connection'
import type { WebServer } from '@deepseek-ai/dsh-host-webserver'
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

  readonly rpc = {} as HostConnectionHandle['rpc']
}

describe('Zhiwo native web overlay', () => {
  it('registers userdata as one ordinary native Workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zhiwo-workspace-'))
    temporaryRoots.push(root)
    const ctx = new Context()
    const indexes: Array<(html: string) => string> = []
    ctx.provide('webServer', {
      tapIndex(transform) {
        indexes.push(transform)
        return () => { indexes.splice(indexes.indexOf(transform), 1) }
      },
    } as WebServer)
    await ctx.plugin(ConnectionFixture).await()
    await ctx.plugin(WorkspaceRegistryFixture).await()
    await ctx.plugin(ZhiwoProduct, { workspaceRoot: root, dshHome: join(root, '.dsh') }).await()

    const registry = ctx.get('workspaceRegistry') as unknown as WorkspaceRegistryFixture
    expect(registry.created).toEqual([{ path: root, title: undefined }])
    expect((ctx.get('connection') as unknown as ConnectionFixture).access).toBeDefined()
    expect(indexes).toHaveLength(1)
    expect(indexes[0]!('<html><head></head></html>')).toContain('zhiwo_guest=v0.')
  })
})
