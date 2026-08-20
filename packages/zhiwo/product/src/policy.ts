/** Parse the optional `zhiwo.yaml` compiler configuration. */

import { load } from 'js-yaml'
import type { ZhiwoPolicy } from './types.ts'

const DEFAULT_STARTER_QUESTIONS = [
  '他最有代表性的三个项目是什么？',
  '他的 Kubernetes 与 GitOps 经验到什么深度？',
  '他做过哪些 AI Agent 或 Harness Engineering 实践？',
  '他适合 AI Infra / Agent Platform 岗位吗？',
]

function record(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`)
  }
  return value as Record<string, unknown>
}

function keys(value: Record<string, unknown>, allowed: readonly string[], name: string): void {
  const unexpected = Object.keys(value).filter(key => !allowed.includes(key))
  if (unexpected.length > 0) throw new Error(`${name} contains unsupported field ${unexpected[0]}`)
}

function positiveInteger(value: unknown, name: string, fallback: number): number {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`${name} must be a positive safe integer`)
  }
  return value as number
}

function booleanValue(value: unknown, name: string, fallback: boolean): boolean {
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') throw new Error(`${name} must be boolean`)
  return value
}

function validatePattern(pattern: string, name: string): void {
  if (pattern.startsWith('/') || pattern.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(pattern)) {
    throw new Error(`${name} must be relative to userdata`)
  }
  if (pattern.split(/[\\/]/).includes('..')) throw new Error(`${name} must not contain ..`)
  if (pattern.includes('\\')) throw new Error(`${name} must use / as the separator`)
  if (pattern.length > 1_000) throw new Error(`${name} is too long`)
}

/**
 * Return the compiler configuration used when `zhiwo.yaml` is absent.
 * @returns the frozen compiler defaults.
 */
export function defaultPolicy(): ZhiwoPolicy {
  return {
    version: 1,
    compiler: {
      maxFileBytes: 50 * 1024 * 1024,
      maxTotalBytes: 2 * 1024 * 1024 * 1024,
      maxEntries: 100_000,
      maxDepth: 64,
      maxArchiveEntries: 0,
      git: { enabled: true, includeHistorySummary: true, maxCommits: 5_000 },
      images: { enableRuntimeRead: false },
    },
    starterQuestions: [...DEFAULT_STARTER_QUESTIONS],
  }
}

/**
 * Parse a complete `zhiwo.yaml`; invalid input throws and never falls back to defaults.
 * @param text - YAML document text.
 * @returns validated policy with all defaults materialized.
 */
export function parsePolicy(text: string): ZhiwoPolicy {
  const parsed = record(load(text), 'zhiwo.yaml')
  keys(parsed, ['version', 'compiler', 'starter_questions'], 'zhiwo.yaml')
  if (parsed.version !== 1) throw new Error('zhiwo.yaml version must be 1')

  const compiler = parsed.compiler === undefined ? {} : record(parsed.compiler, 'compiler')
  keys(
    compiler,
    [
      'max_file_bytes', 'max_total_bytes', 'max_entries', 'max_depth', 'max_archive_entries',
      'git', 'images',
    ],
    'compiler',
  )
  if (compiler.max_archive_entries !== undefined && compiler.max_archive_entries !== 0) {
    throw new Error('compiler.max_archive_entries must be 0 because recursive archive extraction is disabled')
  }
  const git = compiler.git === undefined ? {} : record(compiler.git, 'compiler.git')
  keys(git, ['enabled', 'include_history_summary', 'max_commits'], 'compiler.git')
  const images = compiler.images === undefined ? {} : record(compiler.images, 'compiler.images')
  keys(images, ['enable_runtime_read'], 'compiler.images')

  const starterQuestions: string[] = []
  const starterInput = parsed.starter_questions ?? DEFAULT_STARTER_QUESTIONS
  if (!Array.isArray(starterInput)) throw new Error('starter_questions must be an array of non-empty strings')
  for (const question of starterInput) {
    if (typeof question !== 'string' || question.trim().length === 0) {
      throw new Error('starter_questions must be an array of non-empty strings')
    }
    starterQuestions.push(question.trim())
  }

  return {
    version: 1,
    compiler: {
      maxFileBytes: positiveInteger(compiler.max_file_bytes, 'compiler.max_file_bytes', 50 * 1024 * 1024),
      maxTotalBytes: positiveInteger(compiler.max_total_bytes, 'compiler.max_total_bytes', 2 * 1024 * 1024 * 1024),
      maxEntries: positiveInteger(compiler.max_entries, 'compiler.max_entries', 100_000),
      maxDepth: positiveInteger(compiler.max_depth, 'compiler.max_depth', 64),
      maxArchiveEntries: 0,
      git: {
        enabled: booleanValue(git.enabled, 'compiler.git.enabled', true),
        includeHistorySummary: booleanValue(
          git.include_history_summary,
          'compiler.git.include_history_summary',
          true,
        ),
        maxCommits: positiveInteger(git.max_commits, 'compiler.git.max_commits', 5_000),
      },
      images: {
        enableRuntimeRead: booleanValue(images.enable_runtime_read, 'compiler.images.enable_runtime_read', false),
      },
    },
    starterQuestions,
  }
}

/**
 * Convert the documented glob subset to a full-path matcher.
 * @param pattern - normalized rule pattern.
 * @returns regular expression matching `/`-separated logical paths.
 */
export function globPattern(pattern: string): RegExp {
  validatePattern(pattern, 'pattern')
  let out = '^'
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern.charAt(index)
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        index += 1
        if (pattern[index + 1] === '/') {
          index += 1
          out += '(?:.*/)?'
        } else {
          out += '.*'
        }
      } else {
        out += '[^/]*'
      }
      continue
    }
    if (char === '?') {
      out += '[^/]'
      continue
    }
    out += char.replace(/[|\\{}()[\]^$+?.-]/g, '\\$&')
  }
  return new RegExp(`${out}$`, 'u')
}
