/** Zhiwo occupants for the native dsh web brand slots. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { ZhiwoBrandMark, ZhiwoBrandName } from './Brand.tsx'
import { ZhiwoGreeting } from './Greeting.tsx'
import { ZhiwoLanguageAction, type ZhiwoLanguageInjected } from './LanguageAction.tsx'
import { SessionBrowser, type SessionBrowserInjected } from './SessionBrowser.tsx'
import { en, zh } from './locales.ts'
import './zhiwo.css'

/** Required services: native presentation and Workspace/Session runtimes. */
export const inject = ['slots', 'sessions', 'workspaces', 'locale']

/** Dictionary namespace owned by the Zhiwo overlay. */
const NS = 'zhiwo'

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

/**
 * Install the Zhiwo brand and native default-Workspace selection.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'zhiwo-ui: dictionaries')
  ctx.effect(() => startDefaultWorkspace(ctx), 'zhiwo-ui: default Workspace selection')

  ctx.slots.inject('sidebar.workspaces', () => ctx.slots.register({
    name: 'sidebar.workspaces',
    locale: NS,
    inject: (): SessionBrowserInjected => ({ open: (sessionId) => { ctx.sessions.open(sessionId) } }),
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
      ctx.slots.inject('conversation.hero.brand.mark', () =>
        ctx.slots.inject('conversation.hero.headline', function* () {
          yield ctx.slots.register({ name: 'sidebar.brand.mark' }, ZhiwoBrandMark)
          yield ctx.slots.register({ name: 'sidebar.brand.name', locale: NS }, ZhiwoBrandName)
          yield ctx.slots.register({ name: 'conversation.hero.brand.mark' }, ZhiwoBrandMark)
          yield ctx.slots.register({ name: 'conversation.hero.headline', locale: NS }, ZhiwoGreeting)
        }))))
}
