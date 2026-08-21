// Keyless browser snapshot for the Zhiwo destructive Session lifecycle. The
// real shipped Web composition and JSONL persistence run over HTTP; the model
// response reuses the Zhiwo preset's recorded fixture without another API call.
import { stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-session-title'
import type {} from '@deepseek-ai/dsh-workspace'
import {
  acknowledgeReloadConnectionLoss,
  assertFixtureInventory,
  captureStableAria,
  compareOrRefreshGolden,
  launchWebScaffold,
  watchConsole,
  webSnapshotMode,
  type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const OVERLAY = join(REPO_ROOT, 'packages/zhiwo/product/cordis.patch.yml')
const FIXTURE = fileURLToPath(new URL('./snapshots/zhiwo-preset/session.jsonl', import.meta.url))
const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/zhiwo-session-delete', import.meta.url))
const DELETE_DIALOG_EXPECTED = join(SNAPSHOT_DIR, 'dialog.expected.md')
const MODE = webSnapshotMode()
const PROMPT = '请介绍一下你自己。'
const TITLE = 'Deletion acceptance'

describe('Zhiwo session deletion browser snapshot', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

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
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    const failures: unknown[] = []
    await browser?.close().catch((error: unknown) => failures.push(error))
    await scaffold?.close().catch((error: unknown) => failures.push(error))
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) throw new AggregateError(failures, 'Zhiwo deletion browser teardown failed')
  })

  it('confirms deletion, removes the durable log, and stays absent after reload', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-zhiwo-session-delete'))
    const composer = page.locator(
      'textarea:enabled[placeholder="Ask about my experience, projects, strengths, or plans"]',
    )
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
    scaffold.ctx.sessionTitle.rename(browserAgent.session, TITLE)
    await scaffold.ctx.sessions.flush(browserAgent.session)
    const history = page.getByRole('navigation', { name: 'Session history' })
    await history.getByRole('button', { name: TITLE, exact: true }).waitFor({ timeout: 10_000 })

    await expect.poll(
      async () => (await scaffold.ctx.sessionPersistence.list()).filter(header => header.agentPreset === 'zhiwo').length,
      { timeout: 10_000 },
    ).toBe(1)
    const target = (await scaffold.ctx.sessionPersistence.list()).find(header => header.agentPreset === 'zhiwo')
    if (target === undefined) throw new Error('Zhiwo browser Session did not materialize')
    const location = scaffold.ctx.sessionPersistence.locate(target)
    if (location === undefined) throw new Error('Zhiwo JSONL Session has no durable artifact location')
    await stat(location.path)

    const deleteButton = page.getByRole('button', { name: /^Delete “/ }).first()
    await deleteButton.waitFor({ timeout: 10_000 })
    await deleteButton.click()
    const dialog = page.getByRole('dialog', { name: 'Delete session?' })
    await dialog.waitFor({ timeout: 10_000 })
    const dialogSnapshot = (await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd))
      .split(String(target.id)).join('{{sessionId}}')
    await compareOrRefreshGolden(DELETE_DIALOG_EXPECTED, dialogSnapshot, MODE)
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect.poll(() => ({
      agent: scaffold.ctx.agents.get(target.id) !== undefined,
      session: scaffold.ctx.sessions.get(target.id) !== undefined,
    }), { timeout: 10_000 }).toEqual({ agent: false, session: false })
    await dialog.waitFor({ state: 'hidden', timeout: 15_000 })

    expect(scaffold.ctx.sessions.get(target.id)).toBeUndefined()
    expect((await scaffold.ctx.sessionPersistence.list()).map(header => header.id)).not.toContain(target.id)
    expect(scaffold.ctx.workspaceRegistry.list().flatMap(workspace => workspace.sessionIds)).not.toContain(target.id)
    await expect(stat(location.path)).rejects.toMatchObject({ code: 'ENOENT' })

    const warningStart = tripwire.warnings.length
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    acknowledgeReloadConnectionLoss(tripwire, warningStart)
    await expect.poll(
      () => history.getByRole('button', { name: TITLE, exact: true }).count(),
      { timeout: 15_000 },
    ).toBe(0)
    expect((await scaffold.ctx.sessionPersistence.list()).map(header => header.id)).not.toContain(target.id)
    expect(tripwire.pageErrors).toEqual([])
    await assertFixtureInventory(SNAPSHOT_DIR, ['dialog.expected.md'])
  }, 90_000)
})
