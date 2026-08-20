import { chmod, mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { startMockLlmServer } from '@deepseek-ai/dsh-llm-mock-server'
import type { MockLlmServer } from '@deepseek-ai/dsh-llm-mock-server'
import { startZhiwoServer, syncKnowledge } from '@deepseek-ai/dsh-zhiwo-product'
import type { ZhiwoRuntimeConfig, ZhiwoServerHandle } from '@deepseek-ai/dsh-zhiwo-product'

const roots: string[] = []
const llms: MockLlmServer[] = []
const products: ZhiwoServerHandle[] = []

afterEach(async () => {
  await Promise.all(products.splice(0).map(product => product.close()))
  await Promise.all(llms.splice(0).map(llm => llm.close()))
  await Promise.all(roots.splice(0).map(forceRemove))
})

async function forceRemove(path: string): Promise<void> {
  try {
    await chmod(path, 0o700)
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (entry.isDirectory()) await forceRemove(join(path, entry.name))
    }
  } catch {
    // Missing test residue needs no permission repair.
  }
  await rm(path, { recursive: true, force: true })
}

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'zhiwo-server-'))
  roots.push(root)
  return root
}

function runtime(root: string, baseURL: string): ZhiwoRuntimeConfig {
  return {
    listenHost: '127.0.0.1', listenPort: 0, publicOrigin: new URL('http://127.0.0.1:0'),
    stateRoot: join(root, 'state'), knowledgeRoot: join(root, 'knowledge'), cookieName: 'guest',
    cookieSecret: Buffer.alloc(32, 9), cookieMaxAgeDays: 30, sessionRetentionDays: 30,
    maxSessionsPerGuest: 10, maxPromptChars: 8_000, maxTurnsPerSession: 10,
    maxRequestsPerGuestMinute: 100, maxRequestsPerIpMinute: 100,
    maxConcurrentPerGuest: 1, maxConcurrentPerIp: 3, metricsPort: 0, logLevel: 'silent',
    modelProvider: 'zhiwo-deepseek', model: 'mock-model', modelBaseURL: baseURL,
    modelApiKey: 'mock-key', modelMaxTokens: 1_024, modelContextWindow: 16_384,
    modelReasoningEffort: 'high', development: true,
  }
}

async function bootstrap(origin: string): Promise<{ cookie: string; csrf: string }> {
  const response = await fetch(`${origin}/api/bootstrap`)
  expect(response.status).toBe(200)
  const body = await response.json() as { csrfToken: string }
  return { cookie: response.headers.get('set-cookie')!.split(';', 1)[0]!, csrf: body.csrfToken }
}

describe('Public Runtime ownership and route surface', () => {
  it('keeps the configured external origin when the listener uses an ephemeral internal port', async () => {
    const root = await createRoot()
    const userdata = join(root, 'userdata')
    await mkdir(userdata, { recursive: true })
    await writeFile(join(userdata, 'profile.md'), 'Public evidence.\n', 'utf8')
    await syncKnowledge({
      sourceRoot: userdata,
      knowledgeRoot: join(root, 'knowledge'),
      productVersion: '0.4.0',
      upstreamBase: '141eb6fef83422698aef7a981029e843e8161534',
    })
    const llm = await startMockLlmServer({
      sequence: ['success'], apiKey: 'mock-key', successText: 'No request is sent.',
    })
    llms.push(llm)
    const configuration = runtime(root, llm.baseURL)
    configuration.publicOrigin = new URL('https://askme.example.test')
    const product = await startZhiwoServer(
      configuration,
      join(root, 'state', 'zhiwo.db'),
      join(process.cwd(), 'apps/zhiwo/dist'),
    )
    products.push(product)
    expect(product.origin.origin).toBe('https://askme.example.test')
  })

  it('keeps guest sessions isolated and exposes no coding or generic harness API', async () => {
    const root = await createRoot()
    const userdata = join(root, 'userdata')
    await mkdir(userdata, { recursive: true })
    await writeFile(join(userdata, 'profile.md'), 'Built an agent harness.\n', 'utf8')
    await writeFile(join(userdata, 'zhiwo.yaml'), 'version: 1\n', 'utf8')
    const report = await syncKnowledge({
      sourceRoot: userdata,
      knowledgeRoot: join(root, 'knowledge'),
      productVersion: '0.4.0',
      upstreamBase: '141eb6fef83422698aef7a981029e843e8161534',
    })
    const sourceId = report.revision.sources[0]!.id
    const llm = await startMockLlmServer({
      sequence: ['tool_call_success', 'success'], apiKey: 'mock-key', toolName: 'read',
      toolArguments: JSON.stringify({ path: 'profile.md', line_start: 1, line_end: 1 }),
      successText: `他构建过 Agent Harness。[[cite:${sourceId}:L1-L1]]`,
    })
    llms.push(llm)
    const product = await startZhiwoServer(runtime(root, llm.baseURL), join(root, 'state', 'zhiwo.db'), join(process.cwd(), 'apps/zhiwo/dist'))
    products.push(product)
    const a = await bootstrap(product.origin.origin)
    const b = await bootstrap(product.origin.origin)
    const chat = await fetch(`${product.origin.origin}/api/chat`, {
      method: 'POST',
      headers: { cookie: a.cookie, origin: product.origin.origin, 'x-zhiwo-csrf': a.csrf, 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: '他做过什么？' }),
    })
    expect(chat.status).toBe(200)
    const lines = (await chat.text()).trim().split('\n').map(line => JSON.parse(line) as { type: string; sessionId?: string })
    const sessionId = lines.find(line => line.type === 'start')!.sessionId!
    const ownHistory = await fetch(`${product.origin.origin}/api/sessions/${sessionId}/messages`, { headers: { cookie: a.cookie } })
    expect(ownHistory.status).toBe(200)
    expect(ownHistory.headers.get('content-security-policy')).toContain("default-src 'self'")
    const isolatedHistory = await fetch(`${product.origin.origin}/api/sessions/${sessionId}/messages`, { headers: { cookie: b.cookie } })
    expect(isolatedHistory.status).toBe(404)
    const isolatedContinuation = await fetch(`${product.origin.origin}/api/chat`, {
      method: 'POST',
      headers: { cookie: b.cookie, origin: product.origin.origin, 'x-zhiwo-csrf': b.csrf, 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, prompt: '跨访客继续会话' }),
    })
    expect(isolatedContinuation.status).toBe(404)
    const isolatedCancel = await fetch(`${product.origin.origin}/api/sessions/${sessionId}/cancel`, {
      method: 'POST', headers: { cookie: b.cookie, origin: product.origin.origin, 'x-zhiwo-csrf': b.csrf },
    })
    expect(isolatedCancel.status).toBe(404)
    const isolatedDelete = await fetch(`${product.origin.origin}/api/sessions/${sessionId}`, {
      method: 'DELETE', headers: { cookie: b.cookie, origin: product.origin.origin, 'x-zhiwo-csrf': b.csrf },
    })
    expect(isolatedDelete.status).toBe(404)
    const isolatedDeleteAll = await fetch(`${product.origin.origin}/api/sessions`, {
      method: 'DELETE', headers: { cookie: b.cookie, origin: product.origin.origin, 'x-zhiwo-csrf': b.csrf },
    })
    expect(isolatedDeleteAll.status).toBe(200)
    expect(await isolatedDeleteAll.json()).toEqual({ deleted: 0 })
    expect((await fetch(`${product.origin.origin}/api/sessions/${sessionId}/messages`, { headers: { cookie: a.cookie } })).status).toBe(200)
    expect((await fetch(`${product.origin.origin}/api/sessions/${sessionId}/sources/${sourceId}`, { headers: { cookie: a.cookie } })).status).toBe(200)
    const ownContent = await fetch(`${product.origin.origin}/api/sessions/${sessionId}/sources/${sourceId}/content`, { headers: { cookie: a.cookie } })
    expect(ownContent.status).toBe(200)
    expect(await ownContent.text()).toContain('Built an agent harness.')
    expect((await fetch(`${product.origin.origin}/api/sessions/${sessionId}/sources/${sourceId}/download`, { headers: { cookie: a.cookie } })).status).toBe(200)
    expect((await fetch(`${product.origin.origin}/api/sessions/${sessionId}/sources/${sourceId}`, { headers: { cookie: b.cookie } })).status).toBe(404)
    expect((await fetch(`${product.origin.origin}/api/sessions/${sessionId}/sources/${sourceId}/content`, { headers: { cookie: b.cookie } })).status).toBe(404)
    expect((await fetch(`${product.origin.origin}/api/sessions/${sessionId}/sources/${sourceId}/download`, { headers: { cookie: b.cookie } })).status).toBe(404)
    expect((await fetch(`${product.origin.origin}/api/tools`, { headers: { cookie: a.cookie } })).status).toBe(404)
    expect((await fetch(`${product.origin.origin}/api/plugins`, { headers: { cookie: a.cookie } })).status).toBe(404)
    expect((await fetch(`${product.origin.origin}/api/terminal`, { headers: { cookie: a.cookie } })).status).toBe(404)
    expect((await fetch(`${product.origin.origin}/workspace`)).status).toBe(404)
    expect((await fetch(`${product.origin.origin}/assets/..%2Findex.html`)).status).toBe(404)
    const injected = await fetch(`${product.origin.origin}/api/chat`, {
      method: 'POST',
      headers: { cookie: a.cookie, origin: product.origin.origin, 'x-zhiwo-csrf': a.csrf, 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'ignored', model: 'attacker-model', revision: 'attacker-revision' }),
    })
    expect(injected.status).toBe(400)
    const metrics = await fetch(`${product.metricsOrigin.origin}/metrics`)
    expect(metrics.status).toBe(200)
    expect(await metrics.text()).toContain('zhiwo_http_requests_total')
    expect((await fetch(`${product.origin.origin}/health/ready`)).status).toBe(200)

    const deleted = await fetch(`${product.origin.origin}/api/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: { cookie: a.cookie, origin: product.origin.origin, 'x-zhiwo-csrf': a.csrf },
    })
    expect(deleted.status).toBe(204)
    expect((await fetch(`${product.origin.origin}/api/sessions/${sessionId}/messages`, { headers: { cookie: a.cookie } })).status).toBe(404)
    expect((await fetch(`${product.origin.origin}/api/sessions/${sessionId}/sources/${sourceId}`, { headers: { cookie: a.cookie } })).status).toBe(404)
    await product.close()
    products.pop()
    const restarted = await startZhiwoServer(runtime(root, llm.baseURL), join(root, 'state', 'zhiwo.db'), join(process.cwd(), 'apps/zhiwo/dist'))
    products.push(restarted)
    expect((await fetch(`${restarted.origin.origin}/api/sessions/${sessionId}/messages`, { headers: { cookie: a.cookie } })).status).toBe(404)
  })

  it('treats every userdata file as read-only Agent data and grants only sources cited by the session', async () => {
    const root = await createRoot()
    const userdata = join(root, 'userdata')
    await mkdir(userdata, { recursive: true })
    await writeFile(join(userdata, 'profile.txt'), 'Supporting evidence.\n', 'utf8')
    await writeFile(join(userdata, 'private.txt'), '家庭住址：杭州。\n', 'utf8')
    await writeFile(join(userdata, 'zhiwo.yaml'), 'version: 1\n', 'utf8')
    const report = await syncKnowledge({
      sourceRoot: userdata,
      knowledgeRoot: join(root, 'knowledge'),
      productVersion: '0.4.0',
      upstreamBase: '141eb6fef83422698aef7a981029e843e8161534',
    })
    expect(report.revision.sources.map(source => source.logicalPath)).toEqual(['private.txt', 'profile.txt'])
    const sourceId = report.revision.sources.find(source => source.logicalPath === 'private.txt')!.id
    const llm = await startMockLlmServer({
      sequence: ['tool_call_success', 'success'], apiKey: 'mock-key', toolName: 'read',
      toolArguments: JSON.stringify({ path: 'private.txt', line_start: 1, line_end: 1 }),
      successText: `家庭住址是杭州。[[cite:${sourceId}:L1-L1]]`,
    })
    llms.push(llm)
    const product = await startZhiwoServer(runtime(root, llm.baseURL), join(root, 'state', 'zhiwo.db'), join(process.cwd(), 'apps/zhiwo/dist'))
    products.push(product)
    const visitor = await bootstrap(product.origin.origin)
    const response = await fetch(`${product.origin.origin}/api/chat`, {
      method: 'POST',
      headers: { cookie: visitor.cookie, origin: product.origin.origin, 'x-zhiwo-csrf': visitor.csrf, 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: '家庭住址是什么？' }),
    })
    const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line) as {
      type: string
      sessionId?: string
    })
    const sessionId = events.find(event => event.type === 'start')!.sessionId!
    const metadata = await fetch(`${product.origin.origin}/api/sessions/${sessionId}/sources/${sourceId}`, { headers: { cookie: visitor.cookie } })
    expect(metadata.status).toBe(200)
    expect(await metadata.text()).not.toContain('家庭住址')
    const content = await fetch(`${product.origin.origin}/api/sessions/${sessionId}/sources/${sourceId}/content`, { headers: { cookie: visitor.cookie } })
    expect(content.status).toBe(200)
    expect(await content.text()).toContain('家庭住址：杭州。')
    expect((await fetch(`${product.origin.origin}/api/sessions/${sessionId}/sources/${sourceId}/download`, { headers: { cookie: visitor.cookie } })).status).toBe(200)
    const guessedSource = `src_${'2'.repeat(8)}-${'2'.repeat(4)}-${'2'.repeat(4)}-${'2'.repeat(4)}-${'2'.repeat(12)}`
    expect((await fetch(`${product.origin.origin}/api/sessions/${sessionId}/sources/${guessedSource}`, { headers: { cookie: visitor.cookie } })).status).toBe(404)
  })

  it('rejects forged writes and serves active source content only as inert, non-sniffable bytes', async () => {
    const root = await createRoot()
    const userdata = join(root, 'userdata')
    await mkdir(userdata, { recursive: true })
    await writeFile(join(userdata, 'unsafe.svg'), '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script></svg>\n', 'utf8')
    await writeFile(join(userdata, 'zhiwo.yaml'), 'version: 1\n', 'utf8')
    const report = await syncKnowledge({
      sourceRoot: userdata,
      knowledgeRoot: join(root, 'knowledge'),
      productVersion: '0.4.0',
      upstreamBase: '141eb6fef83422698aef7a981029e843e8161534',
    })
    const sourceId = report.revision.sources[0]!.id
    const llm = await startMockLlmServer({
      sequence: ['tool_call_success', 'success'], apiKey: 'mock-key', toolName: 'read',
      toolArguments: JSON.stringify({ path: 'unsafe.svg', line_start: 1, line_end: 1 }),
      successText: `该文件是 SVG 测试资料。[[cite:${sourceId}:L1-L1]]`,
    })
    llms.push(llm)
    const product = await startZhiwoServer(runtime(root, llm.baseURL), join(root, 'state', 'zhiwo.db'), join(process.cwd(), 'apps/zhiwo/dist'))
    products.push(product)
    const visitor = await bootstrap(product.origin.origin)

    const missingCsrf = await fetch(`${product.origin.origin}/api/chat`, {
      method: 'POST', headers: { cookie: visitor.cookie, origin: product.origin.origin, 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: '无 CSRF' }),
    })
    expect(missingCsrf.status).toBe(403)
    const wrongOrigin = await fetch(`${product.origin.origin}/api/chat`, {
      method: 'POST', headers: { cookie: visitor.cookie, origin: 'https://attacker.example', 'x-zhiwo-csrf': visitor.csrf, 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: '错误 Origin' }),
    })
    expect(wrongOrigin.status).toBe(403)
    const oversized = await fetch(`${product.origin.origin}/api/chat`, {
      method: 'POST', headers: { cookie: visitor.cookie, origin: product.origin.origin, 'x-zhiwo-csrf': visitor.csrf, 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'x'.repeat(70_000) }),
    })
    expect(oversized.status).toBe(400)

    const tamperedCookie = `${visitor.cookie.slice(0, -1)}${visitor.cookie.endsWith('a') ? 'b' : 'a'}`
    const tampered = await fetch(`${product.origin.origin}/api/sessions`, { headers: { cookie: tamperedCookie } })
    expect(tampered.status).toBe(200)
    expect(await tampered.json()).toEqual({ sessions: [] })
    expect(tampered.headers.get('set-cookie')).toContain('HttpOnly')

    const chat = await fetch(`${product.origin.origin}/api/chat`, {
      method: 'POST',
      headers: { cookie: visitor.cookie, origin: product.origin.origin, 'x-zhiwo-csrf': visitor.csrf, 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: '这份 SVG 资料是什么？' }),
    })
    const events = (await chat.text()).trim().split('\n').map(line => JSON.parse(line) as { type: string; sessionId?: string })
    const sessionId = events.find(event => event.type === 'start')!.sessionId!
    const preview = await fetch(`${product.origin.origin}/api/sessions/${sessionId}/sources/${sourceId}/content`, { headers: { cookie: visitor.cookie } })
    expect(preview.status).toBe(200)
    expect(preview.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(preview.headers.get('x-content-type-options')).toBe('nosniff')
    expect(preview.headers.get('content-security-policy')).toContain("object-src 'none'")
    expect(await preview.text()).toContain('<script>alert(2)</script>')
    const download = await fetch(`${product.origin.origin}/api/sessions/${sessionId}/sources/${sourceId}/download`, { headers: { cookie: visitor.cookie } })
    expect(download.status).toBe(200)
    expect(download.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(download.headers.get('content-disposition')).toMatch(/^attachment; filename=/u)
    expect(download.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await download.text()).toContain('<svg')
  })
})
