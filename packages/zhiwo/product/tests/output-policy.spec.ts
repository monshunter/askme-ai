import { describe, expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import {
  UNSAFE_OUTPUT_FALLBACK,
  containsUnsafeAssistantContent,
  containsUnsafeValue,
  safeZhiwoStream,
} from '../src/output-policy.ts'

const OPTIONS = {
  provider: 'test',
  model: 'test',
  messages: [],
  sessionId: SessionId('zhiwo-owner-session'),
} satisfies GenerateOptions

async function collect(chunks: StreamChunk[]): Promise<StreamChunk[]> {
  async function* source(): AsyncIterable<StreamChunk> { yield* chunks }
  const result: StreamChunk[] = []
  for await (const chunk of safeZhiwoStream(OPTIONS, '/srv/zhiwo/userdata', source)) result.push(chunk)
  return result
}

function response(text: string): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'usage', usage: { inputTokens: 4, outputTokens: 2 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

describe('Zhiwo model-output privacy', () => {
  it('accepts relative citations and ordinary owner material', async () => {
    const chunks = response('经历见 easyinterview/README.md:12。')
    await expect(collect(chunks)).resolves.toEqual(chunks)
  })

  it('replaces absolute host paths before any chunk is published', async () => {
    const chunks = await collect(response('工作区是 /Users/private/repo/userdata。'))
    expect(chunks).toEqual([
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: UNSAFE_OUTPUT_FALLBACK },
      { type: 'block-end', index: 0, block: { type: 'text', text: UNSAFE_OUTPUT_FALLBACK } },
      { type: 'usage', usage: { inputTokens: 4, outputTokens: 2 } },
      { type: 'finish', reason: { kind: 'stop' } },
    ])
    expect(chunks.some(chunk => JSON.stringify(chunk).includes('/Users/private'))).toBe(false)
  })

  it('recognizes private runtime vocabulary and exact workspace roots', () => {
    expect(containsUnsafeAssistantContent('DSH_HOME is configured', '/srv/zhiwo/userdata')).toBe(true)
    expect(containsUnsafeAssistantContent('read /srv/zhiwo/userdata/a.md', '/srv/zhiwo/userdata')).toBe(true)
    expect(containsUnsafeValue({ path: String.raw`C:\Users\private\userdata\profile.md` }, String.raw`C:\Users\private\userdata`))
      .toBe(true)
    expect(containsUnsafeAssistantContent('这些内容来自当前工作区。', '/srv/zhiwo/userdata')).toBe(true)
    expect(containsUnsafeAssistantContent('The workspace contains four projects.', '/srv/zhiwo/userdata')).toBe(true)
    expect(containsUnsafeAssistantContent('现有资料包括四个项目。', '/srv/zhiwo/userdata')).toBe(false)
  })
})
