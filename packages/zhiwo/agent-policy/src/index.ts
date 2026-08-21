/** Zhiwo Agent policy: confine every discovery tool to its Session workspace. */

import { normalize, posix, sep, win32 } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-fs'
import type {
  JsonValue, PostToolDecision, PreToolDecision, ToolExecution, ToolExecutionResult,
} from '@deepseek-ai/dsh-tools'

/** Stable Cordis plugin name. */
export const name = 'zhiwo-agent-policy'
/** Filesystem identity and tool-policy services required by the guard. */
export const inject = ['fs', 'tools']

const PATH_TOOLS = new Set(['glob', 'grep', 'read'])
const DENIAL = 'Zhiwo tools can only access the provided materials.'

function record(value: unknown): Record<string, JsonValue> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, JsonValue>
    : undefined
}

function requestedPath(exec: ToolExecution): string | undefined {
  const args = record(exec.arguments)
  if (exec.name === 'read') return typeof args?.['file_path'] === 'string' ? args['file_path'] : undefined
  if (exec.name === 'glob' || exec.name === 'grep') {
    return typeof args?.['path'] === 'string' ? args['path'] : '.'
  }
  return undefined
}

/**
 * Return a stable model-facing relative spelling, or reject absolute/cross-platform path syntax.
 * @param path - model-supplied path.
 * @returns normalized relative path, or undefined for forbidden syntax.
 */
export function workspaceRelativePath(path: string): string | undefined {
  if (path.includes('\0') || path.includes('\\') || posix.isAbsolute(path)
    || win32.isAbsolute(path) || /^[A-Za-z]:/u.test(path)) return undefined
  const value = normalize(path).split(sep).join('/')
  return value === '' ? '.' : value
}

async function workspaceDecision(
  ctx: Context,
  exec: ToolExecution,
  next: () => Promise<PreToolDecision>,
): Promise<PreToolDecision> {
  if (!PATH_TOOLS.has(exec.name)) return next()
  const cwd = exec.agent?.session.header.cwd
  const path = requestedPath(exec)
  if (cwd === undefined || path === undefined || workspaceRelativePath(path) === undefined) {
    return { kind: 'deny', reason: DENIAL }
  }
  try {
    const [root, target] = await Promise.all([
      ctx.fs.resolve(cwd, { signal: exec.signal }),
      ctx.fs.resolve(path, { cwd, signal: exec.signal }),
    ])
    if (!ctx.fs.contains(root, target)) return { kind: 'deny', reason: DENIAL }
  } catch {
    // Resolution failures contain provider paths; the model receives one fixed policy denial.
    return { kind: 'deny', reason: DENIAL }
  }
  return next()
}

async function relativeReadResult(
  exec: ToolExecution,
  result: Readonly<ToolExecutionResult>,
  next: () => Promise<PostToolDecision>,
): Promise<PostToolDecision> {
  const decision = await next()
  if (exec.name !== 'read' || result.isError || decision.kind === 'block') return decision
  const path = requestedPath(exec)
  const relativePath = path === undefined ? undefined : workspaceRelativePath(path)
  const source = record('value' in decision ? decision.value : result.value)
  if (relativePath === undefined || source === undefined || typeof source['path'] !== 'string') return decision
  return {
    kind: 'accept',
    value: { ...source, path: relativePath },
    ...decision.additionalContexts === undefined ? {} : { additionalContexts: decision.additionalContexts },
  }
}

/**
 * Install the fail-closed workspace read guard and relative read-result projection.
 * @param ctx - Agent scope carrying filesystem and tool services.
 */
export function apply(ctx: Context): void {
  ctx.on('tools/pre-execute', (exec, next) => workspaceDecision(ctx, exec, next))
  ctx.on('tools/post-execute', (exec, result, next) => relativeReadResult(exec, result, next))
}
