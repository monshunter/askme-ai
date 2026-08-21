/** Public Remote values for Zhiwo's bilingual question suggestions. */

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
