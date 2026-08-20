/** Keyless product transcript over the real Zhiwo compiler and upstream Agent Loop composition. */

import { chmod, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { startMockLlmServer } from '@deepseek-ai/dsh-llm-mock-server'
import type { MockLlmServer } from '@deepseek-ai/dsh-llm-mock-server'
import { syncKnowledge, ZhiwoKernel } from '@deepseek-ai/dsh-zhiwo-product'
import type {
  ProductStreamEvent,
  PublicMessage,
  ZhiwoRuntimeConfig,
} from '@deepseek-ai/dsh-zhiwo-product'

const roots: string[] = []
const servers: MockLlmServer[] = []
const kernels: ZhiwoKernel[] = []

afterEach(async () => {
  await Promise.all(kernels.splice(0).map(kernel => kernel.close()))
  await Promise.all(servers.splice(0).map(server => server.close()))
  await Promise.all(roots.splice(0).map(forceRemove))
})

async function forceRemove(path: string): Promise<void> {
  try {
    await chmod(path, 0o700)
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (entry.isDirectory()) await forceRemove(join(path, entry.name))
    }
  } catch {
    // Missing snapshot residue needs no permission repair.
  }
  await rm(path, { recursive: true, force: true })
}

function runtime(root: string, baseURL: string): ZhiwoRuntimeConfig {
  return {
    listenHost: '127.0.0.1',
    listenPort: 0,
    publicOrigin: new URL('http://127.0.0.1:0'),
    stateRoot: join(root, 'state'),
    knowledgeRoot: join(root, 'knowledge'),
    cookieName: 'snapshot_guest',
    cookieSecret: Buffer.alloc(32, 5),
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
    model: 'snapshot-model',
    modelBaseURL: baseURL,
    modelApiKey: 'snapshot-key',
    modelMaxTokens: 1_024,
    modelContextWindow: 16_384,
    modelReasoningEffort: 'high',
    development: true,
  }
}

function normalizeMessage(message: PublicMessage): object {
  return {
    role: message.role,
    content: message.content,
    status: message.status,
    citations: message.citations.map(citation => ({
      title: citation.title,
      openable: citation.openable,
      downloadable: citation.downloadable,
      location: citation.location,
    })),
    trace: message.trace.map(item => ({
      ...item,
      id: '<trace>',
    })),
  }
}

function normalizeEvent(event: ProductStreamEvent): object {
  switch (event.type) {
    case 'start': return { type: event.type, sessionId: '<session>', messageId: '<message>' }
    case 'trace.append': return { type: event.type, item: { ...event.item, id: '<trace>' } }
    case 'trace.replace': return { type: event.type, item: { ...event.item, id: '<trace>' } }
    case 'trace.update': return { ...event, id: '<trace>' }
    case 'done': return { type: event.type, message: normalizeMessage(event.message) }
    default: return event
  }
}

describe('Zhiwo product transcript', () => {
  it('pins the grounded browser event stream and the model-visible tool catalog', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zhiwo-snapshot-'))
    roots.push(root)
    const userdata = join(root, 'userdata')
    await mkdir(userdata, { recursive: true })
    await writeFile(join(userdata, 'profile.md'), [
      '# 候选人项目证据',
      '',
      '候选人设计并实现了一个基于插件架构的 Agent Harness。',
      '该项目强调只读知识访问、引用校验和会话隔离。',
      '',
    ].join('\n'), 'utf8')
    await writeFile(join(userdata, 'zhiwo.yaml'), [
      'version: 1',
      '',
    ].join('\n'), 'utf8')
    const report = await syncKnowledge({
      sourceRoot: userdata,
      knowledgeRoot: join(root, 'knowledge'),
      productVersion: '0.4.0',
      upstreamBase: '141eb6fef83422698aef7a981029e843e8161534',
    })
    const sourceId = report.revision.sources[0]!.id
    const model = await startMockLlmServer({
      sequence: ['tool_call_success', 'reasoning_success'],
      apiKey: 'snapshot-key',
      toolName: 'read',
      toolArguments: JSON.stringify({ path: 'profile.md', line_start: 3, line_end: 4 }),
      reasoningText: '先查阅候选人的授权项目资料，再依据实际内容作答。',
      successText: `候选人实现了插件化 Agent Harness。[[cite:${sourceId}:L3-L3]]项目强调只读访问、引用校验和会话隔离。[[cite:${sourceId}:L4-L4]]`,
    })
    servers.push(model)
    const kernel = await ZhiwoKernel.create(runtime(root, model.baseURL), join(root, 'state', 'zhiwo.db'))
    kernels.push(kernel)
    const events: ProductStreamEvent[] = []
    const result = await kernel.prompt('snapshot-guest', '候选人做过什么 Agent 项目？', undefined, (event) => {
      events.push(event)
    })
    const firstRequest = model.requests[0]!.body as {
      tools: Array<{ function: { name: string } }>
    }

    expect({
      tools: firstRequest.tools.map(tool => tool.function.name),
      events: events.map(normalizeEvent),
      final: normalizeMessage(result.message),
    }).toMatchInlineSnapshot(`
      {
        "events": [
          {
            "messageId": "<message>",
            "sessionId": "<session>",
            "type": "start",
          },
          {
            "item": {
              "detail": "知我只读规则",
              "id": "<trace>",
              "label": "上下文注入",
              "status": "completed",
              "type": "context",
            },
            "type": "trace.append",
          },
          {
            "item": {
              "detail": "userdata/（只读）",
              "id": "<trace>",
              "label": "上下文注入",
              "status": "completed",
              "type": "context",
            },
            "type": "trace.append",
          },
          {
            "item": {
              "detail": "userdata/profile.md",
              "id": "<trace>",
              "label": "Read",
              "status": "running",
              "tool": "read",
              "type": "tool",
            },
            "type": "trace.append",
          },
          {
            "id": "<trace>",
            "status": "completed",
            "type": "trace.update",
          },
          {
            "item": {
              "id": "<trace>",
              "label": "Think",
              "status": "running",
              "text": "正在分析问题与资料…",
              "type": "reasoning",
            },
            "type": "trace.append",
          },
          {
            "item": {
              "id": "<trace>",
              "label": "Think",
              "status": "completed",
              "text": "先查阅候选人的授权项目资料，再依据实际内容作答。",
              "type": "reasoning",
            },
            "type": "trace.replace",
          },
          {
            "text": "候选人实现了插件化 Agent Harness。[1]项目强调只",
            "type": "delta",
          },
          {
            "text": "读访问、引用校验和会话隔离。[1]",
            "type": "delta",
          },
          {
            "message": {
              "citations": [
                {
                  "downloadable": true,
                  "location": {
                    "lineEnd": 4,
                    "lineStart": 3,
                  },
                  "openable": true,
                  "title": "profile.md",
                },
              ],
              "content": "候选人实现了插件化 Agent Harness。[1]项目强调只读访问、引用校验和会话隔离。[1]",
              "role": "assistant",
              "status": "completed",
              "trace": [
                {
                  "detail": "知我只读规则",
                  "id": "<trace>",
                  "label": "上下文注入",
                  "status": "completed",
                  "type": "context",
                },
                {
                  "detail": "userdata/（只读）",
                  "id": "<trace>",
                  "label": "上下文注入",
                  "status": "completed",
                  "type": "context",
                },
                {
                  "detail": "userdata/profile.md",
                  "id": "<trace>",
                  "label": "Read",
                  "status": "completed",
                  "tool": "read",
                  "type": "tool",
                },
                {
                  "id": "<trace>",
                  "label": "Think",
                  "status": "completed",
                  "text": "先查阅候选人的授权项目资料，再依据实际内容作答。",
                  "type": "reasoning",
                },
              ],
            },
            "type": "done",
          },
        ],
        "final": {
          "citations": [
            {
              "downloadable": true,
              "location": {
                "lineEnd": 4,
                "lineStart": 3,
              },
              "openable": true,
              "title": "profile.md",
            },
          ],
          "content": "候选人实现了插件化 Agent Harness。[1]项目强调只读访问、引用校验和会话隔离。[1]",
          "role": "assistant",
          "status": "completed",
          "trace": [
            {
              "detail": "知我只读规则",
              "id": "<trace>",
              "label": "上下文注入",
              "status": "completed",
              "type": "context",
            },
            {
              "detail": "userdata/（只读）",
              "id": "<trace>",
              "label": "上下文注入",
              "status": "completed",
              "type": "context",
            },
            {
              "detail": "userdata/profile.md",
              "id": "<trace>",
              "label": "Read",
              "status": "completed",
              "tool": "read",
              "type": "tool",
            },
            {
              "id": "<trace>",
              "label": "Think",
              "status": "completed",
              "text": "先查阅候选人的授权项目资料，再依据实际内容作答。",
              "type": "reasoning",
            },
          ],
        },
        "tools": [
          "read",
          "glob",
          "grep",
        ],
      }
    `)
  })
})
