// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { DocumentTitle } from '../src/client/DocumentTitle.tsx'

afterEach(() => {
  cleanup()
  document.title = ''
  vi.unstubAllEnvs()
})

describe('DocumentTitle', () => {
  it('projects a durable title and restores the product title', () => {
    vi.stubEnv('DSH_CLIENT_TITLE', 'DeepSeek Harness')
    document.title = 'stale title'
    const mounted = render(<DocumentTitle />)
    expect(document.title).toBe('DeepSeek Harness')
    mounted.rerender(<DocumentTitle title="First title" />)
    expect(document.title).toBe('First title — DeepSeek Harness')
    mounted.rerender(<DocumentTitle title="Revised title" />)
    expect(document.title).toBe('Revised title — DeepSeek Harness')
    mounted.rerender(<DocumentTitle />)
    expect(document.title).toBe('DeepSeek Harness')
    mounted.unmount()
    expect(document.title).toBe('DeepSeek Harness')
  })

  it('uses the generic title when the build provides no title', () => {
    vi.stubEnv('DSH_CLIENT_TITLE', '')
    delete process.env.DSH_CLIENT_TITLE
    const mounted = render(<DocumentTitle title="First title" />)
    expect(document.title).toBe('First title — DSH Local Build')
    mounted.unmount()
    expect(document.title).toBe('DSH Local Build')
  })

  it('uses an explicit product profile title for blank and titled Sessions', () => {
    const mounted = render(<DocumentTitle productTitle="知我AI" />)
    expect(document.title).toBe('知我AI')
    mounted.rerender(<DocumentTitle productTitle="知我AI" title="项目经历" />)
    expect(document.title).toBe('项目经历 — 知我AI')
    mounted.unmount()
    expect(document.title).toBe('知我AI')
  })

  it('uses a complete product-profile document title without Session copy', () => {
    const mounted = render(<DocumentTitle
      documentTitle="AskmeAI | 知我AI"
      productTitle="知我AI"
      title="项目经历"
    />)
    expect(document.title).toBe('AskmeAI | 知我AI')
    mounted.unmount()
    expect(document.title).toBe('知我AI')
  })
})
