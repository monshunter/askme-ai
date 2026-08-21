import { mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { ZhiwoQuestions } from '../src/questions.ts'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function workspace(...projects: string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'zhiwo-questions-'))
  temporaryRoots.push(root)
  await Promise.all(projects.map(project => mkdir(join(root, project))))
  return root
}

function lookup(session: Session) {
  return { get: (id: string) => id === session.id ? session : undefined } as never
}

function catalog(root: string, session: Session): ZhiwoQuestions {
  return new ZhiwoQuestions(root, lookup(session), () => {}, join(root, '.dsh'))
}

async function cacheFile(root: string): Promise<string> {
  const directory = join(root, '.dsh', 'zhiwo', 'questions')
  const [name] = await readdir(directory)
  if (name === undefined) throw new Error('Zhiwo test cache was not created')
  return join(directory, name)
}

function welcome(sessionId: string, excludeIds: readonly string[] = []) {
  return { kind: 'welcome', locale: 'zh', sessionId, excludeIds } as const
}

function completedSession(id: string): { session: Session; endSeq: number } {
  const session = Session.create(SessionId(id))
  session.append('turn/start', { turn: 1 })
  session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: '请介绍 ferry 的关键设计和成果' }],
    source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  session.append('step/start', { turn: 1, step: 1 })
  session.append('assistant/message', {
    turn: 1,
    step: 1,
    message: createMessage({
      role: 'assistant',
      content: [{ type: 'text', text: 'ferry 强调可靠的部署与清晰的验收。' }],
      source: { kind: 'model', provider: 'mock', model: 'mock' },
    }),
  }, { surfaceOp: 'append' })
  session.append('step/end', { turn: 1, step: 1 })
  const endSeq = session.append('turn/end', { turn: 1, reason: { kind: 'completed' } }).seq
  return { session, endSeq }
}

describe('Zhiwo question catalog', () => {
  it('rotates through 100 bilingual global and project questions from immediate directories', async () => {
    const root = await workspace('askme', 'ferry', '.hidden')
    const session = Session.create(SessionId('visitor-session'))
    const questions = catalog(root, session)
    const dispose = questions.start()
    const seen = new Set<string>()

    for (let page = 0; page < 25; page += 1) {
      const result = await questions.handle(welcome(session.id, [...seen]), new AbortController().signal)
      expect(result.ok).toBe(true)
      if (!result.ok) continue
      expect(result.value.items).toHaveLength(4)
      expect(result.value.items.filter(item => item.source === 'global')).toHaveLength(2)
      expect(result.value.items.filter(item => item.source === 'project')).toHaveLength(2)
      for (const item of result.value.items) {
        expect(item.texts.zh).not.toBe('')
        expect(item.texts.en).not.toBe('')
        seen.add(item.id)
      }
    }

    expect(seen).toHaveLength(100)
    dispose()
  })

  it('keeps a 100-question global fallback when no project directory exists', async () => {
    const root = await workspace()
    const session = Session.create(SessionId('global-session'))
    const questions = catalog(root, session)
    questions.start()
    const seen = new Set<string>()

    for (let page = 0; page < 25; page += 1) {
      const result = await questions.handle(welcome(session.id, [...seen]), new AbortController().signal)
      expect(result.ok).toBe(true)
      if (!result.ok) continue
      expect(result.value.items.every(item => item.source === 'global')).toBe(true)
      for (const item of result.value.items) seen.add(item.id)
    }
    expect(seen).toHaveLength(100)
  })

  it('returns exactly two completed-turn context questions and two initialized globals', async () => {
    const root = await workspace('ferry')
    const { session, endSeq } = completedSession('followup-session')
    const questions = catalog(root, session)
    questions.start()
    const result = await questions.handle({
      kind: 'followup', locale: 'en', sessionId: session.id, turnEndSeq: endSeq, excludeIds: [],
    }, new AbortController().signal)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.items.map(item => item.source).sort()).toEqual(['context', 'context', 'global', 'global'])
    expect(result.value.items.filter(item => item.source === 'context').every(item => item.project === 'ferry')).toBe(true)
    expect(result.value.items.every(item => !item.text.includes('/') && !/userdata|harness|deepseek|\bdsh\b/iu.test(item.text))).toBe(true)
  })

  it('can refresh the last completed Turn after a later failed Turn without adopting the failure', async () => {
    const root = await workspace('ferry')
    const { session, endSeq } = completedSession('retained-session')
    session.append('turn/start', { turn: 2 })
    const failedSeq = session.append('turn/end', { turn: 2, reason: { kind: 'blocked' } }).seq
    const questions = catalog(root, session)
    questions.start()

    const retained = await questions.handle({
      kind: 'followup', locale: 'zh', sessionId: session.id, turnEndSeq: endSeq, excludeIds: [],
    }, new AbortController().signal)
    expect(retained.ok).toBe(true)
    const failed = await questions.handle({
      kind: 'followup', locale: 'zh', sessionId: session.id, turnEndSeq: failedSeq, excludeIds: [],
    }, new AbortController().signal)
    expect(failed).toMatchObject({ ok: false, error: { code: 'internal' } })
  })

  it('rejects malformed, unknown-Session, and cancelled requests at the wire boundary', async () => {
    const root = await workspace()
    const session = Session.create(SessionId('known'))
    const questions = catalog(root, session)
    questions.start()

    await expect(questions.handle({ kind: 'welcome' }, new AbortController().signal))
      .resolves.toMatchObject({ ok: false, error: { code: 'internal' } })
    await expect(questions.handle(welcome('unknown'), new AbortController().signal))
      .resolves.toMatchObject({ ok: false, error: { code: 'session-not-found' } })
    await expect(questions.handle(welcome(session.id), AbortSignal.abort()))
      .resolves.toMatchObject({ ok: false, error: { code: 'cancelled' } })
  })

  it('reuses an unchanged private cache and invalidates it for root documents and directories', async () => {
    const root = await workspace('askme')
    const profile = join(root, 'profile.md')
    await writeFile(profile, 'private profile content\n')
    const session = Session.create(SessionId('cache-session'))

    const first = catalog(root, session)
    first.start()
    await expect(first.handle(welcome(session.id), new AbortController().signal))
      .resolves.toMatchObject({ ok: true })
    const filename = await cacheFile(root)
    const initial = JSON.parse(await readFile(filename, 'utf8')) as { fingerprint: string; projects: unknown[] }
    expect(await readFile(filename, 'utf8')).not.toContain('private profile content')

    const sentinel = new Date('2000-01-01T00:00:00.000Z')
    await utimes(filename, sentinel, sentinel)
    const unchanged = catalog(root, session)
    unchanged.start()
    await expect(unchanged.handle(welcome(session.id), new AbortController().signal))
      .resolves.toMatchObject({ ok: true })
    expect((await stat(filename)).mtime.getTime()).toBe(sentinel.getTime())

    await writeFile(profile, 'changed private profile content\n')
    const documentChanged = catalog(root, session)
    documentChanged.start()
    await expect(documentChanged.handle(welcome(session.id), new AbortController().signal))
      .resolves.toMatchObject({ ok: true })
    const afterDocument = JSON.parse(await readFile(filename, 'utf8')) as { fingerprint: string; projects: unknown[] }
    expect(afterDocument.fingerprint).not.toBe(initial.fingerprint)

    await mkdir(join(root, 'ferry'))
    const directoryChanged = catalog(root, session)
    directoryChanged.start()
    await expect(directoryChanged.handle(welcome(session.id), new AbortController().signal))
      .resolves.toMatchObject({ ok: true })
    const afterDirectory = JSON.parse(await readFile(filename, 'utf8')) as { fingerprint: string; projects: unknown[] }
    expect(afterDirectory.fingerprint).not.toBe(afterDocument.fingerprint)
    expect(afterDirectory.projects).toHaveLength(2)
  })
})
