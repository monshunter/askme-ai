/** Zhiwo's Workspace-free projection of the native Session list. */

import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { Button, IconTrashOutline16, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { useState } from 'react'
import type {} from './locales.ts'
import css from './SessionBrowser.module.css'

/** Native Session navigation supplied by the Zhiwo client plugin. */
export interface SessionBrowserInjected {
  /** Open one visitor-owned Session. */
  open: (sessionId: SessionId) => void
  /** Permanently delete one visitor-owned Session. */
  remove: (sessionId: SessionId) => Promise<void>
}

/** Root-slot props for the opaque single-Workspace Session list. */
export type SessionBrowserProps =
  PropsRuntime<'sidebar.workspaces'> & SessionBrowserInjected & PropsLocale<'zhiwo'>

/** Render visitor-owned conversations without exposing the underlying Workspace. */
export function SessionBrowser({
  wide, expandSidebar, useSessions, useWorkspaces, open, remove, t,
}: SessionBrowserProps) {
  const sessions = useSessions(state => state)
  const archived = useWorkspaces(state => state.archivedSessionIds)
  const [deleteTarget, setDeleteTarget] = useState<{ id: SessionId; title: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  if (!wide) {
    return (
      <button
        type="button"
        className={css.railHistory}
        data-zhiwo-history-rail
        aria-label={t('history.heading')}
        onClick={expandSidebar}
      >
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M5 5h14v11H9l-4 3v-3H5z" />
        </svg>
      </button>
    )
  }
  const hidden = new Set(archived)
  const rows = sessions.ids.flatMap((id) => {
    const summary = sessions.byId[id]
    return summary === undefined || summary.origin === 'subagent' || hidden.has(summary.id) ? [] : [summary]
  })

  const closeDelete = (): void => {
    if (deleting) return
    setDeleteTarget(null)
    setDeleteError(null)
  }
  const confirmDelete = (): void => {
    if (deleteTarget === null || deleting) return
    const sessionId = deleteTarget.id
    setDeleting(true)
    setDeleteError(null)
    void (async () => {
      try {
        await remove(sessionId)
        setDeleteTarget(null)
      } catch {
        setDeleteError(t('session.delete.error'))
      } finally {
        setDeleting(false)
      }
    })()
  }

  return (
    <>
      <nav className={css.root} data-zhiwo-session-browser aria-label={t('history.aria')}>
        <div className={css.heading}>{t('history.heading')}</div>
        <div className={css.list}>
          {rows.map((summary) => {
            const title = summary.blank ? t('session.new') : summary.displayTitle
            return (
              <div
                key={summary.id}
                className={summary.id === sessions.current ? `${css.row} ${css.selected}` : css.row}
              >
                <button
                  type="button"
                  className={css.rowMain}
                  aria-current={summary.id === sessions.current ? 'page' : undefined}
                  onClick={() => { open(summary.id) }}
                >
                  <span className={css.title}>{title}</span>
                  {summary.running && <span className={css.running} aria-label={t('session.running')} />}
                </button>
                <button
                  type="button"
                  className={css.deleteIcon}
                  aria-label={t('session.delete.label', { title })}
                  onClick={() => {
                    setDeleteTarget({ id: summary.id, title })
                    setDeleteError(null)
                  }}
                >
                  <IconTrashOutline16 size={14} />
                </button>
              </div>
            )
          })}
        </div>
      </nav>
      <Modal
        open={deleteTarget !== null}
        onClose={closeDelete}
        closeLabel={t('session.delete.close')}
        title={t('session.delete.title')}
        {...deleteTarget === null
          ? {}
          : { description: t('session.delete.description', { title: deleteTarget.title }) }}
        footer={(
          <>
            <Button variant="outline" disabled={deleting} onClick={closeDelete}>
              {t('session.delete.cancel')}
            </Button>
            <Button
              variant="outline"
              className={css.deleteAction}
              disabled={deleting}
              onClick={confirmDelete}
            >
              {t('session.delete.confirm')}
            </Button>
          </>
        )}
      >
        {deleting && <div className={css.deleteStatus} role="status">{t('session.delete.pending')}</div>}
        {deleteError !== null && <div className={css.deleteError} role="alert">{deleteError}</div>}
      </Modal>
    </>
  )
}
