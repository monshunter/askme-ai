/** Narrow HTTP and static-file surface for the Zhiwo Public Runtime. */

import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { readFile, readdir, stat } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { extname, resolve, sep } from 'node:path'
import { assertWriteRequest, resolveGuestIdentity } from './identity.ts'
import { ZhiwoKernel } from './kernel.ts'
import type { ProductStreamEvent } from './kernel.ts'
import { ZHIWO_TEXT_TOOL_NAMES } from './tools.ts'
import type { ZhiwoRuntimeConfig } from './types.ts'
import { ZhiwoTelemetry } from './telemetry.ts'

const JSON_LIMIT = 64 * 1024
const RATE_WINDOW_MS = 60_000

/** Exact API templates allowed by the Public Runtime. */
export const ZHIWO_ROUTE_TEMPLATES = [
  'GET /health/live',
  'GET /health/ready',
  'GET /api/bootstrap',
  'GET /api/sessions',
  'DELETE /api/sessions',
  'POST /api/chat',
  'GET /api/sessions/:sessionId/messages',
  'POST /api/sessions/:sessionId/cancel',
  'DELETE /api/sessions/:sessionId',
  'GET /api/sessions/:sessionId/sources/:sourceId',
  'GET /api/sessions/:sessionId/sources/:sourceId/content',
  'GET /api/sessions/:sessionId/sources/:sourceId/download',
] as const

interface RateBucket {
  startedAt: number
  count: number
}

function securityHeaders(response: ServerResponse, https: boolean): void {
  response.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'")
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'DENY')
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  response.setHeader('Cache-Control', 'no-store')
  if (https) response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(`${JSON.stringify(value)}\n`)
}

function publicError(error: unknown): { status: number; code: string; message: string } {
  const code = error instanceof Error ? error.message : 'ZHIWO_INTERNAL_ERROR'
  switch (code) {
    case 'ZHIWO_SESSION_NOT_FOUND':
    case 'ZHIWO_SOURCE_NOT_FOUND':
      return { status: 404, code, message: '请求的内容不存在。' }
    case 'ZHIWO_SOURCE_NOT_AVAILABLE':
      return { status: 403, code, message: '该来源不允许打开或下载。' }
    case 'ZHIWO_CSRF_REJECTED':
    case 'ZHIWO_ORIGIN_REJECTED':
      return { status: 403, code, message: '请求校验失败，请刷新页面后重试。' }
    case 'ZHIWO_PROMPT_INVALID':
      return { status: 400, code, message: '问题为空或超过长度限制。' }
    case 'ZHIWO_SESSION_BUSY':
      return { status: 409, code, message: '这个对话正在回答中。' }
    case 'ZHIWO_SESSION_LIMIT':
    case 'ZHIWO_TURN_LIMIT':
    case 'ZHIWO_GENERATION_LIMIT':
      return { status: 429, code, message: '已达到当前访客的数据上限。' }
    case 'ZHIWO_RATE_LIMIT':
      return { status: 429, code, message: '请求过于频繁，请稍后重试。' }
    case 'ZHIWO_BODY_INVALID':
      return { status: 400, code, message: '请求内容无效。' }
    default:
      return { status: 500, code: 'ZHIWO_INTERNAL_ERROR', message: '服务暂时不可用。' }
  }
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Uint8Array[] = []
  let bytes = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.byteLength
    if (bytes > JSON_LIMIT) throw new Error('ZHIWO_BODY_INVALID')
    chunks.push(buffer)
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
    return parsed as Record<string, unknown>
  } catch {
    throw new Error('ZHIWO_BODY_INVALID')
  }
}

function routeSegments(pathname: string): string[] {
  try {
    return pathname.split('/').filter(Boolean).map(segment => decodeURIComponent(segment))
  } catch {
    throw new Error('ZHIWO_BODY_INVALID')
  }
}

function assertOpaqueId(value: string, prefix: 'ses_' | 'src_'): void {
  if (!value.startsWith(prefix) || value.length > 100 || !/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error(prefix === 'ses_' ? 'ZHIWO_SESSION_NOT_FOUND' : 'ZHIWO_SOURCE_NOT_FOUND')
  }
}

function filenameHeader(filename: string): string {
  const fallback = filename.replace(/[^A-Za-z0-9._-]/gu, '_').slice(0, 100) || 'source'
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

function mimeType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.css': return 'text/css; charset=utf-8'
    case '.html': return 'text/html; charset=utf-8'
    case '.js': return 'text/javascript; charset=utf-8'
    case '.json': return 'application/json; charset=utf-8'
    case '.svg': return 'image/svg+xml'
    case '.png': return 'image/png'
    case '.webp': return 'image/webp'
    case '.woff2': return 'font/woff2'
    default: return 'application/octet-stream'
  }
}

/**
 * Verify the product-only browser surface, release manifest, SBOM, and checksums.
 * @param distRoot - built release directory.
 * @param expected - fixed binary identity supplied by the product entrypoint.
 */
export async function auditZhiwoRelease(
  distRoot: string,
  expected?: { version: string; upstreamBase: string },
): Promise<void> {
  const manifest = JSON.parse(await readFile(resolve(distRoot, 'build-manifest.json'), 'utf8')) as {
    product?: unknown
    version?: unknown
    upstreamBase?: unknown
    toolCatalog?: unknown
    publicRoutes?: unknown
    artifacts?: unknown
    sbomSha256?: unknown
  }
  if (manifest.product !== 'zhiwo'
    || typeof manifest.version !== 'string'
    || !/^[0-9]+\.[0-9]+\.[0-9]+$/u.test(manifest.version)
    || typeof manifest.upstreamBase !== 'string'
    || !/^[0-9a-f]{40}$/u.test(manifest.upstreamBase)
    || (expected !== undefined && (
      manifest.version !== expected.version || manifest.upstreamBase !== expected.upstreamBase
    ))
    || JSON.stringify(manifest.toolCatalog) !== JSON.stringify(ZHIWO_TEXT_TOOL_NAMES)
    || JSON.stringify(manifest.publicRoutes) !== JSON.stringify(ZHIWO_ROUTE_TEMPLATES)
    || manifest.artifacts === null
    || typeof manifest.artifacts !== 'object'
    || Array.isArray(manifest.artifacts)
    || typeof manifest.sbomSha256 !== 'string'
    || !/^[0-9a-f]{64}$/u.test(manifest.sbomSha256)) {
    throw new Error('Zhiwo build manifest does not match the fixed runtime')
  }
  const sbom = await readFile(resolve(distRoot, 'sbom.spdx.json'))
  if (createHash('sha256').update(sbom).digest('hex') !== manifest.sbomSha256) {
    throw new Error('Zhiwo SBOM checksum mismatch')
  }
  const checksumLines = (await readFile(resolve(distRoot, 'SHA256SUMS'), 'utf8')).trim().split('\n')
  const releaseChecksums = new Map<string, string>()
  for (const line of checksumLines) {
    const match = /^([0-9a-f]{64})  ([A-Za-z0-9_./-]+)$/u.exec(line)
    if (match === null) throw new Error('Zhiwo SHA256SUMS is invalid')
    const checksum = match[1]
    const file = match[2]
    if (checksum === undefined || file === undefined || file.includes('..') || releaseChecksums.has(file)) {
      throw new Error('Zhiwo SHA256SUMS is invalid')
    }
    releaseChecksums.set(file, checksum)
  }
  const expectedReleaseFiles = new Set([
    ...Object.keys(manifest.artifacts as Record<string, unknown>),
    'build-manifest.json',
    'sbom.spdx.json',
  ])
  if (releaseChecksums.size !== expectedReleaseFiles.size
    || [...releaseChecksums.keys()].some(file => !expectedReleaseFiles.has(file))) {
    throw new Error('Zhiwo SHA256SUMS file set does not match the release manifest')
  }
  for (const [file, checksum] of releaseChecksums) {
    const actual = createHash('sha256').update(await readFile(resolve(distRoot, file))).digest('hex')
    if (actual !== checksum) throw new Error(`Zhiwo release checksum mismatch: ${file}`)
  }
  for (const [artifact, expected] of Object.entries(manifest.artifacts as Record<string, unknown>)) {
    if (typeof expected !== 'string' || !/^[0-9a-f]{64}$/u.test(expected)) {
      throw new Error('Zhiwo build manifest contains an invalid checksum')
    }
    const path = resolve(distRoot, artifact)
    if (path !== resolve(distRoot) && !path.startsWith(`${resolve(distRoot)}${sep}`)) {
      throw new Error('Zhiwo build manifest artifact escapes the client root')
    }
    const actual = createHash('sha256').update(await readFile(path)).digest('hex')
    if (actual !== expected) throw new Error(`Zhiwo client artifact checksum mismatch: ${artifact}`)
  }
  const scripts = (await readdir(resolve(distRoot, 'assets'))).filter(file => file.endsWith('.js'))
  const scriptText = (await Promise.all(scripts.map(file => readFile(resolve(distRoot, 'assets', file), 'utf8')))).join('\n')
  const forbidden = [
    '/api/tools', '/api/plugins', '/api/terminal', '/api/workspaces', 'run_code', 'pwsh', 'subagent',
    '/Users/', 'C:\\Users\\', 'workspace:', 'sourceMappingURL=',
  ]
  const present = forbidden.filter(value => scriptText.includes(value))
  if (present.length > 0) throw new Error(`Zhiwo client audit found coding surface: ${present.join(', ')}`)
}

async function serveStatic(response: ServerResponse, distRoot: string, pathname: string): Promise<void> {
  const root = resolve(distRoot)
  if (pathname !== '/' && pathname !== '/index.html' && !pathname.startsWith('/assets/')) {
    json(response, 404, { error: { code: 'ZHIWO_NOT_FOUND', message: '页面不存在。' } })
    return
  }
  const requested = pathname === '/' ? 'index.html' : pathname.slice(1)
  const path = resolve(root, requested)
  if (path !== root && !path.startsWith(`${root}${sep}`)) {
    json(response, 404, { error: { code: 'ZHIWO_NOT_FOUND', message: '页面不存在。' } })
    return
  }
  try {
    if (!(await stat(path)).isFile()) throw new Error()
  } catch {
    json(response, 404, { error: { code: 'ZHIWO_NOT_FOUND', message: '页面不存在。' } })
    return
  }
  const body = await readFile(path)
  response.statusCode = 200
  response.setHeader('Content-Type', mimeType(path))
  response.setHeader('Cache-Control', path.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable')
  response.end(body)
}

/** Running server and its composed product kernel. */
export interface ZhiwoServerHandle {
  server: Server
  metricsServer: Server
  kernel: ZhiwoKernel
  origin: URL
  metricsOrigin: URL
  close(): Promise<void>
}

function normalizedRoute(method: string, pathname: string): string {
  if (pathname === '/' || pathname === '/index.html') return `${method} /`
  if (pathname.startsWith('/assets/')) return `${method} /assets/:artifact`
  if (pathname === '/health/live' || pathname === '/health/ready'
    || pathname === '/api/bootstrap' || pathname === '/api/sessions' || pathname === '/api/chat') {
    return `${method} ${pathname}`
  }
  if (/^\/api\/sessions\/[^/]+\/messages$/u.test(pathname)) return `${method} /api/sessions/:sessionId/messages`
  if (/^\/api\/sessions\/[^/]+\/cancel$/u.test(pathname)) return `${method} /api/sessions/:sessionId/cancel`
  if (/^\/api\/sessions\/[^/]+$/u.test(pathname)) return `${method} /api/sessions/:sessionId`
  if (/^\/api\/sessions\/[^/]+\/sources\/[^/]+\/content$/u.test(pathname)) {
    return `${method} /api/sessions/:sessionId/sources/:sourceId/content`
  }
  if (/^\/api\/sessions\/[^/]+\/sources\/[^/]+\/download$/u.test(pathname)) {
    return `${method} /api/sessions/:sessionId/sources/:sourceId/download`
  }
  if (/^\/api\/sessions\/[^/]+\/sources\/[^/]+$/u.test(pathname)) {
    return `${method} /api/sessions/:sessionId/sources/:sourceId`
  }
  return `${method} unknown`
}

async function listen(server: Server, port: number, host: string): Promise<number> {
  await new Promise<void>((resolveListening, rejectListening) => {
    server.once('error', rejectListening)
    server.listen(port, host, () => {
      server.off('error', rejectListening)
      resolveListening()
    })
  })
  const address = server.address()
  return typeof address === 'object' && address !== null ? address.port : port
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error === undefined) resolveClose()
      else rejectClose(error)
    })
    server.closeIdleConnections()
  })
}

/**
 * Start the fixed Public Runtime route surface.
 * @param config - trusted runtime configuration.
 * @param databasePath - unified product SQLite path.
 * @param distRoot - built product-only web client root.
 * @param releaseIdentity - expected product version and official upstream baseline.
 * @returns listening server handle.
 */
export async function startZhiwoServer(
  config: ZhiwoRuntimeConfig,
  databasePath: string,
  distRoot: string,
  releaseIdentity?: { version: string; upstreamBase: string },
): Promise<ZhiwoServerHandle> {
  if (new Set(ZHIWO_ROUTE_TEMPLATES).size !== ZHIWO_ROUTE_TEMPLATES.length) {
    throw new Error('Zhiwo route audit found duplicate route templates')
  }
  await auditZhiwoRelease(distRoot, releaseIdentity)
  const kernel = await ZhiwoKernel.create(config, databasePath)
  const telemetry = new ZhiwoTelemetry(config.logLevel)
  const guestBuckets = new Map<string, RateBucket>()
  const ipBuckets = new Map<string, RateBucket>()
  const activeByIp = new Map<string, number>()
  let expectedPublicOrigin = config.publicOrigin
  const server = createServer((request, response) => {
    let errorCode: string | undefined
    void (async () => {
      securityHeaders(response, config.publicOrigin.protocol === 'https:')
      const requestId = randomUUID()
      const startedAt = performance.now()
      const method = request.method ?? 'GET'
      const url = new URL(request.url ?? '/', config.publicOrigin)
      const route = normalizedRoute(method, url.pathname)
      response.setHeader('X-Request-Id', requestId)
      response.once('finish', () => {
        telemetry.request({
          requestId,
          route,
          status: response.statusCode,
          latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
          ...errorCode === undefined ? {} : { errorCode },
        })
      })
      if (method === 'GET' && url.pathname === '/health/live') {
        json(response, 200, { status: 'live' })
        return
      }
      if (method === 'GET' && url.pathname === '/health/ready') {
        await kernel.bootstrap()
        json(response, 200, { status: 'ready' })
        return
      }
      if (!url.pathname.startsWith('/api/')) {
        if (method !== 'GET' && method !== 'HEAD') {
          json(response, 405, { error: { code: 'ZHIWO_METHOD_NOT_ALLOWED', message: '请求方法不受支持。' } })
          return
        }
        await serveStatic(response, distRoot, url.pathname)
        return
      }

      const identity = resolveGuestIdentity(
        request.headers.cookie,
        config.cookieName,
        config.cookieSecret,
        config.cookieMaxAgeDays,
        true,
        config.cookiePreviousSecret,
      )
      if (identity.setCookie !== undefined) response.setHeader('Set-Cookie', identity.setCookie)
      kernel.database.touchGuest(identity.guestId)
      const address = request.socket.remoteAddress ?? 'unknown'
      const now = Date.now()
      if (guestBuckets.size + ipBuckets.size > 10_000) {
        for (const buckets of [guestBuckets, ipBuckets]) {
          for (const [key, bucket] of buckets) {
            if (now - bucket.startedAt >= RATE_WINDOW_MS) buckets.delete(key)
          }
        }
      }
      const takeRate = (buckets: Map<string, RateBucket>, key: string, limit: number, scope: string): void => {
        let bucket = buckets.get(key)
        if (bucket === undefined || now - bucket.startedAt >= RATE_WINDOW_MS) {
          bucket = { startedAt: now, count: 0 }
          buckets.set(key, bucket)
        }
        bucket.count += 1
        if (bucket.count > limit) {
          telemetry.increment('zhiwo_rate_limit_total', { scope })
          throw new Error('ZHIWO_RATE_LIMIT')
        }
      }
      takeRate(guestBuckets, identity.guestId, config.maxRequestsPerGuestMinute, 'guest')
      takeRate(ipBuckets, address, config.maxRequestsPerIpMinute, 'ip')
      assertWriteRequest(method, {
        ...typeof request.headers.origin === 'string' ? { origin: request.headers.origin } : {},
        ...typeof request.headers.referer === 'string' ? { referer: request.headers.referer } : {},
        ...typeof request.headers['x-zhiwo-csrf'] === 'string'
          ? { csrfToken: request.headers['x-zhiwo-csrf'] }
          : {},
      }, expectedPublicOrigin, identity.csrfToken)

      const segments = routeSegments(url.pathname)
      if (method === 'GET' && url.pathname === '/api/bootstrap') {
        json(response, 200, { ...(await kernel.bootstrap()), csrfToken: identity.csrfToken })
        return
      }
      if (url.pathname === '/api/sessions' && method === 'GET') {
        json(response, 200, { sessions: kernel.database.listSessions(identity.guestId) })
        return
      }
      if (url.pathname === '/api/sessions' && method === 'DELETE') {
        json(response, 200, { deleted: await kernel.deleteAllSessions(identity.guestId) })
        return
      }
      if (url.pathname === '/api/chat' && method === 'POST') {
        const body = await readJson(request)
        if (typeof body.prompt !== 'string'
          || (body.sessionId !== undefined && typeof body.sessionId !== 'string')
          || Object.keys(body).some(key => key !== 'prompt' && key !== 'sessionId')) {
          throw new Error('ZHIWO_BODY_INVALID')
        }
        if (typeof body.sessionId === 'string') assertOpaqueId(body.sessionId, 'ses_')
        if ((activeByIp.get(address) ?? 0) >= config.maxConcurrentPerIp) {
          telemetry.increment('zhiwo_rate_limit_total', { scope: 'ip_concurrency' })
          throw new Error('ZHIWO_GENERATION_LIMIT')
        }
        activeByIp.set(address, (activeByIp.get(address) ?? 0) + 1)
        telemetry.generationStarted()
        const stream = { started: false }
        let activeSessionId: string | undefined
        const emit = (event: ProductStreamEvent): void => {
          if (!stream.started) {
            stream.started = true
            response.statusCode = 200
            response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
            response.setHeader('X-Accel-Buffering', 'no')
            response.flushHeaders()
          }
          if (event.type === 'start') activeSessionId = event.sessionId
          if (!response.destroyed) response.write(`${JSON.stringify(event)}\n`)
        }
        response.once('close', () => {
          if (!response.writableEnded && activeSessionId !== undefined) {
            kernel.cancel(identity.guestId, activeSessionId)
          }
        })
        try {
          await kernel.prompt(identity.guestId, body.prompt, body.sessionId, emit)
        } catch (error) {
          if (!stream.started) throw error
          // Once streaming starts, the kernel emits the only product-safe error before rejecting.
        } finally {
          const remaining = (activeByIp.get(address) ?? 1) - 1
          if (remaining <= 0) activeByIp.delete(address)
          else activeByIp.set(address, remaining)
          telemetry.generationFinished()
        }
        if (stream.started) response.end()
        return
      }
      if (segments.length >= 3 && segments[0] === 'api' && segments[1] === 'sessions') {
        const sessionId = segments[2]
        if (sessionId === undefined) throw new Error('ZHIWO_SESSION_NOT_FOUND')
        assertOpaqueId(sessionId, 'ses_')
        if (segments.length === 4 && segments[3] === 'messages' && method === 'GET') {
          json(response, 200, {
            session: kernel.database.requireSession(identity.guestId, sessionId),
            messages: kernel.database.listMessages(identity.guestId, sessionId),
          })
          return
        }
        if (segments.length === 4 && segments[3] === 'cancel' && method === 'POST') {
          kernel.cancel(identity.guestId, sessionId)
          json(response, 202, { cancelled: true })
          return
        }
        if (segments.length === 3 && method === 'DELETE') {
          await kernel.deleteSession(identity.guestId, sessionId)
          response.statusCode = 204
          response.end()
          return
        }
        if (segments.length >= 5 && segments[3] === 'sources') {
          const sourceId = segments[4]
          if (sourceId === undefined) throw new Error('ZHIWO_SOURCE_NOT_FOUND')
          assertOpaqueId(sourceId, 'src_')
          const operation = segments.length === 5
            ? 'metadata'
            : segments.length === 6 && segments[5] === 'content'
              ? 'content'
              : segments.length === 6 && segments[5] === 'download'
                ? 'download'
                : undefined
          if (method === 'GET' && operation !== undefined) {
            const result = await kernel.source(identity.guestId, sessionId, sourceId, operation)
            if (operation === 'metadata') {
              json(response, 200, { source: result.source })
              return
            }
            response.statusCode = 200
            response.setHeader('Content-Type', result.mediaType ?? 'application/octet-stream')
            if (operation === 'download') {
              response.setHeader('Content-Disposition', filenameHeader(result.filename ?? 'source'))
            }
            response.end(result.body)
            return
          }
        }
      }
      json(response, 404, { error: { code: 'ZHIWO_NOT_FOUND', message: '请求的接口不存在。' } })
    })().catch((error: unknown) => {
      if (response.headersSent) {
        if (!response.writableEnded) response.end()
        return
      }
      const projected = publicError(error)
      errorCode = projected.code
      json(response, projected.status, { error: { code: projected.code, message: projected.message } })
    })
  })
  const metricsServer = createServer((request, response) => {
    if (request.method !== 'GET' || request.url !== '/metrics') {
      response.statusCode = 404
      response.end('not found\n')
      return
    }
    response.statusCode = 200
    response.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
    response.setHeader('Cache-Control', 'no-store')
    response.end(telemetry.prometheus())
  })
  let port: number
  let metricsPort: number
  try {
    port = await listen(server, config.listenPort, config.listenHost)
    metricsPort = await listen(metricsServer, config.metricsPort, '127.0.0.1')
  } catch (error) {
    if (server.listening) await closeServer(server)
    if (metricsServer.listening) await closeServer(metricsServer)
    await kernel.close()
    throw error
  }
  const origin = new URL(config.publicOrigin)
  if (origin.port === '0') origin.port = String(port)
  expectedPublicOrigin = origin
  const metricsOrigin = new URL(`http://127.0.0.1:${metricsPort}`)
  return {
    server,
    metricsServer,
    kernel,
    origin,
    metricsOrigin,
    async close() {
      await Promise.all([closeServer(server), closeServer(metricsServer)])
      await kernel.close()
    },
  }
}
