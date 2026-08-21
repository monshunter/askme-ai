/** Rotating welcome and post-answer questions for the native Zhiwo composer. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LocaleSnapshot } from '@deepseek-ai/dsh-client-locale/client'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { RpcResult } from '@deepseek-ai/dsh-client-connection/client'
import { IconChevronRightOutline14, IconRefreshOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { ZhiwoIntroduction } from './Greeting.tsx'
import type { QuestionRequest, QuestionResponse, QuestionSource } from './question-contract.ts'
import { parseQuestionResponse } from './question-contract.ts'
import type {} from './locales.ts'
import css from './QuestionSuggestions.module.css'

/** Browser-facing actions and locale state supplied by the Zhiwo client plugin. */
export interface QuestionSuggestionsInjected {
  hooks: {
    /** Active locale used to choose one text from each bilingual semantic question. */
    locale: ObservableSnapshot<LocaleSnapshot>
  }
  /** Call the visitor-scoped internal question endpoint. */
  requestQuestions: (request: QuestionRequest, signal: AbortSignal) => Promise<RpcResult<unknown>>
}

/** Full props of the Zhiwo input-dock entry. */
export type QuestionSuggestionsProps =
  PropsRuntime<'conversation.input.dock'>
  & InjectFace<QuestionSuggestionsInjected>
  & PropsLocale<'zhiwo'>

interface SuggestionState {
  readonly key: string
  readonly items: QuestionResponse['items']
  readonly error: string | undefined
  readonly loading: boolean
}

function SuggestionIcon({ index, followup }: { readonly index: number; readonly followup: boolean }) {
  if (index === 0 && followup) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M4 5.5h16v11H9l-4 3v-3H4z" />
        <path d="M8 9h8M8 12h5" />
      </svg>
    )
  }
  if (index === 0) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M6 2.8h8l4 4V21H6z" />
        <path d="M14 2.8V7h4M9 11h6M9 15h6" />
      </svg>
    )
  }
  if (index === 1) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
        <path d="m12 7 1.4 2.9 3.2.5-2.3 2.2.6 3.2-2.9-1.5-2.9 1.5.6-3.2-2.3-2.2 3.2-.5z" />
      </svg>
    )
  }
  if (index === 2) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M4 20V12h4v8zM10 20V5h4v15zM16 20V9h4v11z" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M6 22V3M7 4h11l-3 4 3 4H7" />
    </svg>
  )
}

function lastCompletedTurnEndSeq(
  session: QuestionSuggestionsProps['session'],
): number | undefined {
  for (const turn of [...session.chat.timeline.turnOrder].reverse()) {
    const end = session.chat.timeline.turns.get(turn)?.end
    if (end?.data.reason.kind === 'completed') return end.seq
  }
  return undefined
}

function requestTarget(session: QuestionSuggestionsProps['session']): {
  readonly key: string
  readonly kind: QuestionRequest['kind']
  readonly turnEndSeq?: number
} {
  const turnEndSeq = lastCompletedTurnEndSeq(session)
  return turnEndSeq === undefined
    ? { key: 'welcome', kind: 'welcome' }
    : { key: `followup:${turnEndSeq}`, kind: 'followup', turnEndSeq }
}

function sourceCounts(items: readonly { readonly source: QuestionSource }[]): Record<QuestionSource, number> {
  return items.reduce<Record<QuestionSource, number>>((counts, item) => {
    counts[item.source] += 1
    return counts
  }, { global: 0, project: 0, context: 0 })
}

/** Render four validated semantic questions and preserve the last good set across refresh failures. */
export function QuestionSuggestions({
  sessionId, session, input, inputActions, useLocale, requestQuestions, t,
}: QuestionSuggestionsProps) {
  const locale = useLocale(snapshot => snapshot.active)
  const target = useMemo(() => requestTarget(session), [session.chat.timeline.turnOrder, session.turnEnds])
  const [state, setState] = useState<SuggestionState>({ key: target.key, items: [], error: undefined, loading: true })
  const seen = useRef(new Map<string, Set<string>>())
  const requestGeneration = useRef(0)
  const controller = useRef<AbortController | undefined>()

  const refresh = useCallback(async (manual: boolean): Promise<void> => {
    if (controller.current !== undefined) return
    const generation = ++requestGeneration.current
    const nextController = new AbortController()
    controller.current = nextController
    setState(current => ({ ...current, key: target.key, loading: true, error: undefined }))
    const excluded = seen.current.get(target.key) ?? new Set<string>()
    const request: QuestionRequest = {
      kind: target.kind,
      locale: 'zh',
      sessionId,
      excludeIds: [...excluded],
      ...target.turnEndSeq === undefined ? {} : { turnEndSeq: target.turnEndSeq },
    }
    try {
      const result = await requestQuestions(request, nextController.signal)
      if (generation !== requestGeneration.current || nextController.signal.aborted) return
      if (!result.ok) throw new Error(result.error.message)
      const response = parseQuestionResponse(result.value, target.kind)
      const counts = sourceCounts(response.items)
      if (target.kind === 'followup' && (counts.context !== 2 || counts.global !== 2)) {
        throw new Error('Invalid follow-up question split')
      }
      const nextSeen = manual ? new Set(excluded) : new Set<string>()
      for (const item of response.items) nextSeen.add(item.id)
      seen.current.set(target.key, nextSeen)
      setState({ key: target.key, items: response.items, error: undefined, loading: false })
    } catch (error: unknown) {
      if (generation !== requestGeneration.current || nextController.signal.aborted) return
      setState(current => ({ ...current, key: target.key, loading: false, error: error instanceof Error ? error.message : String(error) }))
    } finally {
      if (controller.current === nextController) controller.current = undefined
    }
  }, [requestQuestions, sessionId, target.key, target.kind, target.turnEndSeq])

  useEffect(() => {
    controller.current?.abort()
    controller.current = undefined
    void refresh(false)
    return () => {
      requestGeneration.current += 1
      controller.current?.abort()
      controller.current = undefined
    }
  }, [target.key, refresh])

  const visibleItems = state.items
  const followup = target.kind === 'followup'
  const locked = session.running || input.phase === 'adjudicating' || input.phase === 'submitting'
  const refreshLabel = state.loading ? t('questions.refreshing') : t('questions.refresh')

  return (
    <section className={css.dock} aria-label={t(followup ? 'questions.followup.aria' : 'questions.welcome.aria')} data-question-kind={target.kind}>
      <div className={css.panel}>
        {session.blank && <ZhiwoIntroduction placement="dock" t={t} />}
        <div className={css.header}>
          <h2 className={css.title}>{t(followup ? 'questions.followup.heading' : 'questions.welcome.heading')}</h2>
          <button
            type="button"
            className={css.refresh}
            disabled={state.loading}
            aria-label={refreshLabel}
            title={refreshLabel}
            onClick={() => { void refresh(true) }}
          >
            <IconRefreshOutline16 className={state.loading ? css.spinning : undefined} />
            <span>{refreshLabel}</span>
          </button>
        </div>
        {visibleItems.length === 4 && (
          <div className={css.grid}>
            {visibleItems.map((item, index) => (
              <button
                type="button"
                key={item.id}
                className={css.question}
                data-question-id={item.id}
                data-question-source={item.source}
                disabled={locked}
                onClick={() => { inputActions.setDraft(item.texts[locale]) }}
              >
                <span className={css.questionIcon} data-zhiwo-question-icon>
                  <SuggestionIcon index={index} followup={followup} />
                </span>
                <span className={css.questionLabel}>{item.texts[locale]}</span>
                <IconChevronRightOutline14 className={css.chevron} size={16} />
              </button>
            ))}
          </div>
        )}
        {visibleItems.length === 0 && state.loading && <p className={css.status}>{t('questions.loading')}</p>}
        {state.error !== undefined && (
          <p className={css.error} role="status">
            {t('questions.error')}
            <button type="button" disabled={state.loading} onClick={() => { void refresh(true) }}>{t('questions.retry')}</button>
          </p>
        )}
      </div>
    </section>
  )
}
