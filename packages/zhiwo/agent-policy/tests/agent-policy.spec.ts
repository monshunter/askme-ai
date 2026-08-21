import { describe, expect, it } from 'vitest'
import { workspaceRelativePath } from '../src/index.ts'

describe('Zhiwo Agent workspace policy', () => {
  it('normalizes relative paths without accepting host path syntax', () => {
    expect(workspaceRelativePath('project/./README.md')).toBe('project/README.md')
    expect(workspaceRelativePath('../outside.md')).toBe('../outside.md')
    expect(workspaceRelativePath('/etc/passwd')).toBeUndefined()
    expect(workspaceRelativePath('C:\\Users\\owner\\notes.md')).toBeUndefined()
    expect(workspaceRelativePath('folder\\notes.md')).toBeUndefined()
    expect(workspaceRelativePath('notes\0private.md')).toBeUndefined()
  })
})
