// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { ZhiwoBrandMark, ZhiwoBrandName } from '../src/client/Brand.tsx'
import {
  DocumentPreview,
  type DocumentPreviewInjected,
} from '../src/client/DocumentPreview.tsx'
import { ZhiwoGreeting, type ZhiwoGreetingProps } from '../src/client/Greeting.tsx'
import { apply, documentPreviewHref, inject } from '../src/client/index.ts'
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
  'shell.overlay',
] as const

const documentT = (key: string, params?: Record<string, unknown>): string => ({
  'document.close': '关闭文档预览',
  'document.loading': '正在加载文档…',
  'document.error': '无法加载这份文档。',
  'document.retry': '重试',
  'document.copy': '复制',
  'document.copied': '复制成功',
  'document.image': `图片：${String(params?.['name'])}`,
  'document.pdf': `PDF：${String(params?.['name'])}`,
})[key] ?? key

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
    children: Object.fromEntries(HOLES.map(name => [name,
      name === 'conversation.input.dock'
        ? { kind: 'list', scope: 'session' }
        : name === 'shell.overlay'
          ? { kind: 'list', scope: 'root' }
          : { kind: 'single', scope: 'root' },
    ])),
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

  it('opens conversation documents in a bounded same-page dialog', async () => {
    const subject = await bench()
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      '# Owner profile\n\nVisible inside the dialog.',
      { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    ))
    const fallback = vi.fn(() => Promise.resolve(false))
    const fiber = subject.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const entry = subject.slots.entries('shell.overlay')[0]!
    expect(entry.component).toBe(DocumentPreview)
    const injected = (entry.inject as unknown as () => DocumentPreviewInjected)()
    render(<DocumentPreview {...{
      ...injected,
      t: documentT,
    }} />)
    const location = window.location.href

    await act(async () => {
      await expect(subject.ctx.waterfall(
        'workspaces/open-path',
        '/easyinterview/README.md',
        fallback,
      )).resolves.toBe(true)
    })
    expect(await screen.findByRole('dialog', { name: 'easyinterview/README.md' })).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Owner profile' })).toBeTruthy()
    expect(fetch).toHaveBeenCalledWith(
      '/api/zhiwo/document?path=%2Feasyinterview%2FREADME.md',
      expect.objectContaining({ cache: 'no-store', credentials: 'same-origin' }),
    )
    expect(open).not.toHaveBeenCalled()
    expect(window.location.href).toBe(location)
    expect(fallback).toHaveBeenCalledOnce()
    expect(documentPreviewHref('relative.md')).toBeUndefined()

    fireEvent.click(screen.getByRole('button', { name: '关闭文档预览' }))
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })

    fetch.mockRestore()
    open.mockRestore()
    await fiber.dispose()
  })

  it('rejects an SPA fallback response instead of rendering the chat page as a document', async () => {
    const subject = await bench()
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      '<html><main>current chat</main></html>',
      { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
    ))
    const fiber = subject.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const entry = subject.slots.entries('shell.overlay')[0]!
    const injected = (entry.inject as unknown as () => DocumentPreviewInjected)()
    render(<DocumentPreview {...{
      ...injected,
      t: documentT,
    }} />)

    await act(async () => {
      await subject.ctx.waterfall('workspaces/open-path', '/profile.md', () => Promise.resolve(false))
    })
    expect((await screen.findByRole('alert')).textContent).toContain('无法加载这份文档。')
    expect(screen.queryByText('current chat')).toBeNull()

    fetch.mockRestore()
    await fiber.dispose()
  })

  it('renders source, raster image, and PDF responses with type-specific views', async () => {
    const subject = await bench()
    const fetch = vi.spyOn(globalThis, 'fetch')
    const createObjectURL = vi.fn()
      .mockReturnValueOnce('blob:preview-image')
      .mockReturnValueOnce('blob:preview-pdf')
    const revokeObjectURL = vi.fn()
    const previousCreateObjectURL = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
    const previousRevokeObjectURL = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
    Object.defineProperties(URL, {
      createObjectURL: { configurable: true, value: createObjectURL },
      revokeObjectURL: { configurable: true, value: revokeObjectURL },
    })
    const fiber = subject.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const entry = subject.slots.entries('shell.overlay')[0]!
    const injected = (entry.inject as unknown as () => DocumentPreviewInjected)()
    render(<DocumentPreview {...{
      ...injected,
      t: documentT,
    }} />)

    fetch.mockResolvedValueOnce(new Response('export const answer = 42\n', {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    }))
    await act(async () => { injected.preview.open('/src/answer.ts') })
    await waitFor(() => {
      expect(document.querySelector('pre')?.textContent).toBe('export const answer = 42')
    })
    fireEvent.click(screen.getByRole('button', { name: '关闭文档预览' }))

    fetch.mockResolvedValueOnce(new Response(Uint8Array.of(1, 2, 3), {
      status: 200,
      headers: { 'content-type': 'image/png' },
    }))
    await act(async () => { injected.preview.open('/images/diagram.png') })
    expect((await screen.findByRole('img', { name: '图片：images/diagram.png' })).getAttribute('src'))
      .toBe('blob:preview-image')
    fireEvent.click(screen.getByRole('button', { name: '关闭文档预览' }))
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-image')

    fetch.mockResolvedValueOnce(new Response('%PDF-1.4', {
      status: 200,
      headers: { 'content-type': 'application/pdf' },
    }))
    await act(async () => { injected.preview.open('/documents/profile.pdf') })
    expect((await screen.findByTitle('PDF：documents/profile.pdf')).getAttribute('src')).toBe('blob:preview-pdf')
    fireEvent.click(screen.getByRole('button', { name: '关闭文档预览' }))
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-pdf')

    fetch.mockRestore()
    if (previousCreateObjectURL === undefined) delete (URL as { createObjectURL?: unknown }).createObjectURL
    else Object.defineProperty(URL, 'createObjectURL', previousCreateObjectURL)
    if (previousRevokeObjectURL === undefined) delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL
    else Object.defineProperty(URL, 'revokeObjectURL', previousRevokeObjectURL)
    await fiber.dispose()
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
