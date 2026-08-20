/** Root-scoped, read-only knowledge tools exposed by the Zhiwo agent. */

import { readFile } from 'node:fs/promises'
import { globPattern } from './policy.ts'
import { resolveRevisionArtifact } from './knowledge.ts'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { KnowledgeRevision, SourceLocation, SourceRecord } from './types.ts'

const MAX_READ_LINES = 400
const MAX_READ_CHARS = 64_000
const MAX_GLOB_RESULTS = 200
const MAX_GREP_RESULTS = 100

/** One source access made available to the current model turn. */
export interface SourceAccess {
  sourceId: string
  tool: 'read' | 'read_image' | 'grep' | 'glob'
  location?: SourceLocation
  excerpt?: string
}

/** Callback invoked only after source content has actually been read or matched. */
export type RecordSourceAccess = (access: SourceAccess) => void

function sourceByPath(revision: KnowledgeRevision, path: string): SourceRecord {
  if (path.startsWith('/') || path.includes('\\') || path.split('/').includes('..')) {
    throw new Error('path must be relative to the read-only userdata view')
  }
  const source = revision.sources.find(candidate => candidate.logicalPath === path)
  if (source === undefined) throw new Error('source was not found in this knowledge revision')
  return source
}

async function sourceText(revision: KnowledgeRevision, source: SourceRecord): Promise<string> {
  if (source.contentArtifact === undefined
    || (source.readability !== 'native_text' && source.readability !== 'derived_text')) {
    throw new Error('source does not have readable text')
  }
  return readFile(resolveRevisionArtifact(revision, source.contentArtifact), 'utf8')
}

function lineRange(text: string, requestedStart: number | undefined, requestedEnd: number | undefined): {
  content: string
  lineStart: number
  lineEnd: number
} {
  const lines = text.split(/\r?\n/u)
  const lineStart = Math.max(1, requestedStart ?? 1)
  const requestedLast = requestedEnd ?? lineStart + MAX_READ_LINES - 1
  const lineEnd = Math.min(lines.length, requestedLast, lineStart + MAX_READ_LINES - 1)
  if (lineStart > lines.length || lineEnd < lineStart) throw new Error('requested line range is outside the source')
  const content = lines.slice(lineStart - 1, lineEnd).join('\n').slice(0, MAX_READ_CHARS)
  return { content, lineStart, lineEnd }
}

const sourceResultProperties = {
  source_id: { type: 'string', required: true },
  revision_id: { type: 'string', required: true },
  path: { type: 'string', required: true },
  title: { type: 'string', required: true },
} as const

function readTool(revision: KnowledgeRevision, recordAccess: RecordSourceAccess): ToolDefinition {
  return defineTool({
    name: 'read',
    description: 'Read text from one file in the read-only userdata view. Paths must come from glob or grep. Use the returned source_id and line range when citing facts.',
    parameters: {
      path: { type: 'string', required: true, description: 'Path relative to the fixed read-only userdata root.' },
      line_start: { type: 'integer', description: 'First 1-based line. Defaults to 1.' },
      line_end: { type: 'integer', description: `Last 1-based line, limited to ${MAX_READ_LINES} lines.` },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ...sourceResultProperties,
          line_start: { type: 'integer', required: true },
          line_end: { type: 'integer', required: true },
          content: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args, exec) {
      if (exec.signal.aborted) throw exec.signal.reason
      const source = sourceByPath(revision, args.path)
      const range = lineRange(await sourceText(revision, source), args.line_start, args.line_end)
      recordAccess({
        sourceId: source.id,
        tool: 'read',
        location: { lineStart: range.lineStart, lineEnd: range.lineEnd },
        excerpt: range.content.slice(0, 500),
      })
      return {
        source_id: source.id,
        revision_id: revision.id,
        path: source.logicalPath,
        title: source.displayTitle,
        line_start: range.lineStart,
        line_end: range.lineEnd,
        content: range.content,
      }
    },
  })
}

function globTool(revision: KnowledgeRevision): ToolDefinition {
  return defineTool({
    name: 'glob',
    description: 'List file paths in the fixed read-only userdata view. This discovers files but does not count as reading them.',
    parameters: {
      pattern: { type: 'string', required: true, description: 'Glob using *, **, and ? over /-separated relative paths.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          sources: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: sourceResultProperties,
            },
          },
          truncated: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute(args, exec) {
      if (exec.signal.aborted) throw exec.signal.reason
      const matcher = globPattern(args.pattern)
      const matched = revision.sources.filter(source => matcher.test(source.logicalPath))
      return Promise.resolve({
        sources: matched.slice(0, MAX_GLOB_RESULTS).map(source => ({
          source_id: source.id,
          revision_id: revision.id,
          path: source.logicalPath,
          title: source.displayTitle,
        })),
        truncated: matched.length > MAX_GLOB_RESULTS,
      })
    },
  })
}

function grepTool(revision: KnowledgeRevision, recordAccess: RecordSourceAccess): ToolDefinition {
  return defineTool({
    name: 'grep',
    description: 'Search readable files in the read-only userdata view for a literal text pattern. Every returned match is an accessed source and can be cited.',
    parameters: {
      pattern: { type: 'string', required: true, description: 'Literal text to find, matched case-insensitively.' },
      glob: { type: 'string', description: 'Optional path glob used before reading files.' },
      max_results: { type: 'integer', description: `Maximum matches, capped at ${MAX_GREP_RESULTS}.` },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          matches: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                ...sourceResultProperties,
                line: { type: 'integer', required: true },
                excerpt: { type: 'string', required: true },
              },
            },
          },
          truncated: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args, exec) {
      if (args.pattern.length === 0 || args.pattern.length > 500) throw new Error('pattern must contain 1 to 500 characters')
      const matcher = args.glob === undefined ? undefined : globPattern(args.glob)
      const limit = Math.min(MAX_GREP_RESULTS, Math.max(1, args.max_results ?? 20))
      const needle = args.pattern.toLocaleLowerCase('en')
      const matches: Array<{
        source_id: string
        revision_id: string
        path: string
        title: string
        line: number
        excerpt: string
      }> = []
      let truncated = false
      for (const source of revision.sources) {
        if (exec.signal.aborted) throw exec.signal.reason
        if (matcher !== undefined && !matcher.test(source.logicalPath)) continue
        if (source.readability !== 'native_text' && source.readability !== 'derived_text') continue
        const lines = (await sourceText(revision, source)).split(/\r?\n/u)
        for (let index = 0; index < lines.length; index += 1) {
          const line = lines[index] ?? ''
          if (!line.toLocaleLowerCase('en').includes(needle)) continue
          const excerpt = line.slice(0, 500)
          recordAccess({
            sourceId: source.id,
            tool: 'grep',
            location: { lineStart: index + 1, lineEnd: index + 1 },
            excerpt,
          })
          if (matches.length < limit) {
            matches.push({
              source_id: source.id,
              revision_id: revision.id,
              path: source.logicalPath,
              title: source.displayTitle,
              line: index + 1,
              excerpt,
            })
          } else {
            truncated = true
            break
          }
        }
        if (truncated) break
      }
      return { matches, truncated }
    },
  })
}

/**
 * Build the exact text-tool catalog for one revision-bound model turn.
 * @param revision - immutable session revision.
 * @param recordAccess - turn-local source access collector.
 * @returns read-only tool definitions in product prompt order.
 */
export function createZhiwoTools(
  revision: KnowledgeRevision,
  recordAccess: RecordSourceAccess,
): readonly ToolDefinition[] {
  return [readTool(revision, recordAccess), globTool(revision), grepTool(revision, recordAccess)]
}

/** Runtime tool names permitted by the Public Runtime startup audit. */
export const ZHIWO_TEXT_TOOL_NAMES = ['read', 'glob', 'grep'] as const
