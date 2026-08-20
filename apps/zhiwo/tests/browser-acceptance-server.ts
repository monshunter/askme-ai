/** Disposable real-server fixture used for manual Chrome acceptance. */

import { chmod, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startMockLlmServer } from '@deepseek-ai/dsh-llm-mock-server'
import type { MockLlmServer } from '@deepseek-ai/dsh-llm-mock-server'
import { startZhiwoServer, syncKnowledge } from '@deepseek-ai/dsh-zhiwo-product'
import type { ZhiwoRuntimeConfig, ZhiwoServerHandle } from '@deepseek-ai/dsh-zhiwo-product'

async function forceRemove(path: string): Promise<void> {
  try {
    await chmod(path, 0o700)
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (entry.isDirectory()) await forceRemove(join(path, entry.name))
    }
  } catch {
    // A missing acceptance directory needs no permission repair.
  }
  await rm(path, { recursive: true, force: true })
}

async function main(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'zhiwo-browser-acceptance-'))
  let llm: MockLlmServer | undefined
  let product: ZhiwoServerHandle | undefined
  try {
    const userdata = join(root, 'userdata')
    await mkdir(userdata, { recursive: true })
    await writeFile(join(userdata, 'profile.md'), [
      '# Askme（职问）是什么',
      '',
      'Askme 是一个个人职业知识库 Agent（Personal Career Knowledge Agent）。',
      '候选人上传职业资料后，Askme 构建只读知识库；访客用自然语言了解经历、能力与项目实践，每个事实回答都带来源。',
      '知我只是 DeepSeek Harness 的一套产品外观，并限制 Agent 只读访问 userdata/；它不改变 Agent Loop、推理、工具调用和流式输出范式。',
      '',
    ].join('\n'), 'utf8')
    await writeFile(join(userdata, 'zhiwo.yaml'), [
      'version: 1',
      'starter_questions:',
      '  - askme 是一个什么项目？',
      '',
    ].join('\n'), 'utf8')

    const report = await syncKnowledge({
      sourceRoot: userdata,
      knowledgeRoot: join(root, 'knowledge'),
      productVersion: '0.4.0',
      upstreamBase: '141eb6fef83422698aef7a981029e843e8161534',
    })
    const sourceId = report.revision.sources[0]!.id
    const realApi = process.env.ZHIWO_ACCEPTANCE_REAL_API === 'true'
    if (!realApi) {
      llm = await startMockLlmServer({
        sequence: ['tool_call_success', 'reasoning_success'],
        repeatLast: true,
        apiKey: 'mock-key',
        toolName: 'read',
        toolArguments: JSON.stringify({ path: 'profile.md', line_start: 1, line_end: 5 }),
        reasoningText: '先查阅 userdata 中的 Askme 项目资料，再整理项目定位、使用方式与 Agent 运行范式。',
        successText: `## Askme（职问）是什么\n\nAskme 是一个**个人职业知识库 Agent**。[[cite:${sourceId}:L3-L3]]候选人上传职业资料后，访客可通过自然语言了解其经历、能力和项目实践，并获得带来源的回答。[[cite:${sourceId}:L4-L4]]\n\n“知我”只是 DeepSeek Harness 的产品外观和只读权限收敛；原生 Agent Loop、推理、工具调用与流式输出范式保持不变。[[cite:${sourceId}:L5-L5]]`,
        chunkSize: 4,
      })
    }
    const modelApiKey = realApi ? process.env.DEEPSEEK_API_KEY : 'mock-key'
    if (modelApiKey === undefined || modelApiKey.length === 0) {
      throw new Error('DEEPSEEK_API_KEY is required when ZHIWO_ACCEPTANCE_REAL_API=true')
    }
    const modelBaseURL = realApi
      ? process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com'
      : llm!.baseURL
    const runtime: ZhiwoRuntimeConfig = {
      listenHost: '127.0.0.1',
      listenPort: 0,
      publicOrigin: new URL('http://127.0.0.1:0'),
      stateRoot: join(root, 'state'),
      knowledgeRoot: join(root, 'knowledge'),
      cookieName: 'zhiwo_acceptance_guest',
      cookieSecret: Buffer.alloc(32, 7),
      cookieMaxAgeDays: 1,
      sessionRetentionDays: 30,
      maxSessionsPerGuest: 10,
      maxPromptChars: 8_000,
      maxTurnsPerSession: 10,
      maxRequestsPerGuestMinute: 100,
      maxRequestsPerIpMinute: 100,
      maxConcurrentPerGuest: 1,
      maxConcurrentPerIp: 3,
      metricsPort: 0,
      logLevel: 'silent',
      modelProvider: 'zhiwo-deepseek',
      model: realApi ? process.env.DEEPSEEK_MODEL ?? 'deepseek-chat' : 'mock-model',
      modelBaseURL,
      modelApiKey,
      modelMaxTokens: 1_024,
      modelContextWindow: realApi ? 131_072 : 16_384,
      modelReasoningEffort: 'high',
      development: true,
    }
    product = await startZhiwoServer(
      runtime,
      join(root, 'state', 'zhiwo.db'),
      join(import.meta.dirname, '..', 'dist'),
      { version: '0.4.0', upstreamBase: '141eb6fef83422698aef7a981029e843e8161534' },
    )

    process.stdout.write(`ZHIWO_ACCEPTANCE_SERVER ${JSON.stringify({
      origin: product.origin.origin,
      metricsOrigin: product.metricsOrigin.origin,
      provider: realApi ? 'deepseek-api' : 'mock',
      modelBaseURL,
      root,
      sourceId,
    })}\n`)
    await new Promise<void>((resolveStop) => {
      const stop = (): void => { resolveStop() }
      process.once('SIGINT', stop)
      process.once('SIGTERM', stop)
    })
  } finally {
    await product?.close()
    await llm?.close()
    await forceRemove(root)
  }
}

await main()
