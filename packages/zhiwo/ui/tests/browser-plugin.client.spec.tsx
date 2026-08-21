// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { cleanup, render } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { ZhiwoBrandMark, ZhiwoBrandName } from '../src/client/Brand.tsx'
import { ZhiwoGreeting, type ZhiwoGreetingProps } from '../src/client/Greeting.tsx'
import { apply, inject } from '../src/client/index.ts'
import { ZhiwoLanguageAction, type ZhiwoLanguageActionProps } from '../src/client/LanguageAction.tsx'
import { SessionBrowser, type SessionBrowserProps } from '../src/client/SessionBrowser.tsx'

afterEach(() => { cleanup() })

const HOLES = [
  'sidebar.brand.mark',
  'sidebar.brand.name',
  'sidebar.workspaces',
  'sidebar.footer.action',
  'conversation.hero.brand.mark',
  'conversation.hero.headline',
  'conversation.input.dock',
] as const

async function bench(clean = false) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  ctx.provide('locale', new LocaleRuntime(ctx))
  const workspaceState = {
    baselinesReady: true,
    items: [{ workspaceId: 'userdata' }],
  }
  const sessionState = { current: clean ? undefined : 'existing' }
  const connectWorkspace = vi.fn(() => Promise.resolve('zhiwo-session'))
  const open = vi.fn()
  ctx.reflect.provide('workspaces', {
    list: { getSnapshot: () => workspaceState, subscribe: () => () => undefined },
    connectWorkspace,
  })
  ctx.reflect.provide('sessions', {
    list: { getSnapshot: () => sessionState, subscribe: () => () => undefined },
    open,
  })
  ctx.reflect.provide('connection', {
    rpc: { call: vi.fn() },
  })
  slots.register({
    name: 'root',
    children: Object.fromEntries(HOLES.map(name => [name, name === 'conversation.input.dock'
      ? { kind: 'list', scope: 'session' }
      : { kind: 'single', scope: 'root' }])),
  } as never, () => null)
  return { ctx, slots, connectWorkspace, open }
}

describe('Zhiwo browser shell', () => {
  it('declares the native services used by the browser overlay', () => {
    expect(inject).toEqual(['slots', 'sessions', 'workspaces', 'locale', 'connection'])
  })

  it('fills the native brand slots and removes them on teardown', async () => {
    const subject = await bench()
    const fiber = subject.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()

    for (const hole of HOLES) expect(subject.slots.entries(hole)).toHaveLength(1)

    await fiber.dispose()
    for (const hole of HOLES) expect(subject.slots.entries(hole)).toHaveLength(0)
  })

  it('connects a clean browser to the sole Workspace through native runtimes', async () => {
    const subject = await bench(true)
    const fiber = subject.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    await Promise.resolve()

    expect(subject.connectWorkspace).toHaveBeenCalledWith('userdata')
    expect(subject.open).toHaveBeenCalledWith('zhiwo-session')

    await fiber.dispose()
  })

  it('replaces only Zhiwo message placeholders and releases the interception on teardown', async () => {
    const subject = await bench()
    const locale = subject.ctx.get('locale') as LocaleRuntime
    locale.setLocale('zh')
    const fiber = subject.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()

    expect(subject.ctx.waterfall('conversation/placeholder', 'hero', () => 'generic hero'))
      .toBe('问问我的经历、项目、能力或计划')
    expect(subject.ctx.waterfall('conversation/placeholder', 'default', () => 'generic default'))
      .toBe('问问我的经历、项目、能力或计划')

    await fiber.dispose()
    expect(subject.ctx.waterfall('conversation/placeholder', 'hero', () => 'generic hero')).toBe('generic hero')
  })

  it('replaces the browser product title without retaining DSH wording', async () => {
    const subject = await bench()
    const fiber = subject.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()

    expect(subject.ctx.waterfall('ui/product-title', () => 'DSH Local Build')).toBe('知我AI')

    await fiber.dispose()
    expect(subject.ctx.waterfall('ui/product-title', () => 'DSH Local Build')).toBe('DSH Local Build')
  })

  it('renders the requested mark size and localized product names', () => {
    const mark = render(<ZhiwoBrandMark size={34} className="hero-mark" />)
    expect(mark.container.querySelector('svg')?.getAttribute('width')).toBe('34')
    expect(mark.container.querySelector('svg')?.getAttribute('class')).toBe('hero-mark')
    mark.unmount()

    const chineseName = { t: () => '知我AI' } as unknown as ComponentProps<typeof ZhiwoBrandName>
    const englishName = { t: () => 'AskmeAI' } as unknown as ComponentProps<typeof ZhiwoBrandName>
    expect(render(<ZhiwoBrandName {...chineseName} />).getByText('知我AI')).toBeTruthy()
    expect(render(<ZhiwoBrandName {...englishName} />).getByText('AskmeAI')).toBeTruthy()
  })

  it('renders the localized greeting without the generic preview headline', () => {
    const view = render(<ZhiwoGreeting {...{
      className: 'headline',
      t: () => '你好，欢迎来了解我',
    } as unknown as ZhiwoGreetingProps} />)

    expect(view.getByText('你好，欢迎来了解我').getAttribute('class')).toBe('headline')
    expect(view.queryByText('探索未至之境')).toBeNull()
    expect(view.queryByText('预览版')).toBeNull()
  })

  it('renders a visible language action and switches to the other shipped locale', () => {
    const setLocale = vi.fn()
    const snapshot = {
      active: 'zh',
      locales: [{ id: 'zh', label: '中文' }, { id: 'en', label: 'English' }],
      revision: 0,
    }
    const view = render(<ZhiwoLanguageAction {...{
      wide: true,
      useLocale: (select: (value: unknown) => unknown) => select(snapshot),
      setLocale,
      t: (key: string, params?: Record<string, unknown>) => key === 'language.label'
        ? '语言'
        : `切换为${String(params?.language)}`,
    } as unknown as ZhiwoLanguageActionProps} />)

    expect(view.getByText('语言')).toBeTruthy()
    expect(view.getByText('English')).toBeTruthy()
    view.getByRole('button', { name: '切换为English' }).click()
    expect(setLocale).toHaveBeenCalledWith('en')
  })

  it('projects native Sessions without any Workspace controls or labels', () => {
    const open = vi.fn()
    const sessions = {
      ids: ['current', 'history'],
      byId: {
        current: { id: 'current', displayTitle: 'userdata', blank: true, running: false },
        history: { id: 'history', displayTitle: 'Ferry 项目简介', blank: false, running: false },
      },
      current: 'current',
    }
    const view = render(<SessionBrowser {...{
      wide: true,
      expandSidebar: () => {},
      useSessions: (select: (value: unknown) => unknown) => select(sessions),
      useWorkspaces: (select: (value: unknown) => unknown) => select({ archivedSessionIds: [] }),
      open,
      t: (key: string) => ({
        'history.aria': '历史会话',
        'history.heading': '历史会话',
        'session.new': '新会话',
        'session.running': '进行中',
      })[key] ?? key,
    } as unknown as SessionBrowserProps} />)

    expect(view.getByRole('navigation', { name: '历史会话' })).toBeTruthy()
    expect(view.getByText('新会话')).toBeTruthy()
    expect(view.queryByText('userdata')).toBeNull()
    expect(view.queryByText('工作区')).toBeNull()
    expect(view.queryByText('未分组')).toBeNull()
    view.getByRole('button', { name: 'Ferry 项目简介' }).click()
    expect(open).toHaveBeenCalledWith('history')
  })

  it('renders the flat Session history in English', () => {
    const view = render(<SessionBrowser {...{
      wide: true,
      expandSidebar: () => {},
      useSessions: (select: (value: unknown) => unknown) => select({
        ids: ['current'],
        byId: { current: { id: 'current', displayTitle: 'userdata', blank: true, running: true } },
        current: 'current',
      }),
      useWorkspaces: (select: (value: unknown) => unknown) => select({ archivedSessionIds: [] }),
      open: () => {},
      t: (key: string) => ({
        'history.aria': 'Session history',
        'history.heading': 'History',
        'session.new': 'New Session',
        'session.running': 'Running',
      })[key] ?? key,
    } as unknown as SessionBrowserProps} />)

    expect(view.getByRole('navigation', { name: 'Session history' })).toBeTruthy()
    expect(view.getByText('History')).toBeTruthy()
    expect(view.getByText('New Session')).toBeTruthy()
    expect(view.getByLabelText('Running')).toBeTruthy()
  })
})
