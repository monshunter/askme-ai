#!/usr/bin/env node
/** `zhiwo` product CLI: compile, serve, inspect, collect, and identify the release. */

import { access, readFile, readdir, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import {
  activateKnowledgeRevision,
  auditZhiwoRelease,
  loadCurrentKnowledgeRevision,
  loadRuntimeConfig,
  removeKnowledgeRevision,
  startZhiwoServer,
  syncKnowledge,
  ZhiwoDatabase,
  ZHIWO_ROUTE_TEMPLATES,
  ZHIWO_SCHEMA_VERSION,
  ZHIWO_TEXT_TOOL_NAMES,
} from '@deepseek-ai/dsh-zhiwo-product'
import { UPSTREAM_BASE, ZHIWO_VERSION } from './version.ts'

function stateRoot(cwd: string): string {
  return resolve(cwd, process.env.ZHIWO_STATE_ROOT ?? 'runtime/state')
}

function knowledgeRoot(cwd: string): string {
  return resolve(cwd, process.env.ZHIWO_KNOWLEDGE_ROOT ?? 'runtime/knowledge')
}

function appRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..')
}

function positiveInteger(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`)
  return parsed
}

const program = new Command()
  .name('zhiwo')
  .description('知我只读个人知识库产品')
  .showHelpAfterError()

program.command('sync')
  .description('将 userdata 编译为不可变知识 revision')
  .option('--source <path>', 'userdata 目录', 'userdata')
  .option('--config <path>', 'zhiwo.yaml 路径')
  .option('--check', '只验证，不激活')
  .option('--json', '输出机器可读 JSON')
  .action(async (options: {
    source: string
    config?: string
    check?: boolean
    json?: boolean
  }) => {
    const cwd = process.cwd()
    const source = process.env.ZHIWO_SOURCE_ROOT ?? options.source
    const configFile = process.env.ZHIWO_CONFIG_FILE ?? options.config
    const report = await syncKnowledge({
      sourceRoot: resolve(cwd, source),
      knowledgeRoot: knowledgeRoot(cwd),
      ...configFile === undefined ? {} : { configFile: resolve(cwd, configFile) },
      check: options.check === true,
      productVersion: ZHIWO_VERSION,
      upstreamBase: UPSTREAM_BASE,
    })
    process.stdout.write(`${JSON.stringify({
      revisionId: report.revision.id,
      activated: report.activated,
      checkedOnly: report.checkedOnly,
      manifest: report.revision.manifest,
      audit: report.audit,
    }, null, 2)}\n`)
  })

program.command('serve')
  .description('启动唯一 Public Runtime 与产品 Web UI')
  .option('--dev', '启用仅供本机开发的 HTTP 配置')
  .action(async (options: { dev?: boolean }) => {
    const cwd = process.cwd()
    if (process.env.ZHIWO_SOURCE_ROOT !== undefined || process.env.ZHIWO_CONFIG_FILE !== undefined) {
      throw new Error('Public Runtime must not receive owner-plane source or policy paths')
    }
    if (options.dev === true) process.env.ZHIWO_DEVELOPMENT = 'true'
    const config = await loadRuntimeConfig(process.env, cwd)
    const distRoot = join(appRoot(), 'dist')
    const handle = await startZhiwoServer(
      config,
      join(config.stateRoot, 'zhiwo.db'),
      distRoot,
      { version: ZHIWO_VERSION, upstreamBase: UPSTREAM_BASE },
    )
    process.stdout.write(`知我已就绪：${handle.origin.origin}；指标：${handle.metricsOrigin.origin}/metrics\n`)
    const stop = async (): Promise<void> => {
      await handle.close()
      process.exitCode = 0
    }
    process.once('SIGINT', () => void stop())
    process.once('SIGTERM', () => void stop())
  })

program.command('doctor')
  .description('检查配置、制品、revision、数据库与固定产品表面')
  .action(async () => {
    const cwd = process.cwd()
    const config = await loadRuntimeConfig(process.env, cwd)
    await auditZhiwoRelease(join(appRoot(), 'dist'), {
      version: ZHIWO_VERSION,
      upstreamBase: UPSTREAM_BASE,
    })
    const revision = await loadCurrentKnowledgeRevision(config.knowledgeRoot)
    const database = new ZhiwoDatabase(join(config.stateRoot, 'zhiwo.db'))
    let diagnostics: ReturnType<ZhiwoDatabase['diagnostics']>
    database.registerRevision(revision)
    try {
      diagnostics = database.diagnostics()
    } finally {
      database.close()
    }
    process.stdout.write(`${JSON.stringify({
      status: 'ok',
      version: ZHIWO_VERSION,
      upstreamBase: UPSTREAM_BASE,
      revisionId: revision.id,
      sourceCount: revision.sources.length,
      toolCatalog: ZHIWO_TEXT_TOOL_NAMES,
      routes: ZHIWO_ROUTE_TEMPLATES,
      database: diagnostics,
      modelRouteConfigured: config.model.length > 0 && config.modelApiKey.length > 0,
      cookieSecretConfigured: config.cookieSecret.byteLength >= 32,
      rawSourceConfiguredInRuntime: process.env.ZHIWO_SOURCE_ROOT !== undefined,
    }, null, 2)}\n`)
  })

program.command('gc')
  .description('删除 current revision 之外且未被会话引用的知识 revision')
  .option('--dry-run', '仅列出可删除 revision')
  .action(async (options: { dryRun?: boolean }) => {
    const cwd = process.cwd()
    const root = knowledgeRoot(cwd)
    const pointer = JSON.parse(await readFile(join(root, 'current.json'), 'utf8')) as { revisionId: string }
    const revisionsRoot = join(root, 'revisions')
    const removed: string[] = []
    const minimumRevisions = positiveInteger('ZHIWO_MIN_REVISIONS', process.env.ZHIWO_MIN_REVISIONS, 2)
    const retentionDays = positiveInteger(
      'ZHIWO_SESSION_RETENTION_DAYS',
      process.env.ZHIWO_SESSION_RETENTION_DAYS,
      30,
    )
    const database = new ZhiwoDatabase(join(stateRoot(cwd), 'zhiwo.db'))
    let expiredSessions = 0
    let orphanGuests = 0
    try {
      const revisions = (await Promise.all((await readdir(revisionsRoot, { withFileTypes: true }))
        .filter(entry => entry.isDirectory())
        .map(async entry => ({
          id: entry.name,
          createdAt: (await readFile(join(revisionsRoot, entry.name, 'manifest.json'), 'utf8')
            .then(text => (JSON.parse(text) as { createdAt: number }).createdAt)),
        })))).sort((left, right) => right.createdAt - left.createdAt)
      const retainedHistory = new Set(revisions.slice(0, minimumRevisions).map(revision => revision.id))
      for (const revision of revisions) {
        if (revision.id === pointer.revisionId
          || retainedHistory.has(revision.id)
          || database.isRevisionReferenced(revision.id)) continue
        if (options.dryRun !== true) await removeKnowledgeRevision(root, revision.id)
        removed.push(revision.id)
      }
      const cutoff = Date.now() - retentionDays * 86_400_000
      expiredSessions = options.dryRun === true
        ? database.countExpiredSessions(cutoff)
        : database.deleteExpiredSessions(cutoff)
      orphanGuests = options.dryRun === true
        ? database.countOrphanGuests()
        : database.deleteOrphanGuests()
    } finally {
      database.close()
    }
    try {
      await access(join(root, '.sync.lock'))
    } catch {
      if (options.dryRun !== true) await rm(join(root, '.staging'), { recursive: true, force: true })
    }
    process.stdout.write(`${JSON.stringify({
      dryRun: options.dryRun === true,
      removedRevisions: removed,
      expiredSessions,
      orphanGuests,
      minimumRevisions,
    }, null, 2)}\n`)
  })

program.command('rollback')
  .description('将 Current 原子切换到一个仍然合法的旧 revision')
  .argument('<revision-id>', '要恢复的 revision id')
  .action(async (revisionId: string) => {
    const revision = await activateKnowledgeRevision(knowledgeRoot(process.cwd()), revisionId)
    process.stdout.write(`${JSON.stringify({ status: 'ok', revisionId: revision.id }, null, 2)}\n`)
  })

program.command('version')
  .description('打印产品版本与官方 upstream baseline')
  .action(async () => {
    const manifest = JSON.parse(await readFile(join(appRoot(), 'dist', 'build-manifest.json'), 'utf8')) as {
      commit: string
      builtAt: string
    }
    process.stdout.write([
      `zhiwo ${ZHIWO_VERSION}`,
      `upstream ${UPSTREAM_BASE}`,
      `build commit ${manifest.commit}`,
      `build time ${manifest.builtAt}`,
      `schema ${ZHIWO_SCHEMA_VERSION}`,
      `compiler ${ZHIWO_VERSION}`,
      '',
    ].join('\n'))
  })

await program.parseAsync()
