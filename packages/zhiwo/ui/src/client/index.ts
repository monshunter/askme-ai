/** Zhiwo occupants for the native dsh web brand slots. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
import { ZhiwoBrandMark, ZhiwoBrandName, ZhiwoGithubAction } from './Brand.tsx'
import {
  createDocumentPreviewController,
  DocumentPreview,
  type DocumentPreviewInjected,
} from './DocumentPreview.tsx'
import { documentPreviewHref } from './document-preview-url.ts'
import { ZhiwoGreeting, ZhiwoHeroMarkPlaceholder } from './Greeting.tsx'
import { ZhiwoLanguageAction, type ZhiwoLanguageInjected } from './LanguageAction.tsx'
import { SessionBrowser, type SessionBrowserInjected } from './SessionBrowser.tsx'
import { QuestionSuggestions, type QuestionSuggestionsInjected } from './QuestionSuggestions.tsx'
import type { QuestionRequest } from './question-contract.ts'
import { en, zh } from './locales.ts'
import './zhiwo.css'

export { documentPreviewHref } from './document-preview-url.ts'

/** Required services: native presentation and Workspace/Session runtimes. */
export const inject = ['slots', 'sessions', 'workspaces', 'locale', 'connection', 'layout', 'theme']

/** Dictionary namespace owned by the Zhiwo overlay. */
const NS = 'zhiwo'

/** Browser-tab title shared by blank and titled Zhiwo Sessions. */
const DOCUMENT_TITLE = 'AskmeAI | 知我AI'

/** Keep the product on its single supported light palette. */
function installLightTheme(ctx: ClientContext): () => void {
  const enforce = (snapshot: ThemeSnapshot): void => {
    if (snapshot.preference !== 'light') ctx.theme.setTheme('light')
  }
  enforce(ctx.theme.getTheme())
  return ctx.on('theme/change', enforce)
}

/** Connect a clean browser to Zhiwo's sole Workspace through the native runtime. */
function startDefaultWorkspace(ctx: ClientContext): () => void {
  let active = true
  let started = false
  const reconcile = (): void => {
    if (!active || started) return
    const workspaces = ctx.workspaces.list.getSnapshot()
    const [workspace] = workspaces.items
    if (!workspaces.baselinesReady || workspace === undefined || workspaces.items.length !== 1) return
    if (ctx.sessions.list.getSnapshot().current !== undefined) {
      started = true
      return
    }
    started = true
    void ctx.workspaces.connectWorkspace(workspace.workspaceId).then(
      (sessionId) => {
        if (active && ctx.sessions.list.getSnapshot().current === undefined) ctx.sessions.open(sessionId)
      },
      (reason: unknown) => {
        if (!active) return
        started = false
        console.warn('zhiwo default Workspace connection failed:', reason)
      },
    )
  }
  const unsubscribeWorkspace = ctx.workspaces.list.subscribe(reconcile)
  const unsubscribeSession = ctx.sessions.list.subscribe(reconcile)
  reconcile()
  return () => {
    active = false
    unsubscribeWorkspace()
    unsubscribeSession()
  }
}

/** Apply product presentation details that sit outside the registered Zhiwo slot occupants. */
function installProductPresentation(ctx: ClientContext): () => void {
  if (typeof document === 'undefined') return () => undefined
  const body = document.body
  const previous = body.getAttribute('data-zhiwo-ui')
  body.setAttribute('data-zhiwo-ui', '')
  const layout = ctx.get('layout')
  let desiredCollapsed: boolean | undefined
  let waiting = false
  let scheduled = false
  let disposed = false

  const reconcile = (): void => {
    scheduled = false
    if (disposed) return
    const frame = document.querySelector<HTMLElement>('[data-details-collapsed]')
    if (frame === null) return
    const collapsed = frame.hasAttribute('data-sidebar-collapsed')
    const sidebarState = collapsed ? 'rail' : 'wide'
    frame.setAttribute('data-zhiwo-sidebar-state', sidebarState)
    const shell = frame.querySelector<HTMLElement>('[data-slot="sidebar"]')?.firstElementChild
    if (shell instanceof HTMLElement) shell.setAttribute('data-zhiwo-sidebar-shell', sidebarState)
    const chinese = document.documentElement.lang.startsWith('zh')
    for (const status of document.querySelectorAll<HTMLElement>('[data-turn-status]')) {
      status.setAttribute('data-zhiwo-localized-status', '')
      status.setAttribute('aria-label', chinese
        ? '知我正在深入了解…'
        : 'AskmeAI is getting to know this better…')
    }
    if (!waiting || layout === undefined || window.innerWidth < 900) {
      waiting = false
      return
    }
    if (desiredCollapsed === undefined) return
    if (collapsed === desiredCollapsed) {
      waiting = false
      return
    }
    layout.toggleSidebar()
  }
  const schedule = (): void => {
    if (scheduled || disposed) return
    scheduled = true
    queueMicrotask(reconcile)
  }
  const syncSession = (): void => {
    const sessions = ctx.sessions.list.getSnapshot()
    const summary = sessions.current === undefined ? undefined : sessions.byId[sessions.current]
    const next = sessions.current === undefined ? true : summary?.blank
    if (next === undefined || next === desiredCollapsed) return
    desiredCollapsed = next
    waiting = true
    schedule()
  }

  const observer = new MutationObserver(schedule)
  observer.observe(document.getElementById('root') ?? body, {
    attributeFilter: ['data-sidebar-collapsed'],
    attributes: true,
    childList: true,
    subtree: true,
  })
  const localeObserver = new MutationObserver(schedule)
  localeObserver.observe(document.documentElement, { attributeFilter: ['lang'], attributes: true })
  const unsubscribe = ctx.sessions.list.subscribe(syncSession)
  syncSession()
  schedule()
  return () => {
    disposed = true
    observer.disconnect()
    localeObserver.disconnect()
    unsubscribe()
    document.querySelector<HTMLElement>('[data-zhiwo-sidebar-state]')
      ?.removeAttribute('data-zhiwo-sidebar-state')
    for (const shell of document.querySelectorAll<HTMLElement>('[data-zhiwo-sidebar-shell]')) {
      shell.removeAttribute('data-zhiwo-sidebar-shell')
    }
    for (const status of document.querySelectorAll<HTMLElement>('[data-zhiwo-localized-status]')) {
      status.removeAttribute('data-zhiwo-localized-status')
      status.removeAttribute('aria-label')
    }
    if (previous === null) body.removeAttribute('data-zhiwo-ui')
    else body.setAttribute('data-zhiwo-ui', previous)
  }
}

/**
 * Install the Zhiwo brand and native default-Workspace selection.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  const documentPreview = createDocumentPreviewController()
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'zhiwo-ui: dictionaries')
  ctx.effect(() => installLightTheme(ctx), 'zhiwo-ui: fixed light theme')
  ctx.effect(() => startDefaultWorkspace(ctx), 'zhiwo-ui: default Workspace selection')
  ctx.effect(() => installProductPresentation(ctx), 'zhiwo-ui: product presentation')
  ctx.on('ui/product-title', (next) => {
    next()
    return zh['brand.name']
  })
  ctx.on('ui/document-title', (_sessionTitle, _productTitle, next) => {
    next()
    return DOCUMENT_TITLE
  })
  const t = ctx.locale.bind(NS)
  const connection = ctx.get('connection') as unknown as ConnectionHandle | undefined
  if (connection === undefined) throw new Error('zhiwo-ui: Connection service is unavailable')

  ctx.on('conversation/placeholder', (_kind, next) => {
    next()
    return t('placeholder.message')
  })

  ctx.on('workspaces/open-path', async (path, next) => {
    const handled = await next()
    if (handled) return true
    const href = documentPreviewHref(path)
    if (href === undefined) throw new Error('Zhiwo refused an invalid document path')
    documentPreview.open(path)
    return true
  })

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'zhiwo-document-preview',
    order: 10,
    locale: NS,
    inject: (): DocumentPreviewInjected => ({ preview: documentPreview }),
  }, DocumentPreview))

  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'zhiwo-questions',
    order: 30,
    locale: NS,
    inject: (): QuestionSuggestionsInjected => ({
      hooks: { locale: ctx.locale },
      requestQuestions: (request: QuestionRequest, signal) =>
        connection.rpc.call('/api', 'zhiwo/questions', { args: { request } }, signal),
    }),
  }, QuestionSuggestions))

  ctx.slots.inject('sidebar.workspaces', () => ctx.slots.register({
    name: 'sidebar.workspaces',
    locale: NS,
    inject: (): SessionBrowserInjected => ({
      open: (sessionId) => { ctx.sessions.open(sessionId) },
      remove: sessionId => ctx.sessions.delete(sessionId),
    }),
  }, SessionBrowser))

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'zhiwo-language',
    locale: NS,
    inject: (): ZhiwoLanguageInjected => ({
      hooks: { locale: ctx.locale },
      setLocale: (id) => { ctx.locale.setLocale(id) },
    }),
  }, ZhiwoLanguageAction))

  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', () =>
      ctx.slots.inject('sidebar.brand.action', () =>
        ctx.slots.inject('conversation.hero.brand.mark', () =>
          ctx.slots.inject('conversation.hero.headline', function* () {
            yield ctx.slots.register({ name: 'sidebar.brand.mark' }, ZhiwoBrandMark)
            yield ctx.slots.register({ name: 'sidebar.brand.name', locale: NS }, ZhiwoBrandName)
            yield ctx.slots.register({ name: 'sidebar.brand.action', locale: NS }, ZhiwoGithubAction)
            yield ctx.slots.register({ name: 'conversation.hero.brand.mark' }, ZhiwoHeroMarkPlaceholder)
            yield ctx.slots.register({ name: 'conversation.hero.headline', locale: NS }, ZhiwoGreeting)
          })))))
}
