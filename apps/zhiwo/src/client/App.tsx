import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { safeMarkdownUrl } from './markdown.ts'

interface Bootstrap {
  product: '知我'
  revisionId: string
  starterQuestions: string[]
  csrfToken: string
}

interface Session {
  id: string
  title: string
  knowledgeRevisionId: string
  generationState: 'idle' | 'running' | 'failed'
  updatedAt: number
}

interface Citation {
  id: string
  title: string
  excerpt?: string
  openable: boolean
  downloadable: boolean
  location?: {
    lineStart?: number
    lineEnd?: number
    page?: number
    slide?: number
    sheet?: string
    cellRange?: string
  }
}

type TraceItem =
  | { id: string; type: 'context'; label: '上下文注入'; detail: string; status: 'completed' }
  | { id: string; type: 'reasoning'; label: 'Think'; text: string; status: 'running' | 'completed' }
  | {
    id: string
    type: 'tool'
    tool: 'read' | 'glob' | 'grep'
    label: 'Read' | 'Glob' | 'Grep'
    detail: string
    status: 'running' | 'completed' | 'failed'
  }
  | { id: string; type: 'text'; text: string; status: 'completed' }

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  status: 'pending' | 'streaming' | 'completed' | 'failed' | 'cancelled'
  createdAt: number
  citations: Citation[]
  trace: TraceItem[]
}

interface SourcePreview {
  citation: Citation
  content?: string
}

const markdownComponents: Components = {
  a: ({ href, children }) => href === undefined
    ? <span>{children}</span>
    : <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
  img: ({ alt }) => <span className="blocked-image">{alt ?? '图片'}</span>,
}

const markdownPlugins = [remarkGfm]

class PublicApiError extends Error {}

async function responseError(response: Response): Promise<PublicApiError> {
  try {
    const body = await response.json() as { error?: { message?: string } }
    return new PublicApiError(body.error?.message ?? '请求失败')
  } catch {
    return new PublicApiError('请求失败')
  }
}

function publicError(cause: unknown, fallback: string): string {
  return cause instanceof PublicApiError ? cause.message : fallback
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => { window.setTimeout(resolve, milliseconds) })
}

function TraceRow({ item }: { item: TraceItem }): ReactElement {
  if (item.type === 'reasoning') {
    return <details className={`trace-row trace-reasoning status-${item.status}`}>
      <summary><span className="trace-icon" aria-hidden="true">◎</span><strong>{item.label}</strong><span>·</span><span className="trace-summary">{item.text}</span></summary>
      <p>{item.text}</p>
    </details>
  }
  if (item.type === 'text') {
    return <div className="trace-text markdown"><ReactMarkdown
      remarkPlugins={markdownPlugins}
      components={markdownComponents}
      urlTransform={safeMarkdownUrl}
      skipHtml
    >{item.text}</ReactMarkdown></div>
  }
  const running = item.status === 'running'
  return <div className={`trace-row trace-${item.type} status-${item.status}`}>
    <span className="trace-icon" aria-hidden="true">{item.type === 'context' ? '▣' : running ? '◌' : item.status === 'failed' ? '!' : '▾'}</span>
    <strong>{item.label}</strong><span>·</span><span>{item.detail}</span>
    {running && <span className="sr-only">运行中</span>}
    {item.status === 'failed' && <span className="sr-only">未完成</span>}
  </div>
}

export function App(): ReactElement {
  const [bootstrap, setBootstrap] = useState<Bootstrap>()
  const [sessions, setSessions] = useState<Session[]>([])
  const [sessionId, setSessionId] = useState<string>()
  const [messages, setMessages] = useState<Message[]>([])
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [preview, setPreview] = useState<SourcePreview>()
  const [notice, setNotice] = useState<string>()
  const scrollRef = useRef<HTMLDivElement>(null)
  const dialogCloseRef = useRef<HTMLButtonElement>(null)

  const request = useCallback(async (path: string, init: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(init.headers)
    if (init.body !== undefined) headers.set('Content-Type', 'application/json')
    if (init.method !== undefined && init.method !== 'GET' && bootstrap !== undefined) {
      headers.set('X-Zhiwo-CSRF', bootstrap.csrfToken)
    }
    const response = await fetch(path, { ...init, headers, credentials: 'same-origin' })
    if (!response.ok) throw await responseError(response)
    return response
  }, [bootstrap])

  const refreshSessions = useCallback(async (): Promise<void> => {
    const response = await request('/api/sessions')
    const body = await response.json() as { sessions: Session[] }
    setSessions(body.sessions)
  }, [request])

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/bootstrap', { credentials: 'same-origin' })
        if (!response.ok) throw await responseError(response)
        const value = await response.json() as Bootstrap
        setBootstrap(value)
      } catch (cause) {
        setError(publicError(cause, '暂时无法连接服务，请稍后重试。'))
      }
    })()
  }, [])

  useEffect(() => {
    if (bootstrap !== undefined) void refreshSessions()
  }, [bootstrap, refreshSessions])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (preview !== undefined) dialogCloseRef.current?.focus()
  }, [preview])

  useEffect(() => {
    const close = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      setPreview(undefined)
      setDrawerOpen(false)
    }
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('keydown', close)
    }
  }, [])

  const openSession = useCallback(async (id: string): Promise<void> => {
    try {
      setError(undefined)
      const response = await request(`/api/sessions/${encodeURIComponent(id)}/messages`)
      const body = await response.json() as { messages: Message[] }
      setSessionId(id)
      setMessages(body.messages)
      setDrawerOpen(false)
    } catch (cause) {
      setError(publicError(cause, '暂时无法打开对话，请重试。'))
    }
  }, [request])

  const recoverSession = useCallback(async (id: string): Promise<Message[] | undefined> => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (attempt > 0) await wait(150 * attempt)
      try {
        const response = await request(`/api/sessions/${encodeURIComponent(id)}/messages`)
        const body = await response.json() as { messages: Message[] }
        const last = body.messages.at(-1)
        if (last?.role !== 'assistant' || last.status !== 'streaming') return body.messages
      } catch {
        // A later bounded attempt may observe the server after the stream closes.
      }
    }
    return undefined
  }, [request])

  const newConversation = (): void => {
    if (busy) return
    setSessionId(undefined)
    setMessages([])
    setPrompt('')
    setError(undefined)
    setDrawerOpen(false)
  }

  const submit = useCallback(async (question?: string): Promise<void> => {
    const text = (question ?? prompt).trim()
    if (text.length === 0 || busy || bootstrap === undefined) return
    setBusy(true)
    setError(undefined)
    setPrompt('')
    const localUser: Message = {
      id: `local-user-${Date.now()}`,
      role: 'user',
      content: text,
      status: 'completed',
      createdAt: Date.now(),
      citations: [],
      trace: [],
    }
    const localAssistant: Message = {
      id: `local-assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      status: 'streaming',
      createdAt: Date.now() + 1,
      citations: [],
      trace: [],
    }
    setMessages(current => [...current, localUser, localAssistant])
    let currentAssistantId = localAssistant.id
    let activeSessionId = sessionId
    let streamStarted = false
    let terminal = false
    try {
      const response = await request('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ prompt: text, ...(sessionId === undefined ? {} : { sessionId }) }),
      })
      if (response.body === null) throw new Error('回答流不可用')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let pending = ''
      while (true) {
        const result = await reader.read()
        pending += decoder.decode(result.value, { stream: !result.done })
        const lines = pending.split('\n')
        pending = lines.pop() ?? ''
        for (const line of lines) {
          if (line.length === 0) continue
          const event = JSON.parse(line) as
            | { type: 'start'; sessionId: string; messageId: string }
            | { type: 'delta'; text: string }
            | { type: 'trace.append'; item: TraceItem }
            | { type: 'trace.replace'; item: TraceItem }
            | { type: 'trace.update'; id: string; status: 'completed' | 'failed' }
            | { type: 'done'; message: Message }
            | { type: 'error'; message: string }
          if (event.type === 'start') {
            streamStarted = true
            activeSessionId = event.sessionId
            setSessionId(event.sessionId)
            currentAssistantId = event.messageId
            setMessages(current => current.map(message => message.id === localAssistant.id
              ? { ...message, id: event.messageId }
              : message))
          } else if (event.type === 'delta') {
            setMessages(current => current.map(message => message.id === currentAssistantId
              ? { ...message, content: `${message.content}${event.text}` }
              : message))
          } else if (event.type === 'trace.append') {
            setMessages(current => current.map(message => message.id === currentAssistantId
              ? { ...message, trace: [...message.trace, event.item] }
              : message))
          } else if (event.type === 'trace.replace') {
            setMessages(current => current.map(message => message.id === currentAssistantId
              ? {
                ...message,
                trace: message.trace.some(item => item.id === event.item.id)
                  ? message.trace.map(item => item.id === event.item.id ? event.item : item)
                  : [...message.trace, event.item],
              }
              : message))
          } else if (event.type === 'trace.update') {
            setMessages(current => current.map(message => message.id === currentAssistantId
              ? {
                ...message,
                trace: message.trace.map(item => item.id === event.id && item.type === 'tool'
                  ? { ...item, status: event.status }
                  : item),
              }
              : message))
          } else if (event.type === 'done') {
            terminal = true
            setMessages(current => current.map(message => message.id === currentAssistantId ? event.message : message))
          } else {
            terminal = true
            setMessages(current => current.map(message => message.id === currentAssistantId
              ? { ...message, content: event.message, status: 'failed' }
              : message))
          }
        }
        if (result.done) break
      }
      if (!terminal) throw new Error('ZHIWO_STREAM_INTERRUPTED')
      try {
        await refreshSessions()
      } catch {
        setNotice('回答已完成；对话列表暂未刷新。')
      }
    } catch (cause) {
      const recovered = activeSessionId === undefined || (!streamStarted && cause instanceof PublicApiError)
        ? undefined
        : await recoverSession(activeSessionId)
      if (recovered !== undefined) {
        setMessages(recovered)
        setNotice('连接曾中断，已从服务端恢复当前对话。')
        try {
          await refreshSessions()
        } catch {
          // The recovered conversation remains usable when only the list refresh fails.
        }
      } else {
        const message = cause instanceof PublicApiError ? cause.message : '连接中断，请确认服务可用后重试。'
        setError(message)
        setMessages(current => current.map(item => item.id === currentAssistantId
          ? { ...item, content: '当前回答未能完成，请重试。', status: 'failed' }
          : item))
      }
    } finally {
      setBusy(false)
    }
  }, [bootstrap, busy, prompt, recoverSession, refreshSessions, request, sessionId])

  const cancel = useCallback(async (): Promise<void> => {
    if (sessionId === undefined) return
    try {
      await request(`/api/sessions/${encodeURIComponent(sessionId)}/cancel`, { method: 'POST' })
    } catch (cause) {
      setError(publicError(cause, '暂时无法停止回答，请重试。'))
    }
  }, [request, sessionId])

  const removeSession = useCallback(async (id: string): Promise<void> => {
    if (!window.confirm('永久删除这个对话？')) return
    try {
      await request(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (sessionId === id) {
        setSessionId(undefined)
        setMessages([])
        setPrompt('')
        setError(undefined)
        setDrawerOpen(false)
        setPreview(undefined)
      }
      await refreshSessions()
      setNotice('对话及其消息、事件和来源授权已永久删除。')
    } catch (cause) {
      setError(publicError(cause, '暂时无法删除对话，请重试。'))
    }
  }, [refreshSessions, request, sessionId])

  const clearAll = useCallback(async (): Promise<void> => {
    if (sessions.length === 0 || !window.confirm('永久删除本访客的全部对话？此操作无法撤销。')) return
    try {
      await request('/api/sessions', { method: 'DELETE' })
      newConversation()
      await refreshSessions()
      setNotice('本访客的全部对话记录已永久删除。')
    } catch (cause) {
      setError(publicError(cause, '暂时无法清空对话，请重试。'))
    }
  }, [refreshSessions, request, sessions.length])

  const openCitation = useCallback(async (citation: Citation): Promise<void> => {
    if (sessionId === undefined) return
    try {
      let content: string | undefined
      if (citation.openable) {
        const response = await request(`/api/sessions/${encodeURIComponent(sessionId)}/sources/${encodeURIComponent(citation.id)}/content`)
        content = await response.text()
      }
      setPreview({ citation, ...(content === undefined ? {} : { content }) })
    } catch (cause) {
      setError(publicError(cause, '暂时无法打开来源，请重试。'))
    }
  }, [request, sessionId])

  const activeTitle = useMemo(
    () => sessions.find(session => session.id === sessionId)?.title ?? '新对话',
    [sessionId, sessions],
  )

  return <div className="shell">
    <a className="skip-link" href="#conversation">跳到对话</a>
    <aside className={`sidebar ${drawerOpen ? 'sidebar-open' : ''}`} aria-label="对话列表">
      <div className="brand-row">
        <div className="brand-mark" aria-hidden="true">知</div>
        <div><strong>知我</strong><span>只读知识助手</span></div>
        <button className="icon-button mobile-only" onClick={() => { setDrawerOpen(false) }} aria-label="关闭对话列表">×</button>
      </div>
      <button className="new-button" onClick={newConversation} disabled={busy}>＋ 新对话</button>
      <nav className="session-list" aria-label="历史对话">
        {sessions.length === 0 && <p className="empty-list">还没有历史对话</p>}
        {sessions.map(session => <div className={`session-row ${session.id === sessionId ? 'active' : ''}`} key={session.id}>
          <button className="session-open" onClick={() => void openSession(session.id)}>
            <span>{session.title}</span>
            <time>{new Date(session.updatedAt).toLocaleDateString('zh-CN')}</time>
          </button>
          <button className="session-delete" onClick={() => void removeSession(session.id)} disabled={busy} aria-label={`删除对话：${session.title}`}>×</button>
        </div>)}
      </nav>
      <div className="sidebar-footer">
        <button className="text-button" onClick={() => void clearAll()} disabled={sessions.length === 0 || busy}>清空全部对话</button>
        <p>userdata/ 全部资料均可由 Agent 只读查阅。</p>
      </div>
    </aside>
    {drawerOpen && <button className="backdrop mobile-only" onClick={() => { setDrawerOpen(false) }} aria-label="关闭对话列表" />}

    <main className="main">
      <header className="topbar">
        <button className="icon-button mobile-only" onClick={() => { setDrawerOpen(true) }} aria-label="打开对话列表">☰</button>
        <div><strong>{activeTitle}</strong><span>{bootstrap === undefined ? '正在加载资料' : '只读资料已就绪'}</span></div>
        <div className="topbar-actions">
          {sessionId !== undefined && <button className="clear-current" onClick={() => void removeSession(sessionId)} disabled={busy}>清空对话</button>}
          <div className="read-only-pill"><span aria-hidden="true">●</span> 只读</div>
        </div>
      </header>
      <div className="conversation" id="conversation" ref={scrollRef} aria-live="polite">
        {messages.length === 0 ? <section className="welcome">
          <div className="welcome-mark" aria-hidden="true">知</div>
          <h1>你好，我是知我</h1>
          <p>我会以原生 Agent 工作方式查阅 userdata/ 中的资料，并用来源明确的回答帮助你快速了解。</p>
          <div className="starter-grid">
            {(bootstrap?.starterQuestions ?? []).map(question => (
              <button key={question} onClick={() => void submit(question)} disabled={busy}>
                <span>{question}</span><span aria-hidden="true">↗</span>
              </button>
            ))}
          </div>
          <div className="scope-note"><strong>只读范围</strong><span>userdata/ 中的资料全部可读；Agent 不能写入、执行命令、联网或访问该目录之外的宿主文件。</span></div>
        </section> : <div className="message-list">
          {messages.map(message => <article className={`message ${message.role}`} key={message.id}>
            <div className="message-label">{message.role === 'user' ? '你' : '知我'}</div>
            <div className="message-body">
              {message.role === 'assistant' && message.trace.length > 0 && <div className="trace-list" aria-label="Agent 执行过程">
                {message.trace.map(item => <TraceRow item={item} key={item.id} />)}
              </div>}
              <div className={`message-text ${message.role === 'assistant' ? 'markdown' : 'plain'}`}>
                {message.content
                  ? message.role === 'assistant'
                    ? <ReactMarkdown
                      remarkPlugins={markdownPlugins}
                      components={markdownComponents}
                      urlTransform={safeMarkdownUrl}
                      skipHtml
                    >{message.content}</ReactMarkdown>
                    : message.content
                  : message.status === 'streaming' ? <span className="thinking">正在思考…</span> : ''}
              </div>
              {message.citations.length > 0 && <div className="citations" aria-label="回答来源">
                {message.citations.map((citation, index) => <button key={citation.id} onClick={() => void openCitation(citation)}>
                  <span className="citation-number">{index + 1}</span>
                  <span>{citation.title}</span>
                  <small>{citation.openable ? '可预览' : citation.downloadable ? '可下载' : '来源'}</small>
                </button>)}
              </div>}
            </div>
          </article>)}
        </div>}
      </div>
      {notice !== undefined && <div className="status-banner" role="status">{notice}<button onClick={() => { setNotice(undefined) }} aria-label="关闭状态提示">×</button></div>}
      {error !== undefined && <div className="error-banner" role="alert">{error}<button onClick={() => { setError(undefined) }} aria-label="关闭错误提示">×</button></div>}
      <form className="composer" onSubmit={(event) => { event.preventDefault(); void submit() }}>
        <div className="composer-box">
          <textarea
            value={prompt}
            onChange={(event) => { setPrompt(event.target.value) }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void submit()
              }
            }}
            disabled={busy}
            maxLength={8_000}
            rows={2}
            aria-label="向知我提问"
            placeholder="问问关于经历、项目或技术实践的问题…"
          />
          {busy
            ? <button type="button" className="send-button stop" onClick={() => void cancel()} aria-label="停止回答">■</button>
            : <button type="submit" className="send-button" disabled={prompt.trim().length === 0} aria-label="发送问题">↑</button>}
        </div>
        <p>知我可能会出错，请根据回答中的来源核对重要信息。</p>
      </form>
    </main>

    {preview !== undefined && <div className="modal-layer" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) setPreview(undefined)
    }}>
      <section className="source-modal" role="dialog" aria-modal="true" aria-labelledby="source-title">
        <header>
          <div><span>回答来源</span><h2 id="source-title">{preview.citation.title}</h2></div>
          <button ref={dialogCloseRef} className="icon-button" onClick={() => { setPreview(undefined) }} aria-label="关闭来源">×</button>
        </header>
        {preview.content === undefined
          ? <div className="source-restricted"><strong>没有文本预览</strong><p>该来源不是可显示的文本格式；如提供下载，可查看原文件。</p></div>
          : <pre>{preview.content}</pre>}
        <footer>
          <span>{[
            preview.citation.location?.page === undefined ? undefined : `第 ${preview.citation.location.page} 页`,
            preview.citation.location?.slide === undefined ? undefined : `第 ${preview.citation.location.slide} 张幻灯片`,
            preview.citation.location?.sheet,
            preview.citation.location?.lineStart === undefined
              ? undefined
              : `引用行 ${preview.citation.location.lineStart}–${preview.citation.location.lineEnd ?? preview.citation.location.lineStart}`,
          ].filter(Boolean).join(' · ')}</span>
          {preview.citation.downloadable && sessionId !== undefined && <a href={`/api/sessions/${encodeURIComponent(sessionId)}/sources/${encodeURIComponent(preview.citation.id)}/download`}>下载原文件</a>}
        </footer>
      </section>
    </div>}

  </div>
}
