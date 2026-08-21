/**
 * Zhiwo's thin host overlay for the native `dsh web` composition.
 * @module @deepseek-ai/dsh-zhiwo-product
 */

import { resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-workspace'
import { ZhiwoApiAccess } from './api-access.ts'
import { VisitorIdentities } from './identity.ts'
import { loadIdentitySecret } from './identity-secret.ts'

/** Stable Cordis plugin name. */
export const name = 'zhiwo-product'

/** Services required for the one Workspace and browser access policy. */
export const inject = ['connection', 'webServer', 'workspaceRegistry']

/** Zhiwo host configuration. */
export interface Config {
  /** Directory used as every new Zhiwo session's workspace. */
  workspaceRoot?: string
  /** Harness home containing the private identity key; omission follows DSH_HOME. */
  dshHome?: string
  /** Browser visitor lifetime in days. */
  cookieMaxAgeDays?: number
}

/** Validated Zhiwo host configuration. */
export const Config: z<Config> = z.object({
  workspaceRoot: z.string().default('userdata'),
  dshHome: z.string(),
  cookieMaxAgeDays: z.natural().min(1).default(180),
})

/**
 * Register `userdata/` as an ordinary DSH Workspace and scope native browser Sessions by visitor.
 * @param ctx - Host context carrying the native Workspace, Connection, and Web Server services.
 * @param config - Workspace location; relative values resolve from the launch directory.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const workspace = await ctx.workspaceRegistry.create(resolve(config.workspaceRoot ?? 'userdata'))
  const identities = new VisitorIdentities(
    await loadIdentitySecret(config.dshHome),
    (config.cookieMaxAgeDays ?? 180) * 24 * 60 * 60,
  )
  ctx.connection.apiAccess.register(new ZhiwoApiAccess(identities, workspace.id, workspace.path))
  ctx.effect(() => ctx.webServer.tapIndex((html) => {
    const head = '<head>'
    const offset = html.indexOf(head)
    if (offset < 0) throw new Error('zhiwo browser identity bootstrap requires an index.html <head>')
    return `${html.slice(0, offset + head.length)}${identities.bootstrapScript()}${html.slice(offset + head.length)}`
  }), 'zhiwo-product: browser identity bootstrap')
}
