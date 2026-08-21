/** Zhiwo's Workspace-free projection of the native Session list. */

import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from './locales.ts'
import css from './SessionBrowser.module.css'

/** Native Session navigation supplied by the Zhiwo client plugin. */
export interface SessionBrowserInjected {
  /** Open one visitor-owned Session. */
  open: (sessionId: SessionId) => void
}

/** Root-slot props for the opaque single-Workspace Session list. */
export type SessionBrowserProps =
  PropsRuntime<'sidebar.workspaces'> & SessionBrowserInjected & PropsLocale<'zhiwo'>

/** Render visitor-owned conversations without exposing the underlying Workspace. */
export function SessionBrowser({ wide, useSessions, useWorkspaces, open, t }: SessionBrowserProps) {
  const sessions = useSessions(state => state)
  const archived = useWorkspaces(state => state.archivedSessionIds)
  if (!wide) return null
  const hidden = new Set(archived)
  const rows = sessions.ids.flatMap((id) => {
    const summary = sessions.byId[id]
    return summary === undefined || summary.origin === 'subagent' || hidden.has(summary.id) ? [] : [summary]
  })

  return (
    <nav className={css.root} aria-label={t('history.aria')}>
      <div className={css.heading}>{t('history.heading')}</div>
      <div className={css.list}>
        {rows.map(summary => (
          <button
            key={summary.id}
            type="button"
            className={summary.id === sessions.current ? `${css.row} ${css.selected}` : css.row}
            aria-current={summary.id === sessions.current ? 'page' : undefined}
            onClick={() => { open(summary.id) }}
          >
            <span className={css.title}>{summary.blank ? t('session.new') : summary.displayTitle}</span>
            {summary.running && <span className={css.running} aria-label={t('session.running')} />}
          </button>
        ))}
      </div>
    </nav>
  )
}
