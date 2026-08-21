// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QuestionSuggestions, type QuestionSuggestionsProps } from '../src/client/QuestionSuggestions.tsx'
import { parseQuestionResponse, type QuestionItem, type QuestionResponse } from '../src/client/question-contract.ts'

afterEach(() => { cleanup() })

const copy: Record<string, string> = {
  'brand.name': '知我AI',
  'hero.greeting': '你好，欢迎来了解我',
  'questions.welcome.aria': '推荐问题',
  'questions.welcome.heading': '可以这样了解我',
  'questions.followup.aria': '后续推荐问题',
  'questions.followup.heading': '还可以继续问',
  'questions.refresh': '换一组',
  'questions.refreshing': '正在更新',
  'questions.loading': '正在准备可提问的问题…',
  'questions.error': '问题更新失败，已保留上一组。',
  'questions.retry': '重试',
}

function item(id: string, source: QuestionItem['source']): QuestionItem {
  return {
    id,
    source,
    text: `中文 ${id}`,
    texts: { zh: `中文 ${id}`, en: `English ${id}` },
    ...source === 'project' ? { project: 'ferry' } : {},
  }
}

function response(kind: QuestionResponse['kind'], ids: readonly string[]): QuestionResponse {
  return {
    kind,
    revision: 'catalog-1',
    items: kind === 'welcome'
      ? [item(ids[0]!, 'global'), item(ids[1]!, 'global'), item(ids[2]!, 'project'), item(ids[3]!, 'project')]
      : [item(ids[0]!, 'context'), item(ids[1]!, 'context'), item(ids[2]!, 'global'), item(ids[3]!, 'global')],
  }
}

function session(turnEndSeq?: number) {
  const end = turnEndSeq === undefined ? undefined : {
    seq: turnEndSeq,
    data: { reason: { kind: 'completed' } },
  }
  return {
    blank: turnEndSeq === undefined,
    running: false,
    turnEnds: turnEndSeq === undefined ? new Map() : new Map([[1, turnEndSeq]]),
    chat: {
      timeline: {
        turnOrder: turnEndSeq === undefined ? [] : [1],
        turns: turnEndSeq === undefined ? new Map() : new Map([[1, { end }]]),
      },
    },
  }
}

function props(options: {
  readonly locale?: 'zh' | 'en'
  readonly turnEndSeq?: number
  readonly requestQuestions: QuestionSuggestionsProps['requestQuestions']
  readonly setDraft?: (text: string) => void
}): QuestionSuggestionsProps {
  const locale = options.locale ?? 'zh'
  const useLocale: QuestionSuggestionsProps['useLocale'] = select => select({ active: locale, locales: [], revision: 1 })
  const t = (key: string): string => copy[key] ?? key
  return {
    sessionId: 'visitor-session' as never,
    session: session(options.turnEndSeq),
    input: { phase: 'plain' },
    inputActions: { setDraft: options.setDraft ?? (() => {}) },
    useLocale,
    requestQuestions: options.requestQuestions,
    t,
  } as unknown as QuestionSuggestionsProps
}

describe('Zhiwo question suggestions', () => {
  it('loads four welcome questions, fills the native draft, and rotates manually', async () => {
    const first = response('welcome', ['a', 'b', 'c', 'd'])
    const second = response('welcome', ['e', 'f', 'g', 'h'])
    const requestQuestions = vi.fn()
      .mockResolvedValueOnce({ ok: true, value: first })
      .mockResolvedValueOnce({ ok: true, value: second })
    const setDraft = vi.fn()
    const view = render(<QuestionSuggestions {...props({ requestQuestions, setDraft })} />)

    await waitFor(() => { expect(view.getAllByRole('button')).toHaveLength(5) })
    expect(view.getByText('你好，欢迎来了解我')).toBeTruthy()
    expect(view.getAllByText(/^中文 /u)).toHaveLength(4)
    fireEvent.click(view.getByText('中文 a'))
    expect(setDraft).toHaveBeenCalledWith('中文 a')
    fireEvent.click(view.getByRole('button', { name: '换一组' }))
    await waitFor(() => { expect(view.getByText('中文 e')).toBeTruthy() })
    expect(requestQuestions.mock.calls[1]?.[0]).toMatchObject({ excludeIds: ['a', 'b', 'c', 'd'] })
  })

  it('preserves the previous set and exposes retry when refresh fails', async () => {
    const requestQuestions = vi.fn()
      .mockResolvedValueOnce({ ok: true, value: response('welcome', ['a', 'b', 'c', 'd']) })
      .mockResolvedValueOnce({ ok: false, error: { code: 'internal', message: 'offline', details: {} } })
    const view = render(<QuestionSuggestions {...props({ requestQuestions })} />)
    await waitFor(() => { expect(view.getByText('中文 a')).toBeTruthy() })
    fireEvent.click(view.getByRole('button', { name: '换一组' }))
    await waitFor(() => { expect(view.getByText(copy['questions.error']!)).toBeTruthy() })
    expect(view.getAllByText(/^中文 /u)).toHaveLength(4)
  })

  it('requests the last completed Turn and enforces the two-plus-two follow-up set', async () => {
    const requestQuestions = vi.fn().mockResolvedValue({
      ok: true,
      value: response('followup', ['context-a', 'context-b', 'global-a', 'global-b']),
    })
    const view = render(<QuestionSuggestions {...props({ requestQuestions, turnEndSeq: 19 })} />)

    await waitFor(() => { expect(view.getByText('中文 context-a')).toBeTruthy() })
    expect(view.queryByText('你好，欢迎来了解我')).toBeNull()
    expect(view.getByRole('heading', { name: '还可以继续问' })).toBeTruthy()
    expect(requestQuestions).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'followup', turnEndSeq: 19,
    }), expect.any(AbortSignal))
    expect(view.container.querySelectorAll('[data-question-source="context"]')).toHaveLength(2)
    expect(view.container.querySelectorAll('[data-question-source="global"]')).toHaveLength(2)
  })

  it('switches language in place without changing semantic ids or issuing another request', async () => {
    const requestQuestions = vi.fn().mockResolvedValue({
      ok: true,
      value: response('welcome', ['a', 'b', 'c', 'd']),
    })
    const common = props({ requestQuestions })
    const view = render(<QuestionSuggestions {...common} />)
    await waitFor(() => { expect(view.getByText('中文 a')).toBeTruthy() })
    const before = [...view.container.querySelectorAll('[data-question-id]')].map(node => node.getAttribute('data-question-id'))

    view.rerender(<QuestionSuggestions {...{
      ...common,
      useLocale: (select: (value: never) => unknown) => select({ active: 'en', locales: [], revision: 2 } as never),
    } as QuestionSuggestionsProps} />)
    expect(view.getByText('English a')).toBeTruthy()
    expect([...view.container.querySelectorAll('[data-question-id]')].map(node => node.getAttribute('data-question-id'))).toEqual(before)
    expect(requestQuestions).toHaveBeenCalledTimes(1)
  })

  it('rejects duplicate, forbidden, and incorrectly split responses', () => {
    const duplicate = response('welcome', ['a', 'a', 'c', 'd'])
    expect(() => parseQuestionResponse(duplicate, 'welcome')).toThrow('Duplicate')
    const original = response('welcome', ['a', 'b', 'c', 'd'])
    const forbidden = {
      ...original,
      items: [{ ...original.items[0]!, texts: { ...original.items[0]!.texts, zh: '/Users/private/data' } }, ...original.items.slice(1)],
    }
    expect(() => parseQuestionResponse(forbidden, 'welcome')).toThrow('Invalid Zhiwo question item')
    expect(() => parseQuestionResponse(response('welcome', ['a', 'b', 'c', 'd']), 'followup')).toThrow()
  })
})
