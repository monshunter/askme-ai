/** Last-line privacy policy for model output entering a Zhiwo Session log. */

import { basename } from 'node:path'
import { homedir } from 'node:os'
import type { Context } from '@deepseek-ai/cordis'
import { BlockAssembler } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'

/** Safe response substituted before any unsafe assistant chunk reaches the Session. */
export const UNSAFE_OUTPUT_FALLBACK = '现有资料不足以安全回答这个问题。你可以换一种问法，或请资料所有者补充可公开的资料。'

function assistantText(chunks: readonly StreamChunk[]): string {
  const assembler = new BlockAssembler()
  for (const chunk of chunks) assembler.push(chunk)
  return assembler.blocks()
    .filter(block => block.type === 'text' || block.type === 'reasoning')
    .map(block => block.text)
    .join('\n')
}

/**
 * Detect host paths, host-user identity, and private runtime configuration vocabulary.
 * @param text - assistant-visible text.
 * @param workspaceRoot - private canonical workspace root.
 * @returns true when publication would disclose host state.
 */
export function containsUnsafeAssistantContent(text: string, workspaceRoot: string): boolean {
  const hostUser = basename(homedir())
  return text.includes(workspaceRoot)
    || (hostUser.length >= 4 && text.includes(hostUser))
    || /file:\/\//iu.test(text)
    || /(?:^|[^\p{L}\p{N}:])\/(?:[^/\s]+\/)+[^/\s]*/u.test(text)
    || /(?:^|[^\p{L}\p{N}:])\/(?:Users|home|root|etc|var|private|tmp|opt|usr)(?:\/|\s|$)/u.test(text)
    || /[A-Za-z]:\\(?:[^\\\s]+\\)+[^\\\s]*/u.test(text)
    || /\b(?:DSH_HOME|ZHIWO_[A-Z_]+|DEEPSEEK_API_KEY|process\.env)\b/u.test(text)
    || /\b(?:(?:current|this|the) workspace|workspace (?:root|path|materials|contains|has)|host environment|environment variable)\b/iu
      .test(text)
    || /(?:当前|本)工作区|工作区(?:根目录|路径|资料|中|内)|宿主(?:环境|路径|主机)|环境变量/u.test(text)
}

/**
 * Recursively inspect a parsed native response without JSON escaping path separators.
 * @param value - parsed response value.
 * @param workspaceRoot - private canonical workspace root.
 * @returns true when any nested string contains private host state.
 */
export function containsUnsafeValue(value: unknown, workspaceRoot: string): boolean {
  if (typeof value === 'string') return containsUnsafeAssistantContent(value, workspaceRoot)
  if (Array.isArray(value)) return value.some(item => containsUnsafeValue(item, workspaceRoot))
  if (value === null || typeof value !== 'object') return false
  return Object.values(value).some(item => containsUnsafeValue(item, workspaceRoot))
}

/**
 * Buffer one Zhiwo response so unsafe content is replaced before publication.
 * @param options - provider request carrying the optional Session id.
 * @param workspaceRoot - private canonical workspace root.
 * @param next - downstream model stream.
 * @returns original safe chunks or one fixed safe response.
 */
export function safeZhiwoStream(
  options: GenerateOptions,
  workspaceRoot: string,
  next: () => AsyncIterable<StreamChunk>,
): AsyncIterable<StreamChunk> {
  if (!options.sessionId?.startsWith('zhiwo-')) return next()
  return (async function* (): AsyncIterable<StreamChunk> {
    const chunks: StreamChunk[] = []
    for await (const chunk of next()) chunks.push(chunk)
    let unsafe = true
    try {
      unsafe = containsUnsafeAssistantContent(assistantText(chunks), workspaceRoot)
    } catch {
      // An unknown or malformed streamed block cannot bypass the publication guard.
    }
    if (!unsafe) {
      yield* chunks
      return
    }
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: UNSAFE_OUTPUT_FALLBACK }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: UNSAFE_OUTPUT_FALLBACK } }
    const usage = chunks.findLast(chunk => chunk.type === 'usage')
    if (usage !== undefined) yield usage
    yield { type: 'finish', reason: { kind: 'stop' } }
  })()
}

/**
 * Install the Zhiwo-only model-output guard.
 * @param ctx - Host context carrying the LLM stream event.
 * @param workspaceRoot - private canonical workspace root.
 */
export function installOutputPolicy(ctx: Context, workspaceRoot: string): void {
  ctx.on('llm/stream', (options, next) => safeZhiwoStream(options, workspaceRoot, next))
}
