import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AgentHandle } from '@deepseek-ai/dsh-agent'
import { CallId, createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-agent-presets'
import { assertFixtureInventory, launchWebScaffold, type WebScaffold } from './scaffold.ts'

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const OVERLAY = join(REPO_ROOT, 'packages/zhiwo/product/cordis.patch.yml')
const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/zhiwo-preset', import.meta.url))
const FIXTURE = join(SNAPSHOT_DIR, 'session.jsonl')
const PROMPT = '请介绍一下你自己。'
const PERSONA = '你是资料所有者的个人 Agent“知我AI”，面向访客介绍并代表资料所有者回答问题。回答中的“我”始终指资料所有者，不指 Agent 或访客；不要把访客的经历、项目、能力或计划当成资料所有者的信息。你只根据本次可直接读取的原始资料回答，在回复和思考中一律称为“现有资料”，不要描述这些资料的系统位置、工作区、宿主环境、目录边界或环境变量，也不要声称存在知识库、索引、同步副本或 revision。需要事实时先用 glob 或 grep 查找原始文件，再用 read 阅读相关行；后续问题应重新读取当前文件，不要假设文件内容没有变化。测试、fixture、mock 和示例内容不能作为资料所有者的事实；评审记录、运行日志、工作日志、计划和验收记录中对个人资料、职业履历或外部文件的二手引用也不能作为资料所有者的事实，除非本次可直接读取的正式个人资料明确确认。对未找到或不能直接读取的资料，不得推断其存储位置、外部状态或内容。回答应区分资料事实、推断和待确认项；资料不足时明确说明，不要为了维持第一人称而编造。引用关键事实时只使用相对路径和行号，例如 profile.md:12；不得输出绝对路径，也不得把路径中的用户名或其他机器环境信息当作资料所有者事实。你不能修改文件，也不能调用现有资料中未提供的能力。'

describe('Zhiwo agent preset', () => {
  let scaffold: WebScaffold
  let agentHandle: AgentHandle

  beforeAll(async () => {
    const previousWorkspaceRoot = process.env.ZHIWO_WORKSPACE_ROOT
    process.env.ZHIWO_WORKSPACE_ROOT = '.'
    try {
      scaffold = await launchWebScaffold({
        extraOverlayPath: OVERLAY,
        replayFixture: FIXTURE,
        welcomeNoticePending: true,
      })
    } finally {
      if (previousWorkspaceRoot === undefined) delete process.env.ZHIWO_WORKSPACE_ROOT
      else process.env.ZHIWO_WORKSPACE_ROOT = previousWorkspaceRoot
    }
    agentHandle = await scaffold.ctx.agents.create({
      sessionId: SessionId('zhiwo-preset-smoke'),
      meta: { cwd: scaffold.workspaceCwd, agentPreset: 'zhiwo' },
      agentOptions: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
      setup: agentCtx => scaffold.ctx.agentPresets.mount(agentCtx, 'zhiwo').then(() => undefined),
    })
  })

  afterAll(async () => {
    const failures: unknown[] = []
    await agentHandle?.dispose().catch((error: unknown) => failures.push(error))
    await scaffold?.close().catch((error: unknown) => failures.push(error))
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) throw new AggregateError(failures, 'Zhiwo preset smoke teardown failed')
  })

  it('represents the material owner to visitors with the read-only discovery tools', async () => {
    await writeFile(join(scaffold.workspaceCwd, 'profile.md'), '# Profile\n')
    const signal = new AbortController().signal
    const inside = await scaffold.ctx.tools.execute({
      callId: CallId('zhiwo-read-inside'),
      name: 'read',
      arguments: { file_path: 'profile.md' },
      agent: agentHandle.agent,
      signal,
    })
    expect(inside).toMatchObject({ isError: false, value: { path: 'profile.md' } })
    expect(JSON.stringify(inside)).not.toContain(scaffold.workspaceCwd)

    const outside = await scaffold.ctx.tools.execute({
      callId: CallId('zhiwo-read-outside'),
      name: 'read',
      arguments: { file_path: '../outside.md' },
      agent: agentHandle.agent,
      signal,
    })
    expect(outside).toMatchObject({
      isError: true,
      content: [{ type: 'text', text: 'Error: Zhiwo tools can only access the provided materials.' }],
    })
    expect(JSON.stringify(outside)).not.toContain(scaffold.workspaceCwd)

    const crowded = join(scaffold.workspaceCwd, 'crowded')
    await mkdir(crowded)
    await Promise.all(Array.from({ length: 101 }, (_, index) =>
      writeFile(join(crowded, `${String(index).padStart(3, '0')}.txt`), 'fixture\n')))
    const glob = await scaffold.ctx.tools.execute({
      callId: CallId('zhiwo-glob-over-cap'),
      name: 'glob',
      arguments: { pattern: '*.txt', path: 'crowded' },
      agent: agentHandle.agent,
      signal,
    })
    expect(glob).toMatchObject({ isError: false })
    expect(JSON.stringify(glob)).toContain('The complete result could not be saved')
    expect(JSON.stringify(glob)).not.toContain('Full sorted result stored at')
    expect(JSON.stringify(glob)).not.toMatch(/\/(?:private\/)?(?:tmp|var)\//u)

    agentHandle.agent.followup(createUserMessage({
      content: [{ type: 'text', text: PROMPT }],
      source: { kind: 'user' },
    }))
    await agentHandle.agent.whenIdle()

    const requestHeader = agentHandle.agent.session.requestHeader()
    if (requestHeader === undefined) throw new Error('the Zhiwo agent issued no model request')
    expect(requestHeader.system).toBe(PERSONA)
    expect(requestHeader.tools?.map(tool => tool.name).toSorted()).toEqual(['glob', 'grep', 'read'])
    expect(agentHandle.agent.session.events.some(event => event.type === 'assistant/chunk')).toBe(true)
    await assertFixtureInventory(SNAPSHOT_DIR, ['session.jsonl'])
  })
})
