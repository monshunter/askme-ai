/** Resolve trusted deployment configuration for the Zhiwo commands. */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { ZhiwoRuntimeConfig } from './types.ts'

function integer(name: string, value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`)
  }
  return parsed
}

function boolean(name: string, value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback
  if (value === 'true' || value === '1') return true
  if (value === 'false' || value === '0') return false
  throw new Error(`${name} must be true, false, 1, or 0`)
}

function reasoningEffort(value: string | undefined): ZhiwoRuntimeConfig['modelReasoningEffort'] {
  if (value === undefined || value === '') return 'high'
  if (value === 'off' || value === 'low' || value === 'high' || value === 'max') return value
  throw new Error('ZHIWO_MODEL_REASONING_EFFORT must be off, low, high, or max')
}

async function secretValue(env: NodeJS.ProcessEnv, valueName: string, fileName: string): Promise<string | undefined> {
  const literal = env[valueName]
  if (literal !== undefined && literal.length > 0) return literal
  const file = env[fileName]
  if (file === undefined || file.length === 0) return undefined
  return (await readFile(file, 'utf8')).trim()
}

/**
 * Resolve the Public Runtime configuration from trusted process inputs.
 * @param env - deployment environment.
 * @param cwd - repository or installed application root used for local defaults.
 * @returns validated configuration with secrets loaded from their files.
 */
export async function loadRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): Promise<ZhiwoRuntimeConfig> {
  const publicOrigin = new URL(env.ZHIWO_PUBLIC_ORIGIN ?? 'http://127.0.0.1:13081')
  if (publicOrigin.protocol !== 'https:' && publicOrigin.protocol !== 'http:') {
    throw new Error('ZHIWO_PUBLIC_ORIGIN must use http or https')
  }
  const listenHost = env.ZHIWO_LISTEN_HOST ?? '127.0.0.1'
  if (listenHost !== '127.0.0.1' && listenHost !== '0.0.0.0') {
    throw new Error('ZHIWO_LISTEN_HOST must be 127.0.0.1 or 0.0.0.0')
  }
  const cookieSecretText = await secretValue(env, 'ZHIWO_COOKIE_SECRET', 'ZHIWO_COOKIE_SECRET_FILE')
  if (cookieSecretText === undefined || Buffer.byteLength(cookieSecretText) < 32) {
    throw new Error('ZHIWO_COOKIE_SECRET or ZHIWO_COOKIE_SECRET_FILE must provide at least 32 bytes')
  }
  const cookiePreviousSecretText = await secretValue(
    env,
    'ZHIWO_COOKIE_PREVIOUS_SECRET',
    'ZHIWO_COOKIE_PREVIOUS_SECRET_FILE',
  )
  if (cookiePreviousSecretText !== undefined && Buffer.byteLength(cookiePreviousSecretText) < 32) {
    throw new Error('ZHIWO_COOKIE_PREVIOUS_SECRET or ZHIWO_COOKIE_PREVIOUS_SECRET_FILE must provide at least 32 bytes')
  }
  const modelApiKey = await secretValue(env, 'ZHIWO_MODEL_API_KEY', 'ZHIWO_MODEL_API_KEY_FILE')
  if (modelApiKey === undefined || modelApiKey.length === 0) {
    throw new Error('ZHIWO_MODEL_API_KEY or ZHIWO_MODEL_API_KEY_FILE is required')
  }
  const model = env.ZHIWO_MODEL
  if (model === undefined || model.length === 0) throw new Error('ZHIWO_MODEL is required')
  const development = boolean('ZHIWO_DEVELOPMENT', env.ZHIWO_DEVELOPMENT, false)
  if (!development && publicOrigin.protocol !== 'https:') {
    throw new Error('ZHIWO_PUBLIC_ORIGIN must use https outside development')
  }
  return {
    listenHost,
    listenPort: integer('ZHIWO_LISTEN_PORT', env.ZHIWO_LISTEN_PORT, 13_081, 0, 65_535),
    publicOrigin,
    stateRoot: resolve(cwd, env.ZHIWO_STATE_ROOT ?? 'runtime/state'),
    knowledgeRoot: resolve(cwd, env.ZHIWO_KNOWLEDGE_ROOT ?? 'runtime/knowledge'),
    cookieName: env.ZHIWO_COOKIE_NAME ?? 'zhiwo_guest',
    cookieSecret: Buffer.from(cookieSecretText),
    ...cookiePreviousSecretText === undefined
      ? {}
      : { cookiePreviousSecret: Buffer.from(cookiePreviousSecretText) },
    cookieMaxAgeDays: integer('ZHIWO_COOKIE_MAX_AGE_DAYS', env.ZHIWO_COOKIE_MAX_AGE_DAYS, 180, 1, 3_650),
    sessionRetentionDays: integer('ZHIWO_SESSION_RETENTION_DAYS', env.ZHIWO_SESSION_RETENTION_DAYS, 30, 1, 3_650),
    maxSessionsPerGuest: integer('ZHIWO_MAX_SESSIONS_PER_GUEST', env.ZHIWO_MAX_SESSIONS_PER_GUEST, 50, 1, 1_000),
    maxPromptChars: integer('ZHIWO_MAX_PROMPT_CHARS', env.ZHIWO_MAX_PROMPT_CHARS, 8_000, 1, 100_000),
    maxTurnsPerSession: integer('ZHIWO_MAX_TURNS_PER_SESSION', env.ZHIWO_MAX_TURNS_PER_SESSION, 50, 1, 1_000),
    maxRequestsPerGuestMinute: integer(
      'ZHIWO_MAX_REQUESTS_PER_GUEST_MINUTE',
      env.ZHIWO_MAX_REQUESTS_PER_GUEST_MINUTE,
      10,
      1,
      10_000,
    ),
    maxRequestsPerIpMinute: integer(
      'ZHIWO_MAX_REQUESTS_PER_IP_MINUTE',
      env.ZHIWO_MAX_REQUESTS_PER_IP_MINUTE,
      30,
      1,
      10_000,
    ),
    maxConcurrentPerGuest: integer(
      'ZHIWO_MAX_CONCURRENT_PER_GUEST',
      env.ZHIWO_MAX_CONCURRENT_PER_GUEST,
      1,
      1,
      100,
    ),
    maxConcurrentPerIp: integer(
      'ZHIWO_MAX_CONCURRENT_PER_IP',
      env.ZHIWO_MAX_CONCURRENT_PER_IP,
      3,
      1,
      100,
    ),
    metricsPort: integer('ZHIWO_METRICS_PORT', env.ZHIWO_METRICS_PORT, 13_082, 0, 65_535),
    logLevel: env.ZHIWO_LOG_LEVEL === 'silent' ? 'silent' : 'info',
    modelProvider: 'zhiwo-deepseek',
    model,
    modelBaseURL: env.ZHIWO_MODEL_BASE_URL ?? 'https://api.deepseek.com',
    modelApiKey,
    modelMaxTokens: integer('ZHIWO_MODEL_MAX_TOKENS', env.ZHIWO_MODEL_MAX_TOKENS, 4_096, 1, 65_536),
    modelContextWindow: integer(
      'ZHIWO_MODEL_CONTEXT_WINDOW',
      env.ZHIWO_MODEL_CONTEXT_WINDOW,
      131_072,
      1_024,
      10_000_000,
    ),
    modelReasoningEffort: reasoningEffort(env.ZHIWO_MODEL_REASONING_EFFORT),
    development,
  }
}
