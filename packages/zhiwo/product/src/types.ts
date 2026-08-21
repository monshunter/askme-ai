/** Public Remote values for Zhiwo's bilingual question suggestions. */

import type { Message } from '@deepseek-ai/dsh-llm/types'

/** Exact model-visible request recorded before one contextual-question dispatch. */
export interface ZhiwoQuestionLlmRequestEventData {
  /** Completed Turn whose transcript the request uses. */
  readonly turnEndSeq: number
  /** Exact auxiliary LLM route. */
  readonly route: { readonly provider: string; readonly model: string }
  /** Exact auxiliary system prompt. */
  readonly system: string
  /** Exact auxiliary message list. */
  readonly messages: Message[]
  /** Exact auxiliary output-token cap. */
  readonly maxTokens: number
  /** Auxiliary transport-policy classification. */
  readonly purpose: 'suggestions'
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Log-only pre-dispatch record of one contextual-question model request. */
    'zhiwo/question-llm-request': ZhiwoQuestionLlmRequestEventData
  }
}

/** Languages shipped by the Zhiwo UI. */
export type QuestionLocale = 'zh' | 'en'

/** Suggestion category used by the browser to enforce the required split. */
export type QuestionSource = 'global' | 'project' | 'context'

/** One localized browser suggestion. */
export interface QuestionSuggestion {
  readonly id: string
  readonly text: string
  readonly texts: Readonly<Record<QuestionLocale, string>>
  readonly source: QuestionSource
  readonly project?: string
}

/** Valid request accepted by the internal suggestion Remote. */
export interface QuestionRequest {
  readonly kind: 'welcome' | 'followup'
  readonly locale: QuestionLocale
  readonly sessionId: string
  readonly turnEndSeq?: number
  readonly excludeIds: readonly string[]
}

/** Successful Remote response. */
export interface QuestionResponse {
  readonly kind: QuestionRequest['kind']
  readonly revision: string
  readonly items: readonly QuestionSuggestion[]
}
