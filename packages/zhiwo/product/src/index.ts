/**
 * Zhiwo's thin host overlay for the native `dsh web` composition.
 * @module @deepseek-ai/dsh-zhiwo-product
 */

import { resolve } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-workspace'
import {
  ZHIWO_FAVICON_DATA_URL,
  ZHIWO_FAVICON_SVG,
  ZHIWO_PRODUCT_TITLE,
  ZHIWO_WEB_MANIFEST,
} from './branding.ts'
import { ZhiwoApiAccess } from './api-access.ts'
import { VisitorIdentities } from './identity.ts'
import { loadIdentitySecret } from './identity-secret.ts'
import { ZhiwoQuestionService, ZhiwoQuestions } from './questions.ts'

/** Stable Cordis plugin name. */
export const name = 'zhiwo-product'

/** Services required for the one Workspace and browser access policy. */
export const inject = ['connection', 'sessions', 'webServer', 'workspaceRegistry']

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

function serveBrandAsset(
  request: IncomingMessage,
  response: ServerResponse,
  contentType: string,
  body: string,
): void {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405)
    response.end()
    return
  }
  response.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-cache' })
  response.end(request.method === 'HEAD' ? undefined : body)
}

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
  const questions = new ZhiwoQuestions(
    workspace.path,
    ctx.sessions,
    (message) => { ctx.logger.warn(message) },
    config.dshHome,
  )
  new ZhiwoQuestionService(ctx, questions)
  ctx.effect(() => questions.start(), 'zhiwo-product: background question catalog')
  ctx.effect(
    () => ctx.connection.apiAccess.register(new ZhiwoApiAccess(identities, workspace.id, workspace.path)),
    'zhiwo-product: visitor API access',
  )
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/manifest.webmanifest',
    handler: (request, response) => {
      serveBrandAsset(request, response, 'application/manifest+json', ZHIWO_WEB_MANIFEST)
    },
  }), 'zhiwo-product: install manifest')
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/favicon.svg',
    handler: (request, response) => {
      serveBrandAsset(request, response, 'image/svg+xml', ZHIWO_FAVICON_SVG)
    },
  }), 'zhiwo-product: favicon asset')
  ctx.effect(() => ctx.webServer.tapIndex((html) => {
    const branded = html
      .replace(/<title>[^<]*<\/title>/u, `<title>${ZHIWO_PRODUCT_TITLE}</title>`)
      .replace(/<link\s+rel="icon"[^>]*>/u, `<link rel="icon" type="image/svg+xml" href="${ZHIWO_FAVICON_DATA_URL}" />`)
    const head = '<head>'
    const offset = branded.indexOf(head)
    if (offset < 0) throw new Error('zhiwo browser identity bootstrap requires an index.html <head>')
    return `${branded.slice(0, offset + head.length)}${identities.bootstrapScript()}${branded.slice(offset + head.length)}`
  }), 'zhiwo-product: browser identity bootstrap')
}
