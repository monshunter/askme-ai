/** Same-page preview for text documents exposed by the Zhiwo Host. */

import { useEffect, useState, useSyncExternalStore } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { CodeBlock, IconCloseOutline16, MarkdownText, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type {} from './locales.ts'
import { documentPreviewHref } from './document-preview-url.ts'
import css from './DocumentPreview.module.css'

/** Observable request selected by a document-link click. */
export interface DocumentPreviewState {
  /** Virtual Workspace path, or `null` while the dialog is closed. */
  readonly path: string | null
  /** Monotonic request identity used when retrying the same path. */
  readonly request: number
}

/** Root-scoped actions shared by the Workspace link handler and preview view. */
export interface DocumentPreviewController {
  /** Subscribe to preview selection changes. */
  readonly subscribe: (listener: () => void) => () => void
  /** Read the current preview selection. */
  readonly getSnapshot: () => DocumentPreviewState
  /** Open one virtual Workspace path. */
  readonly open: (path: string) => void
  /** Reload the selected path. */
  readonly retry: () => void
  /** Close the preview. */
  readonly close: () => void
}

/** Create one document-preview controller for the browser root. */
export function createDocumentPreviewController(): DocumentPreviewController {
  let state: DocumentPreviewState = { path: null, request: 0 }
  const listeners = new Set<() => void>()
  const update = (path: string | null): void => {
    state = { path, request: state.request + 1 }
    for (const listener of listeners) listener()
  }
  return {
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    getSnapshot: () => state,
    open: (path) => { update(path) },
    retry: () => { if (state.path !== null) update(state.path) },
    close: () => { update(null) },
  }
}

/** Injected root-scoped document-preview actions. */
export interface DocumentPreviewInjected {
  /** Controller owned by the Zhiwo client plugin. */
  preview: DocumentPreviewController
}

/** Full props for the localized document dialog. */
export type DocumentPreviewProps = DocumentPreviewInjected & PropsLocale<'zhiwo'>

type ReadyState =
  | { readonly status: 'ready'; readonly kind: 'markdown'; readonly content: string }
  | { readonly status: 'ready'; readonly kind: 'code'; readonly content: string; readonly lang?: string }
  | { readonly status: 'ready'; readonly kind: 'image'; readonly src: string }
  | { readonly status: 'ready'; readonly kind: 'pdf'; readonly src: string }

type LoadState =
  | { readonly status: 'idle' | 'loading' }
  | ReadyState
  | { readonly status: 'failed' }

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

function extension(path: string): string | undefined {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : undefined
}

function languageForPath(path: string): string | undefined {
  const ext = extension(path)
  if (ext === undefined) return undefined
  return ({
    yml: 'yaml',
    sh: 'bash',
    zsh: 'bash',
    mjs: 'javascript',
    cjs: 'javascript',
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    rb: 'ruby',
  } as Record<string, string>)[ext] ?? ext
}

function releaseObjectUrl(load: ReadyState): void {
  if (load.kind === 'image' || load.kind === 'pdf') URL.revokeObjectURL(load.src)
}

async function fetchDocument(path: string, signal: AbortSignal): Promise<ReadyState> {
  const href = documentPreviewHref(path)
  if (href === undefined) throw new Error('invalid Zhiwo document path')
  const response = await globalThis.fetch(href, {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { accept: 'text/plain, application/pdf, image/png, image/jpeg, image/gif, image/webp' },
    signal,
  })
  const mediaType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (!response.ok) throw new Error('Zhiwo document response was unavailable')
  if (mediaType === 'text/plain') {
    const content = await response.text()
    const ext = extension(path)
    const lang = languageForPath(path)
    return ext === 'md' || ext === 'markdown'
      ? { status: 'ready', kind: 'markdown', content }
      : { status: 'ready', kind: 'code', content, ...(lang !== undefined ? { lang } : {}) }
  }
  if (mediaType === 'application/pdf' || (mediaType !== undefined && IMAGE_TYPES.has(mediaType))) {
    const src = URL.createObjectURL(await response.blob())
    return mediaType === 'application/pdf'
      ? { status: 'ready', kind: 'pdf', src }
      : { status: 'ready', kind: 'image', src }
  }
  throw new Error('Zhiwo document response type was unavailable')
}

function DocumentGlyph() {
  return (
    <svg className={css.documentIcon} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.75 2.75h7.1l3.4 3.4v15.1H6.75z" />
      <path d="M13.75 2.75v3.5h3.5M9.25 10h5.5M9.25 13.5h5.5M9.25 17h4" />
    </svg>
  )
}

/** Render the selected document over the current conversation without navigation. */
export function DocumentPreview({ preview, t }: DocumentPreviewProps) {
  const selection = useSyncExternalStore(preview.subscribe, preview.getSnapshot, preview.getSnapshot)
  const [load, setLoad] = useState<LoadState>({ status: 'idle' })

  useEffect(() => {
    if (selection.path === null) {
      setLoad({ status: 'idle' })
      return
    }
    const controller = new AbortController()
    let objectLoad: ReadyState | undefined
    setLoad({ status: 'loading' })
    void fetchDocument(selection.path, controller.signal).then(
      (ready) => {
        if (controller.signal.aborted) {
          releaseObjectUrl(ready)
          return
        }
        objectLoad = ready
        setLoad(ready)
      },
      () => { if (!controller.signal.aborted) setLoad({ status: 'failed' }) },
    )
    return () => {
      controller.abort()
      if (objectLoad !== undefined) releaseObjectUrl(objectLoad)
    }
  }, [selection.path, selection.request])

  const title = selection.path?.slice(1) ?? ''
  return (
    <Modal
      open={selection.path !== null}
      onClose={preview.close}
      title={title}
      closeLabel={t('document.close')}
      className={css.dialog ?? ''}
      headless
    >
      <div className={css.surface}>
        <header className={css.header}>
          <div className={css.title}>
            <DocumentGlyph />
            <span>{title}</span>
          </div>
          <button type="button" className={css.close} aria-label={t('document.close')} onClick={preview.close}>
            <IconCloseOutline16 size={20} />
          </button>
        </header>
        <div className={css.viewport} aria-busy={load.status === 'loading'}>
          {load.status === 'loading' && <div className={css.status} role="status">{t('document.loading')}</div>}
          {load.status === 'failed' && (
            <div className={css.failure} role="alert">
              <span>{t('document.error')}</span>
              <button type="button" className={css.retry} onClick={preview.retry}>{t('document.retry')}</button>
            </div>
          )}
          {load.status === 'ready' && load.kind === 'markdown' && (
            <div className={css.markdown}><MarkdownText text={load.content} /></div>
          )}
          {load.status === 'ready' && load.kind === 'code' && (
            <div className={css.code}>
              <CodeBlock
                code={load.content}
                lang={load.lang}
                copyLabel={t('document.copy')}
                copiedLabel={t('document.copied')}
              />
            </div>
          )}
          {load.status === 'ready' && load.kind === 'image' && (
            <div className={css.media}><img src={load.src} alt={t('document.image', { name: title })} /></div>
          )}
          {load.status === 'ready' && load.kind === 'pdf' && (
            <iframe className={css.pdf} src={load.src} title={t('document.pdf', { name: title })} sandbox="" />
          )}
        </div>
      </div>
    </Modal>
  )
}
