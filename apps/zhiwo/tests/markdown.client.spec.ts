import { describe, expect, it } from 'vitest'
import { safeMarkdownUrl } from '../src/client/markdown.ts'

describe('untrusted assistant Markdown', () => {
  it('allows reviewed link protocols and rejects active, relative, fragment, and image destinations', () => {
    const node: Parameters<typeof safeMarkdownUrl>[2] = {
      type: 'element',
      tagName: 'a',
      properties: {},
      children: [],
    }
    expect(safeMarkdownUrl('https://example.test/path', 'href', node)).toBe('https://example.test/path')
    expect(safeMarkdownUrl('mailto:owner@example.test', 'href', node)).toBe('mailto:owner@example.test')
    expect(safeMarkdownUrl('javascript:alert(1)', 'href', node)).toBeNull()
    expect(safeMarkdownUrl('data:text/html,active', 'href', node)).toBeNull()
    expect(safeMarkdownUrl('/internal', 'href', node)).toBeNull()
    expect(safeMarkdownUrl('#fragment', 'href', node)).toBeNull()
    expect(safeMarkdownUrl('https://tracker.example/pixel.png', 'src', node)).toBeNull()
  })
})
