// Keyless browser snapshot for Zhiwo's post-answer question generation. The
// shipped Web composition and replayed answer run over real HTTP/WebSocket;
// one purpose-scoped listener supplies deterministic auxiliary model output.
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { createUserMessage, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-zhiwo-product/types'
import {
  assertFixtureInventory,
  compareOrRefreshGolden,
  launchWebScaffold,
  watchConsole,
  webSnapshotMode,
  type WebScaffold,
} from './scaffold.ts'
import { saveFailureShot } from './support.ts'

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const OVERLAY = join(REPO_ROOT, 'packages/zhiwo/product/cordis.patch.yml')
const FIXTURE = fileURLToPath(new URL('./snapshots/zhiwo-preset/session.jsonl', import.meta.url))
const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/zhiwo-question-generation', import.meta.url))
const QUESTIONS_EXPECTED = join(SNAPSHOT_DIR, 'questions.expected.md')
const MODE = webSnapshotMode()
const PROMPT = '请介绍一下你自己。'
const GENERATIONS = [
  [
    { zh: '这次回答中最值得继续展开的个人经历是什么？', en: 'Which personal experience from this answer is most worth exploring?' },
    { zh: '哪些具体项目最能体现刚才提到的能力？', en: 'Which concrete projects best demonstrate the abilities just mentioned?' },
  ],
  [
    { zh: '刚才回答里的哪项事实最需要补充具体结果？', en: 'Which fact in the last answer most needs a concrete result?' },
    { zh: '这些经历对下一阶段计划有什么影响？', en: 'How do these experiences affect the next-stage plan?' },
  ],
] as const

function generatedStream(output: unknown): AsyncIterable<StreamChunk> {
  return (async function* () {
    yield { type: 'text-delta', index: 0, text: JSON.stringify(output) }
    yield { type: 'finish', reason: { kind: 'stop' } }
  })()
}

describe('Zhiwo contextual-question browser snapshot', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>
  let disposeSuggestionModel: (() => void) | undefined
  const requests: GenerateOptions[] = []

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
    disposeSuggestionModel = scaffold.ctx.on('llm/stream', (options, next) => {
      if (options.purpose !== 'suggestions') return next()
      requests.push(options)
      const output = GENERATIONS[requests.length - 1]
      if (output === undefined) throw new Error('Zhiwo browser snapshot received an unexpected suggestion request')
      return generatedStream(output)
    }, { global: true, prepend: true })
    browser = await chromium.launch()
    page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: 'zh-CN' })
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    const failures: unknown[] = []
    disposeSuggestionModel?.()
    await browser?.close().catch((error: unknown) => failures.push(error))
    await scaffold?.close().catch((error: unknown) => failures.push(error))
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) throw new AggregateError(failures, 'Zhiwo question browser teardown failed')
  })

  it('generates half the set after the answer and again on manual refresh', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-zhiwo-question-generation'))
    const composer = page.locator('textarea:enabled[placeholder="问问我的经历、项目、能力或计划"]')
    await composer.waitFor({ timeout: 15_000 })
    await expect.poll(() => scaffold.ctx.agents.list().length, { timeout: 10_000 }).toBe(1)
    const browserAgent = scaffold.ctx.agents.list()[0]
    if (browserAgent === undefined) throw new Error('Zhiwo browser did not create its Session Agent')
    browserAgent.followup(createUserMessage({
      content: [{ type: 'text', text: PROMPT }],
      source: { kind: 'user' },
    }))
    await scaffold.whenTurnSettled()
    await browserAgent.whenIdle()

    const panel = page.locator('[data-question-kind="followup"]')
    await panel.waitFor({ timeout: 15_000 })
    const contextual = panel.locator('[data-question-source="context"]')
    const globals = panel.locator('[data-question-source="global"]')
    await expect.poll(() => contextual.count(), { timeout: 15_000 }).toBe(2)
    await expect.poll(() => globals.count(), { timeout: 15_000 }).toBe(2)
    const automatic = await contextual.allTextContents()
    expect(automatic).toEqual(GENERATIONS[0].map(question => question.zh))

    const sidebar = page.locator('[data-zhiwo-sidebar-shell="wide"]')
    await sidebar.waitFor({ timeout: 10_000 })
    expect(await sidebar.locator('[data-zhiwo-brand-name]').isVisible()).toBe(true)
    expect(await sidebar.locator('[data-zhiwo-brand-mark]').isVisible()).toBe(false)
    const collapse = sidebar.getByRole('button', { name: '收起侧边栏' })
    await collapse.hover()
    await page.waitForTimeout(600)
    const collapseTooltip = sidebar.locator('[role="tooltip"]', { hasText: '收起侧边栏' })
    expect(await collapseTooltip.isVisible()).toBe(false)

    await panel.getByRole('button', { name: '换一组' }).click()
    await expect.poll(async () => contextual.allTextContents(), { timeout: 15_000 })
      .toEqual(GENERATIONS[1].map(question => question.zh))
    const refreshed = await contextual.allTextContents()
    expect(await globals.count()).toBe(2)
    expect(requests).toHaveLength(2)
    expect(requests.map(request => ({
      provider: request.provider,
      model: request.model,
      purpose: request.purpose,
    }))).toEqual([
      { provider: 'deepseek-official', model: 'deepseek-v4-flash', purpose: 'suggestions' },
      { provider: 'deepseek-official', model: 'deepseek-v4-flash', purpose: 'suggestions' },
    ])
    expect(JSON.stringify(requests[1]?.messages)).toContain(GENERATIONS[0][0].zh)
    const logged = browserAgent.session.events.filter(event => event.type === 'zhiwo/question-llm-request')
    expect(logged).toHaveLength(2)
    expect(logged.map(event => event.data.turnEndSeq)).toEqual([logged[0]?.data.turnEndSeq, logged[0]?.data.turnEndSeq])

    const snapshot = [
      '## Automatic',
      ...automatic.map(question => `- ${question}`),
      '',
      '## Manual refresh',
      ...refreshed.map(question => `- ${question}`),
    ].join('\n')
    await compareOrRefreshGolden(QUESTIONS_EXPECTED, snapshot, MODE)
    expect(tripwire.warnings).toEqual([])
    expect(tripwire.pageErrors).toEqual([])
    await assertFixtureInventory(SNAPSHOT_DIR, ['questions.expected.md'])
  }, 90_000)
})
