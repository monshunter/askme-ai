/** Browser validation for Zhiwo's private bilingual question response. */

/** Languages supported by Zhiwo question pairs. */
export type QuestionLocale = 'zh' | 'en'

/** Semantic source tags enforced by the suggestion UI. */
export type QuestionSource = 'global' | 'project' | 'context'

/** Request sent through the existing Connection channel. */
export interface QuestionRequest {
  readonly kind: 'welcome' | 'followup'
  readonly locale: QuestionLocale
  readonly sessionId: string
  readonly turnEndSeq?: number
  readonly excludeIds: readonly string[]
}

/** One validated bilingual question. */
export interface QuestionItem {
  readonly id: string
  readonly text: string
  readonly texts: Readonly<Record<QuestionLocale, string>>
  readonly source: QuestionSource
  readonly project?: string
}

/** Complete successful response. */
export interface QuestionResponse {
  readonly kind: QuestionRequest['kind']
  readonly revision: string
  readonly items: readonly QuestionItem[]
}

const FORBIDDEN_TEXT = /(?:\buserdata\b|\bdsh\b|deepseek|harness|system\s*prompt|tool\s*trace)/iu
const ABSOLUTE_PATH = /(?:^|\s)(?:\/[\w.-]+(?:\/[\w.-]+)+|[a-z]:\\[^\s]+)/iu

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function safeText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max
    && !FORBIDDEN_TEXT.test(value) && !ABSOLUTE_PATH.test(value)
}

function parseItem(value: unknown): QuestionItem | undefined {
  const item = record(value)
  const texts = record(item?.['texts'])
  if (item === undefined || !safeText(item['id'], 160) || !safeText(item['text'], 280)
    || (item['source'] !== 'global' && item['source'] !== 'project' && item['source'] !== 'context')
    || texts === undefined || !safeText(texts['zh'], 280) || !safeText(texts['en'], 280)
    || (item['project'] !== undefined && !safeText(item['project'], 48))) return undefined
  return {
    id: item['id'],
    text: item['text'],
    texts: { zh: texts['zh'], en: texts['en'] },
    source: item['source'],
    ...item['project'] === undefined ? {} : { project: item['project'] },
  }
}

/**
 * Parse one Host response and enforce its four-item category invariant.
 * @param value - Untrusted response payload from the Host.
 * @param expectedKind - Request phase whose category split the response must satisfy.
 * @returns A complete validated four-question response.
 */
export function parseQuestionResponse(value: unknown, expectedKind: QuestionRequest['kind']): QuestionResponse {
  const response = record(value)
  if (response === undefined || response['kind'] !== expectedKind || !safeText(response['revision'], 160)
    || !Array.isArray(response['items']) || response['items'].length !== 4) {
    throw new Error('Invalid Zhiwo question response')
  }
  const items = response['items'].map(parseItem)
  if (items.some(item => item === undefined)) throw new Error('Invalid Zhiwo question item')
  const complete = items as QuestionItem[]
  if (new Set(complete.map(item => item.id)).size !== complete.length) throw new Error('Duplicate Zhiwo question id')
  const counts = complete.reduce<Record<QuestionSource, number>>((next, item) => {
    next[item.source] += 1
    return next
  }, { global: 0, project: 0, context: 0 })
  if (expectedKind === 'followup') {
    if (counts.context !== 2 || counts.global !== 2 || counts.project !== 0) throw new Error('Invalid follow-up question split')
  } else if (!((counts.global === 2 && counts.project === 2 && counts.context === 0)
    || (counts.global === 4 && counts.project === 0 && counts.context === 0))) {
    throw new Error('Invalid welcome question split')
  }
  return { kind: expectedKind, revision: response['revision'], items: complete }
}
