/**
 * Zhiwo's thin host overlay for the native `dsh web` composition.
 * @module @deepseek-ai/dsh-zhiwo-product
 */

import { readFile, realpath, stat } from 'node:fs/promises'
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { SessionId, type SessionHeader } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
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
import { installOutputPolicy } from './output-policy.ts'
import { ZhiwoQuestionService, ZhiwoQuestions } from './questions.ts'

function isZhiwoHeader(header: SessionHeader | undefined, workspaceRoot: string): boolean {
  return header?.cwd === workspaceRoot && header.agentPreset === 'zhiwo'
}

async function authorizeSession(
  ctx: Context,
  sessionId: string,
  workspaceRoot: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const live = ctx.sessions.get(SessionId(sessionId))?.header
  if (live !== undefined) return isZhiwoHeader(live, workspaceRoot)
  const persistence = ctx.get('sessionPersistence')
  if (persistence === undefined) return false
  return (await persistence.list(signal)).some(header =>
    header.id === sessionId && isZhiwoHeader(header, workspaceRoot))
}

/** Stable Cordis plugin name. */
export const name = 'zhiwo-product'

/** Services required for the one Workspace and browser access policy. */
export const inject = ['connection', 'llm', 'sessions', 'webServer', 'workspaceRegistry']

/** Zhiwo host configuration. */
export interface Config {
  /** Directory used as every new Zhiwo session's workspace. */
  workspaceRoot?: string
  /** Harness home containing the private identity key; omission follows DSH_HOME. */
  dshHome?: string
  /** Browser visitor lifetime in days. */
  cookieMaxAgeDays?: number
  /** Largest document exposed by the browser preview. */
  documentMaxBytes?: number
}

/** Validated Zhiwo host configuration. */
export const Config: z<Config> = z.object({
  workspaceRoot: z.string().default('userdata'),
  dshHome: z.string(),
  cookieMaxAgeDays: z.natural().min(1).default(180),
  documentMaxBytes: z.natural().min(1).default(2 * 1024 * 1024),
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

function documentRelativePath(path: string | null): string | undefined {
  if (path === null || !path.startsWith('/') || path.includes('\\') || path.includes('\0')) return undefined
  const parts = path.slice(1).split('/')
  if (parts.length === 0 || parts.some(part => part === '' || part === '.' || part === '..')) return undefined
  return parts.join(sep)
}

function containedPath(root: string, candidate: string): boolean {
  const offset = relative(root, candidate)
  return offset !== '' && offset !== '..' && !offset.startsWith(`..${sep}`) && !isAbsolute(offset)
}

function endDocument(
  response: ServerResponse,
  status: number,
  contentType: string,
  body: string | Buffer,
  head: boolean,
): void {
  response.writeHead(status, {
    'content-type': contentType,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  })
  response.end(head ? undefined : body)
}

function endText(response: ServerResponse, status: number, body: string, head = false): void {
  endDocument(response, status, 'text/plain; charset=utf-8', body, head)
}

function startsWith(data: Buffer, prefix: readonly number[]): boolean {
  return data.byteLength >= prefix.length && prefix.every((byte, index) => data[index] === byte)
}

function binaryMediaType(path: string, data: Buffer): string | undefined {
  switch (extname(path).toLowerCase()) {
    case '.pdf':
      return startsWith(data, [0x25, 0x50, 0x44, 0x46, 0x2d]) ? 'application/pdf' : undefined
    case '.png':
      return startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ? 'image/png' : undefined
    case '.jpg':
    case '.jpeg':
      return startsWith(data, [0xff, 0xd8, 0xff]) ? 'image/jpeg' : undefined
    case '.gif':
      return data.subarray(0, 6).toString('ascii') === 'GIF87a'
        || data.subarray(0, 6).toString('ascii') === 'GIF89a'
        ? 'image/gif'
        : undefined
    case '.webp':
      return data.subarray(0, 4).toString('ascii') === 'RIFF'
        && data.subarray(8, 12).toString('ascii') === 'WEBP'
        ? 'image/webp'
        : undefined
    default:
      return ''
  }
}

async function serveDocument(
  request: IncomingMessage,
  response: ServerResponse,
  workspaceRoot: string,
  maxBytes: number,
): Promise<void> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    endText(response, 405, 'method not allowed', request.method === 'HEAD')
    return
  }
  const requested = documentRelativePath(new URL(request.url ?? '/', 'http://zhiwo.invalid').searchParams.get('path'))
  if (requested === undefined) {
    endText(response, 400, 'invalid document path')
    return
  }
  let candidate: string
  try {
    candidate = await realpath(join(workspaceRoot, requested))
    if (!containedPath(workspaceRoot, candidate)) {
      endText(response, 404, 'document not found')
      return
    }
    const info = await stat(candidate)
    if (!info.isFile()) {
      endText(response, 404, 'document not found')
      return
    }
    if (info.size > maxBytes) {
      endText(response, 413, 'document is too large to preview')
      return
    }
  } catch {
    endText(response, 404, 'document not found')
    return
  }
  try {
    const content = await readFile(candidate)
    const binaryType = binaryMediaType(candidate, content)
    if (binaryType === undefined) {
      endText(response, 415, 'document format does not match its extension', request.method === 'HEAD')
      return
    }
    if (binaryType !== '') {
      endDocument(response, 200, binaryType, content, request.method === 'HEAD')
      return
    }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(content)
    endText(response, 200, text, request.method === 'HEAD')
  } catch {
    endText(response, 415, 'document format is not supported', request.method === 'HEAD')
  }
}

/**
 * Register `userdata/` as an ordinary DSH Workspace and scope native browser Sessions by visitor.
 * @param ctx - Host context carrying the native Workspace, Connection, and Web Server services.
 * @param config - Workspace location; relative values resolve from the launch directory.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const workspace = await ctx.workspaceRegistry.create(resolve(config.workspaceRoot ?? 'userdata'))
  const documentRoot = await realpath(workspace.path)
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
  installOutputPolicy(ctx, workspace.path)
  new ZhiwoQuestionService(ctx, questions)
  ctx.effect(() => questions.start(), 'zhiwo-product: background question catalog')
  ctx.effect(
    () => ctx.connection.apiAccess.register(new ZhiwoApiAccess(
      identities,
      workspace.id,
      workspace.path,
      (sessionId, signal) => authorizeSession(ctx, sessionId, workspace.path, signal),
    )),
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
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/zhiwo/document',
    handler: (request, response) => serveDocument(
      request,
      response,
      documentRoot,
      config.documentMaxBytes ?? 2 * 1024 * 1024,
    ),
  }), 'zhiwo-product: bounded document preview')
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
