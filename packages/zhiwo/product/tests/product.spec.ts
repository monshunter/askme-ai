import { chmod, link, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { backup, DatabaseSync } from 'node:sqlite'
import { zipSync, strToU8 } from 'fflate'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { startMockLlmServer } from '@deepseek-ai/dsh-llm-mock-server'
import type { MockLlmServer } from '@deepseek-ai/dsh-llm-mock-server'
import { assertWriteRequest, resolveGuestIdentity } from '../src/identity.ts'
import {
  activateKnowledgeRevision,
  convertSourceIsolated,
  loadCurrentKnowledgeRevision,
  syncKnowledge,
} from '../src/knowledge.ts'
import { ZhiwoDatabase } from '../src/database.ts'
import { ZhiwoKernel } from '../src/kernel.ts'
import type { ProductStreamEvent } from '../src/kernel.ts'
import { defaultPolicy, parsePolicy } from '../src/policy.ts'
import type { KnowledgeRevision, ZhiwoRuntimeConfig } from '../src/types.ts'

const roots: string[] = []
const servers: MockLlmServer[] = []
const kernels: ZhiwoKernel[] = []
const execFileAsync = promisify(execFile)

afterEach(async () => {
  await Promise.all(kernels.splice(0).map(kernel => kernel.close()))
  await Promise.all(servers.splice(0).map(server => server.close()))
  await Promise.all(roots.splice(0).map(forceRemove))
})

async function forceRemove(path: string): Promise<void> {
  try {
    await chmod(path, 0o700)
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (entry.isDirectory()) await forceRemove(join(path, entry.name))
    }
  } catch {
    // Missing test residue needs no permission repair.
  }
  await rm(path, { recursive: true, force: true })
}

async function root(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'zhiwo-product-'))
  roots.push(path)
  return path
}

function config(path: string, baseURL: string): ZhiwoRuntimeConfig {
  return {
    listenHost: '127.0.0.1',
    listenPort: 0,
    publicOrigin: new URL('http://127.0.0.1:0'),
    stateRoot: join(path, 'state'),
    knowledgeRoot: join(path, 'knowledge'),
    cookieName: 'zhiwo_guest',
    cookieSecret: Buffer.alloc(32, 7),
    cookieMaxAgeDays: 30,
    sessionRetentionDays: 30,
    maxSessionsPerGuest: 10,
    maxPromptChars: 8_000,
    maxTurnsPerSession: 10,
    maxRequestsPerGuestMinute: 100,
    maxRequestsPerIpMinute: 100,
    maxConcurrentPerGuest: 1,
    maxConcurrentPerIp: 3,
    metricsPort: 0,
    logLevel: 'silent',
    modelProvider: 'zhiwo-deepseek',
    model: 'mock-model',
    modelBaseURL: baseURL,
    modelApiKey: 'mock-key',
    modelMaxTokens: 1_024,
    modelContextWindow: 16_384,
    modelReasoningEffort: 'high',
    development: true,
  }
}

function emptyRevision(id = 'rev_test_deadbeef'): KnowledgeRevision {
  return {
    id,
    root: '/not-used',
    manifest: {
      id, createdAt: 1, upstreamProductVersion: '0.4.0',
      sourceRootChecksum: 'a', catalogChecksum: 'b', auditChecksum: 'c',
      compilerVersion: '0.4.0', converterVersions: {}, starterQuestions: [],
      sourceCount: 0,
      readabilityCount: {
        native_text: 0, native_image: 0, derived_text: 0, metadata_only: 0, unsupported: 0, failed: 0,
      },
      totalSourceBytes: 0, totalArtifactBytes: 0,
      auditSummary: { suspiciousSecretCount: 0, failedSourceCount: 0, oversizedSourceCount: 0, warningCount: 0 },
    },
    sources: [],
  }
}

function revisionWithSource(): KnowledgeRevision {
  const revision = emptyRevision()
  return {
    ...revision,
    manifest: {
      ...revision.manifest,
      sourceCount: 1,
      readabilityCount: { ...revision.manifest.readabilityCount, native_text: 1 },
    },
    sources: [{
      id: 'src_11111111-1111-1111-1111-111111111111',
      revision: revision.id,
      logicalPath: 'profile.md',
      displayTitle: 'profile.md',
      mediaType: 'text/plain; charset=utf-8',
      readability: 'native_text',
      sourceChecksum: 'source-checksum',
    }],
  }
}

function minimalPdf(text: string): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${text.length + 31} >>\nstream\nBT /F1 12 Tf 72 720 Td (${text}) Tj ET\nendstream`,
  ]
  let body = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body))
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = Buffer.byteLength(body)
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  body += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(body)
}

function officeArchiveWithForgedExpandedSize(): Buffer {
  const archive = Buffer.from(zipSync({
    'word/document.xml': strToU8('<w:document><w:body><w:p>small</w:p></w:body></w:document>'),
  }))
  const directoryOffset = archive.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
  if (directoryOffset < 0) throw new Error('test ZIP has no central directory')
  archive.writeUInt32LE(129 * 1024 * 1024, directoryOffset + 24)
  return archive
}

describe('compiler policy and identity', () => {
  it('accepts only compiler tunables because every userdata file has the same read-only access', () => {
    expect(defaultPolicy().compiler.maxEntries).toBe(100_000)
    const policy = parsePolicy(`
version: 1
compiler:
  max_entries: 42
`)
    expect(policy.compiler.maxEntries).toBe(42)
    expect(() => parsePolicy('version: 1\ndefaults:\n  visibility: private\n')).toThrow(/unsupported field/u)
    expect(() => parsePolicy('version: 1\nunknown: true')).toThrow(/unsupported field/u)
  })

  it('signs guest cookies and binds CSRF to the subject and origin', () => {
    const secret = Buffer.alloc(32, 3)
    const first = resolveGuestIdentity(undefined, 'guest', secret, 30)
    expect(first.setCookie).toContain('HttpOnly')
    expect(first.setCookie).toContain('Secure')
    expect(first.setCookie).toContain('SameSite=Lax')
    const cookie = first.setCookie!.split(';', 1)[0]
    const second = resolveGuestIdentity(cookie, 'guest', secret, 30)
    expect(second.guestId).toBe(first.guestId)
    expect(second.setCookie).toBeUndefined()
    expect(() => { assertWriteRequest('POST', {
      origin: 'https://example.test',
      csrfToken: second.csrfToken,
    }, new URL('https://example.test'), second.csrfToken) }).not.toThrow()
    expect(() => { assertWriteRequest('POST', {
      origin: 'https://attacker.test',
      csrfToken: second.csrfToken,
    }, new URL('https://example.test'), second.csrfToken) }).toThrow('ZHIWO_ORIGIN_REJECTED')

    const nextSecret = Buffer.alloc(32, 4)
    const rotated = resolveGuestIdentity(cookie, 'guest', nextSecret, 30, true, secret)
    expect(rotated.guestId).toBe(first.guestId)
    expect(rotated.setCookie).toBeDefined()
    const rotatedCookie = rotated.setCookie!.split(';', 1)[0]
    const afterRotation = resolveGuestIdentity(rotatedCookie, 'guest', nextSecret, 30)
    expect(afterRotation.guestId).toBe(first.guestId)
    expect(afterRotation.setCookie).toBeUndefined()
  })
})

describe('knowledge compiler and product database', () => {
  it('fails closed while compiling arbitrary files, Office documents, and safe immutable artifacts', async () => {
    const path = await root()
    const userdata = join(path, 'userdata')
    await mkdir(join(userdata, 'private'), { recursive: true })
    await writeFile(join(userdata, 'profile.md'), 'Kubernetes platform work\n', 'utf8')
    await writeFile(join(userdata, 'private', 'secret.txt'), 'password=do-not-copy-12345\n', 'utf8')
    await writeFile(join(userdata, 'brief.pdf'), minimalPdf('PDF project evidence'))
    await writeFile(join(userdata, 'bio.docx'), zipSync({
      'word/document.xml': strToU8('<w:document><w:body><w:p><w:r><w:t>Office project evidence</w:t></w:r></w:p></w:body></w:document>'),
    }))
    await writeFile(join(userdata, 'slides.pptx'), zipSync({
      'ppt/slides/slide1.xml': strToU8('<p:sld><a:p><a:r><a:t>Platform presentation evidence</a:t></a:r></a:p></p:sld>'),
    }))
    await writeFile(join(userdata, 'sheet.xlsx'), zipSync({
      'xl/sharedStrings.xml': strToU8('<sst><si><t>Spreadsheet evidence</t></si></sst>'),
      'xl/worksheets/sheet1.xml': strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData></worksheet>'),
    }))
    await writeFile(join(userdata, 'expanded-bomb.docx'), officeArchiveWithForgedExpandedSize())
    await writeFile(join(userdata, 'unknown.bin'), Buffer.from([0, 1, 2, 3]))
    const outside = join(path, 'outside.txt')
    await writeFile(outside, 'host-only hardlink content\n', 'utf8')
    await link(outside, join(userdata, 'hardlink.txt'))
    await symlink('/etc/passwd', join(userdata, 'escape-link'))
    await writeFile(join(userdata, 'zhiwo.yaml'), 'version: 1\n', 'utf8')
    const report = await syncKnowledge({
      sourceRoot: userdata,
      knowledgeRoot: join(path, 'knowledge'),
      productVersion: '0.4.0',
      upstreamBase: '141eb6fef83422698aef7a981029e843e8161534',
    })
    expect(report.activated).toBe(true)
    expect(report.revision.sources.map(source => source.logicalPath).sort()).toEqual([
      'bio.docx', 'brief.pdf', 'expanded-bomb.docx', 'private/secret.txt', 'profile.md', 'sheet.xlsx', 'slides.pptx', 'unknown.bin',
    ])
    expect(report.revision.manifest.readabilityCount.derived_text).toBe(4)
    expect(report.revision.manifest.readabilityCount.metadata_only).toBe(1)
    expect(report.revision.manifest.readabilityCount.failed).toBe(1)
    expect(report.audit.failedSourceCount).toBe(1)
    expect(report.audit.skippedSymlinkCount).toBe(1)
    expect(report.audit.skippedSpecialNodeCount).toBe(1)
    const catalog = await readFile(join(report.revision.root, 'catalog.json'), 'utf8')
    expect(catalog).toContain('private/secret.txt')
    expect(catalog).not.toContain('hardlink.txt')
    expect(catalog).not.toContain('escape-link')
    const derived = report.revision.sources.filter(source => source.readability === 'derived_text')
    const contents = await Promise.all(derived.map(source => readFile(join(report.revision.root, source.contentArtifact!), 'utf8')))
    expect(contents.join('\n')).toContain('PDF project evidence')
    expect(contents.join('\n')).toContain('Office project evidence')
    expect(contents.join('\n')).toContain('Platform presentation evidence')
    expect(contents.join('\n')).toContain('Spreadsheet evidence')
    expect(report.revision.sources.find(source => source.logicalPath === 'brief.pdf')?.locationMap)
      .toMatchObject([{ page: 1 }])
    expect(report.revision.sources.find(source => source.logicalPath === 'slides.pptx')?.locationMap)
      .toMatchObject([{ slide: 1 }])
    expect(report.revision.sources.find(source => source.logicalPath === 'sheet.xlsx')?.locationMap)
      .toMatchObject([{ sheet: 'sheet1' }])

    const current = report.revision.id
    await writeFile(join(userdata, 'zhiwo.yaml'), 'version: 1\nunknown: true\n', 'utf8')
    await expect(syncKnowledge({
      sourceRoot: userdata,
      knowledgeRoot: join(path, 'knowledge'),
      productVersion: '0.4.0',
      upstreamBase: '141eb6fef83422698aef7a981029e843e8161534',
    })).rejects.toThrow(/unsupported field/u)
    expect((await loadCurrentKnowledgeRevision(join(path, 'knowledge'))).id).toBe(current)

    await writeFile(join(userdata, 'zhiwo.yaml'), 'version: 1\n', 'utf8')
    const checked = await syncKnowledge({
      sourceRoot: userdata,
      knowledgeRoot: join(path, 'knowledge'),
      productVersion: '0.4.0',
      upstreamBase: '141eb6fef83422698aef7a981029e843e8161534',
      check: true,
    })
    expect(checked).toMatchObject({ checkedOnly: true, activated: false })
    expect((await loadCurrentKnowledgeRevision(join(path, 'knowledge'))).id).toBe(current)

    await writeFile(join(userdata, 'leak.txt'), 'api_key=sk-this-is-a-secret-value\n', 'utf8')
    const withSensitiveData = await syncKnowledge({
      sourceRoot: userdata,
      knowledgeRoot: join(path, 'knowledge'),
      productVersion: '0.4.0',
      upstreamBase: '141eb6fef83422698aef7a981029e843e8161534',
    })
    expect(withSensitiveData.audit.suspiciousSecretCount).toBeGreaterThan(0)
    expect(withSensitiveData.revision.sources.map(source => source.logicalPath)).toContain('leak.txt')
  }, 20_000)

  it('terminates a converter that exceeds its owner-plane deadline', async () => {
    const path = await root()
    const source = join(path, 'profile.txt')
    await writeFile(source, 'Evidence.\n', 'utf8')
    await expect(convertSourceIsolated(source, 1)).rejects.toThrow(/resource limit|worker failed/u)
  })

  it('counts directories when enforcing the compiler entry limit', async () => {
    const path = await root()
    const userdata = join(path, 'userdata')
    await mkdir(join(userdata, 'nested'), { recursive: true })
    await writeFile(join(userdata, 'nested', 'profile.md'), 'Evidence.\n', 'utf8')
    await writeFile(join(userdata, 'zhiwo.yaml'), 'version: 1\ncompiler:\n  max_entries: 1\n', 'utf8')
    await expect(syncKnowledge({
      sourceRoot: userdata,
      knowledgeRoot: join(path, 'knowledge'),
      productVersion: '0.4.0',
      upstreamBase: '141eb6fef83422698aef7a981029e843e8161534',
    })).rejects.toThrow('userdata exceeds compiler.max_entries')
  })

  it('summarizes local Git history without hooks or remote credentials', async () => {
    const path = await root()
    const userdata = join(path, 'userdata')
    const repository = join(userdata, 'project')
    await mkdir(repository, { recursive: true })
    await execFileAsync('git', ['init', '-q'], { cwd: repository })
    await writeFile(join(repository, 'README.md'), 'Project evidence\n', 'utf8')
    await execFileAsync('git', ['add', 'README.md'], { cwd: repository })
    await execFileAsync('git', ['-c', 'user.name=Candidate', '-c', 'user.email=candidate@example.test', 'commit', '-qm', 'Initial evidence'], { cwd: repository })
    await execFileAsync('git', ['remote', 'add', 'origin', 'https://token:private@example.test/repository.git'], { cwd: repository })
    const hookMarker = join(path, 'hook-ran')
    await writeFile(join(repository, '.git', 'hooks', 'post-checkout'), `#!/bin/sh\ntouch '${hookMarker}'\n`, { mode: 0o700 })
    const report = await syncKnowledge({
      sourceRoot: userdata,
      knowledgeRoot: join(path, 'knowledge'),
      productVersion: '0.4.0',
      upstreamBase: '141eb6fef83422698aef7a981029e843e8161534',
    })
    const summary = report.revision.sources.find(source => source.logicalPath.endsWith('git-summary.txt'))
    expect(summary).toBeDefined()
    const content = await readFile(join(report.revision.root, summary!.contentArtifact!), 'utf8')
    expect(content).toContain('Commit count: 1')
    expect(content).not.toContain('token:private')
    await expect(readFile(hookMarker, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('keeps ownership predicates on every public session lookup and hard delete', async () => {
    const database = new ZhiwoDatabase(':memory:')
    database.touchGuest('guest-a')
    database.touchGuest('guest-b')
    database.registerRevision(emptyRevision())
    const session = database.createSession('guest-a', 'rev_test_deadbeef', 'owned')
    expect(() => database.requireSession('guest-b', session.id)).toThrow('ZHIWO_SESSION_NOT_FOUND')
    expect(database.deleteSession('guest-b', session.id)).toBe(false)
    expect(database.deleteSession('guest-a', session.id)).toBe(true)
    expect(database.deleteSession('guest-a', session.id)).toBe(false)
    expect(database.listSessions('guest-a')).toEqual([])
    database.close()
  })

  it('completes deletion intents and fails interrupted generations on restart', async () => {
    const path = await root()
    const databasePath = join(path, 'state', 'zhiwo.db')
    const database = new ZhiwoDatabase(databasePath)
    database.touchGuest('guest-a')
    database.registerRevision(emptyRevision())
    const interrupted = database.createSession('guest-a', 'rev_test_deadbeef', 'interrupted')
    database.insertMessage('guest-a', interrupted.id, {
      id: 'msg_interrupted', role: 'assistant', content: '', status: 'streaming', createdAt: 1, citations: [], trace: [],
    })
    database.setGenerationState('guest-a', interrupted.id, 'running')
    const deleting = database.createSession('guest-a', 'rev_test_deadbeef', 'deleting')
    database.markSessionForDeletion('guest-a', deleting.id, 'cancelling')
    database.close()

    const recovered = new ZhiwoDatabase(databasePath)
    expect(recovered.requireSession('guest-a', interrupted.id)).toMatchObject({ generationState: 'failed' })
    expect(recovered.listMessages('guest-a', interrupted.id)).toMatchObject([{
      id: 'msg_interrupted', status: 'failed', content: '回答因服务重启而中断，请重试。', citations: [],
    }])
    expect(() => recovered.requireSession('guest-a', deleting.id)).toThrow('ZHIWO_SESSION_NOT_FOUND')
    expect(recovered.diagnostics()).toEqual({ schemaVersion: 3, integrity: 'ok', foreignKeyViolations: 0 })
    recovered.close()
  })

  it('migrates the previous schema while retaining source access and grants with foreign keys', async () => {
    const path = await root()
    const databasePath = join(path, 'state', 'zhiwo.db')
    const revision = revisionWithSource()
    const source = revision.sources[0]!
    const database = new ZhiwoDatabase(databasePath)
    database.touchGuest('guest-a')
    database.registerRevision(revision)
    const session = database.createSession('guest-a', revision.id, 'migration')
    database.insertMessage('guest-a', session.id, {
      id: 'msg_migration', role: 'assistant', content: '', status: 'streaming', createdAt: 1, citations: [], trace: [],
    })
    database.recordSourceAccess(
      'guest-a', session.id, 'turn_migration', revision.id, source.id, 'read', { lineStart: 1, lineEnd: 1 },
    )
    database.finalizeAssistant('guest-a', session.id, {
      id: 'msg_migration', role: 'assistant', content: 'Evidence [1]', status: 'completed', createdAt: 1,
      citations: [{
        id: source.id, title: source.displayTitle, openable: true, downloadable: false,
      }],
      trace: [],
    })
    database.close()

    const versionOne = new DatabaseSync(databasePath)
    versionOne.exec('ALTER TABLE session_messages DROP COLUMN trace_json')
    versionOne.exec('UPDATE schema_meta SET version = 1 WHERE singleton = 1')
    versionOne.close()

    const migrated = new ZhiwoDatabase(databasePath)
    expect(migrated.diagnostics()).toEqual({ schemaVersion: 3, integrity: 'ok', foreignKeyViolations: 0 })
    expect(migrated.hasSourceGrant('guest-a', session.id, source.id)).toBe(true)
    migrated.close()
    const inspected = new DatabaseSync(databasePath, { readOnly: true })
    expect(inspected.prepare('SELECT revision_id, tool FROM turn_source_access').get()).toEqual({
      revision_id: revision.id,
      tool: 'read',
    })
    expect(inspected.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    inspected.close()
  })

  it('backs up and restores retained data without resurrecting a session deleted before the backup', async () => {
    const path = await root()
    const databasePath = join(path, 'state', 'zhiwo.db')
    const backupPath = join(path, 'backup', 'zhiwo.db')
    const restoredPath = join(path, 'restored', 'zhiwo.db')
    await mkdir(join(path, 'backup'), { recursive: true })
    await mkdir(join(path, 'restored'), { recursive: true })
    const database = new ZhiwoDatabase(databasePath)
    database.touchGuest('guest-a')
    database.registerRevision(emptyRevision())
    const retained = database.createSession('guest-a', 'rev_test_deadbeef', 'retained')
    const deleted = database.createSession('guest-a', 'rev_test_deadbeef', 'deleted')
    expect(database.deleteSession('guest-a', deleted.id)).toBe(true)
    database.close()

    const source = new DatabaseSync(databasePath)
    await backup(source, backupPath)
    source.close()
    const backupDatabase = new DatabaseSync(backupPath, { readOnly: true })
    await backup(backupDatabase, restoredPath)
    backupDatabase.close()

    const restored = new ZhiwoDatabase(restoredPath)
    expect(restored.requireSession('guest-a', retained.id).title).toBe('retained')
    expect(() => restored.requireSession('guest-a', deleted.id)).toThrow('ZHIWO_SESSION_NOT_FOUND')
    expect(restored.diagnostics()).toEqual({ schemaVersion: 3, integrity: 'ok', foreignKeyViolations: 0 })
    restored.close()
    const restarted = new ZhiwoDatabase(restoredPath)
    expect(() => restarted.requireSession('guest-a', deleted.id)).toThrow('ZHIWO_SESSION_NOT_FOUND')
    restarted.close()
  })
})

describe('real upstream Agent Loop composition', () => {
  it('executes only the scoped read tool and accepts a citation from the actual turn access set', async () => {
    const path = await root()
    const userdata = join(path, 'userdata')
    await mkdir(userdata, { recursive: true })
    await writeFile(join(userdata, 'profile.md'), 'Built a Kubernetes platform.\nAdded session isolation.\n', 'utf8')
    await writeFile(join(userdata, 'zhiwo.yaml'), 'version: 1\n', 'utf8')
    const report = await syncKnowledge({
      sourceRoot: userdata,
      knowledgeRoot: join(path, 'knowledge'),
      productVersion: '0.4.0',
      upstreamBase: '141eb6fef83422698aef7a981029e843e8161534',
    })
    const sourceId = report.revision.sources[0]!.id
    const mock = await startMockLlmServer({
      sequence: ['tool_call_success', 'reasoning_success'],
      apiKey: 'mock-key',
      toolName: 'read',
      toolArguments: JSON.stringify({ path: 'profile.md', line_start: 1, line_end: 2 }),
      reasoningText: '先读取 userdata 中的资料，再整理有来源的回答。',
      successText: `他构建过 Kubernetes 平台。[[cite:${sourceId}:L1-L1]]并增加了会话隔离。[[cite:${sourceId}:L2-L2]]`,
    })
    servers.push(mock)
    const kernel = await ZhiwoKernel.create(config(path, mock.baseURL), join(path, 'state', 'zhiwo.db'))
    kernels.push(kernel)
    const events: ProductStreamEvent[] = []
    const result = await kernel.prompt('guest-a', '他做过什么？', undefined, event => events.push(event))
    expect(result.message.content).toBe('他构建过 Kubernetes 平台。[1]并增加了会话隔离。[1]')
    expect(result.message.citations).toMatchObject([{
      id: sourceId,
      openable: true,
      location: { lineStart: 1, lineEnd: 2 },
    }])
    expect(events.map(event => event.type)).toEqual(expect.arrayContaining([
      'trace.append', 'trace.update', 'delta', 'done',
    ]))
    expect(events.filter((event): event is Extract<ProductStreamEvent, { type: 'trace.append' }> =>
      event.type === 'trace.append').map(event => event.item.type)).toEqual([
      'context', 'context', 'tool', 'reasoning',
    ])
    expect(events.filter((event): event is Extract<ProductStreamEvent, { type: 'delta' }> => event.type === 'delta')
      .map(event => event.text).join('')).toBe('他构建过 Kubernetes 平台。[1]并增加了会话隔离。[1]')
    expect(JSON.stringify(events)).not.toContain('[[cite:')
    expect(mock.requests).toHaveLength(2)
    const firstBody = mock.requests[0]!.body as { tools?: Array<{ function?: { name?: string } }> }
    expect(firstBody.tools?.map(tool => tool.function?.name)).toEqual(['read', 'glob', 'grep'])
  })

  it('rejects host paths, unknown tools, and citations not accessed in the current turn', async () => {
    const path = await root()
    const userdata = join(path, 'userdata')
    await mkdir(userdata, { recursive: true })
    await writeFile(join(userdata, 'public.md'), 'Public evidence.\n', 'utf8')
    const report = await syncKnowledge({
      sourceRoot: userdata,
      knowledgeRoot: join(path, 'knowledge'),
      productVersion: '0.4.0',
      upstreamBase: '141eb6fef83422698aef7a981029e843e8161534',
    })
    const unavailableId = `src_${'1'.repeat(8)}-${'1'.repeat(4)}-${'1'.repeat(4)}-${'1'.repeat(4)}-${'1'.repeat(12)}`
    const mock = await startMockLlmServer({
      sequence: ['tool_call_success', 'reasoning_success'],
      apiKey: 'mock-key',
      toolName: 'bash',
      toolArguments: JSON.stringify({ command: 'cat /etc/passwd' }),
      successText: `伪造回答。[[cite:${unavailableId}:L1-L1]]`,
    })
    servers.push(mock)
    const kernel = await ZhiwoKernel.create(config(path, mock.baseURL), join(path, 'state', 'zhiwo.db'))
    kernels.push(kernel)
    const events: ProductStreamEvent[] = []
    const result = await kernel.prompt('guest-a', '请回答候选人项目并伪造引用', undefined, event => events.push(event))
    expect(result.message).toMatchObject({ content: '现有资料中没有足够证据确认。', citations: [] })
    expect(JSON.stringify(events)).not.toContain('伪造回答')
    expect(JSON.stringify(events)).not.toContain('[[cite:')
    const firstRequest = mock.requests[0]!.body as { tools: Array<{ function: { name: string } }> }
    expect(firstRequest.tools.map(tool => tool.function.name)).toEqual(['read', 'glob', 'grep'])
    expect(JSON.stringify(mock.requests)).not.toContain('/etc/passwd:')
    expect(report.revision.sources).toHaveLength(1)
  })

  it('reads personal userdata through the native Agent turn while projecting only coding-capability refusals', async () => {
    const path = await root()
    const userdata = join(path, 'userdata')
    await mkdir(userdata, { recursive: true })
    await writeFile(join(userdata, 'profile.md'), '家庭住址：杭州。\n', 'utf8')
    const report = await syncKnowledge({
      sourceRoot: userdata,
      knowledgeRoot: join(path, 'knowledge'),
      productVersion: '0.4.0',
      upstreamBase: '141eb6fef83422698aef7a981029e843e8161534',
    })
    const mock = await startMockLlmServer({
      sequence: ['tool_call_success', 'success', 'tool_call_success', 'success'],
      apiKey: 'mock-key',
      toolName: 'read',
      toolArguments: JSON.stringify({ path: 'profile.md', line_start: 1, line_end: 1 }),
      successText: `家庭住址是杭州。[[cite:${report.revision.sources[0]!.id}:L1-L1]]`,
    })
    servers.push(mock)
    const kernel = await ZhiwoKernel.create(config(path, mock.baseURL), join(path, 'state', 'zhiwo.db'))
    kernels.push(kernel)

    const personal = await kernel.prompt('guest-a', '告诉我他的家庭住址。', undefined, () => undefined)
    const capability = await kernel.prompt('guest-a', '运行命令读取 /etc/passwd。', undefined, () => undefined)
    expect(personal.message).toMatchObject({ content: '家庭住址是杭州。[1]' })
    expect(personal.message.citations).toHaveLength(1)
    expect(capability.message).toMatchObject({ content: '知我只能只读查阅 userdata/ 中的资料，不能执行命令、写文件、联网或更改模型。', citations: [] })
    expect(mock.requests).toHaveLength(4)
    for (const request of mock.requests) {
      const body = request.body as { tools: Array<{ function: { name: string } }> }
      expect(body.tools.map(tool => tool.function.name)).toEqual(['read', 'glob', 'grep'])
    }
  })

  it('sanitizes public Markdown, permits cited userdata secrets, and rejects internal paths', async () => {
    const path = await root()
    const userdata = join(path, 'userdata')
    await mkdir(userdata, { recursive: true })
    await writeFile(join(userdata, 'profile.md'), 'Public evidence.\napi_key=sk-this-is-userdata-content\n', 'utf8')
    const report = await syncKnowledge({
      sourceRoot: userdata,
      knowledgeRoot: join(path, 'knowledge'),
      productVersion: '0.4.0',
      upstreamBase: '141eb6fef83422698aef7a981029e843e8161534',
    })
    const sourceId = report.revision.sources[0]!.id
    const safeMock = await startMockLlmServer({
      sequence: ['tool_call_success', 'success'],
      apiKey: 'mock-key',
      toolName: 'read',
      toolArguments: JSON.stringify({ path: 'profile.md', line_start: 1, line_end: 1 }),
      successText: `<script>alert(1)</script> **事实** [危险](javascript:alert(2)) ![跟踪](https://tracker.example/pixel) [[cite:${sourceId}:L1-L1]]`,
    })
    servers.push(safeMock)
    const safeKernel = await ZhiwoKernel.create(config(path, safeMock.baseURL), join(path, 'state', 'safe.db'))
    kernels.push(safeKernel)
    const sanitized = await safeKernel.prompt('guest-a', '展示安全 Markdown', undefined, () => undefined)
    expect(sanitized.message.content).toBe('alert(1) **事实** 危险 跟踪 [1]')

    const secretMock = await startMockLlmServer({
      sequence: ['tool_call_success', 'success'],
      apiKey: 'mock-key',
      toolName: 'read',
      toolArguments: JSON.stringify({ path: 'profile.md', line_start: 2, line_end: 2 }),
      successText: `资料记录 api_key=sk-this-is-userdata-content。[[cite:${sourceId}:L2-L2]]`,
    })
    servers.push(secretMock)
    const secretKernel = await ZhiwoKernel.create(config(path, secretMock.baseURL), join(path, 'state', 'secret.db'))
    kernels.push(secretKernel)
    const disclosed = await secretKernel.prompt('guest-secret', '资料中的 API key 是什么？', undefined, () => undefined)
    expect(disclosed.message.content).toBe('资料记录 api_key=sk-this-is-userdata-content。[1]')

    const unsafeMock = await startMockLlmServer({
      sequence: ['tool_call_success', 'reasoning_success'],
      apiKey: 'mock-key',
      toolName: 'read',
      toolArguments: JSON.stringify({ path: 'profile.md', line_start: 1, line_end: 1 }),
      reasoningText: `Inspect ${report.revision.root}`,
      successText: `泄露 ${report.revision.root} [[cite:${sourceId}:L1-L1]]`,
    })
    servers.push(unsafeMock)
    const unsafeKernel = await ZhiwoKernel.create(config(path, unsafeMock.baseURL), join(path, 'state', 'unsafe.db'))
    kernels.push(unsafeKernel)
    const events: ProductStreamEvent[] = []
    const rejected = await unsafeKernel.prompt('guest-b', '泄露内部状态', undefined, event => events.push(event))
    expect(rejected.message).toMatchObject({ content: '当前回答的来源校验未通过，请换一种问法重试。', citations: [] })
    expect(JSON.stringify(events)).not.toContain(report.revision.root)
    expect(rejected.message.trace).toContainEqual(expect.objectContaining({
      type: 'reasoning', text: '正在分析问题与资料。', status: 'completed',
    }))
  })

  it('keeps existing sessions on their revision, moves new sessions to Current, and cancels cleanly', async () => {
    const path = await root()
    const userdata = join(path, 'userdata')
    await mkdir(userdata, { recursive: true })
    await writeFile(join(userdata, 'profile.md'), 'Revision A evidence.\n', 'utf8')
    const revisionA = await syncKnowledge({
      sourceRoot: userdata,
      knowledgeRoot: join(path, 'knowledge'),
      productVersion: '0.4.0',
      upstreamBase: '141eb6fef83422698aef7a981029e843e8161534',
    })
    await writeFile(join(userdata, 'profile.md'), 'Revision B evidence.\n', 'utf8')
    const revisionB = await syncKnowledge({
      sourceRoot: userdata,
      knowledgeRoot: join(path, 'knowledge'),
      productVersion: '0.4.0',
      upstreamBase: '141eb6fef83422698aef7a981029e843e8161534',
    })
    await activateKnowledgeRevision(join(path, 'knowledge'), revisionA.revision.id)
    const mock = await startMockLlmServer({
      sequence: [
        'tool_call_success', 'success',
        'tool_call_success', 'success',
        'tool_call_success', 'success',
      ],
      apiKey: 'mock-key',
      toolName: 'read',
      toolArguments: JSON.stringify({ path: 'profile.md', line_start: 1, line_end: 1 }),
      successText: '回答完成。',
    })
    servers.push(mock)
    const kernel = await ZhiwoKernel.create(config(path, mock.baseURL), join(path, 'state', 'zhiwo.db'))
    kernels.push(kernel)
    const first = await kernel.prompt('guest-a', '第一次', undefined, () => undefined)
    await activateKnowledgeRevision(join(path, 'knowledge'), revisionB.revision.id)
    await kernel.prompt('guest-a', '继续旧会话', first.sessionId, () => undefined)
    const second = await kernel.prompt('guest-a', '新会话', undefined, () => undefined)
    expect(kernel.database.requireSession('guest-a', first.sessionId).knowledgeRevisionId).toBe(revisionA.revision.id)
    expect(kernel.database.requireSession('guest-a', second.sessionId).knowledgeRevisionId).toBe(revisionB.revision.id)
    expect(JSON.stringify((mock.requests[1]!.body as { messages: unknown }).messages)).toContain('Revision A evidence.')
    expect(JSON.stringify((mock.requests[3]!.body as { messages: unknown }).messages)).toContain('Revision A evidence.')
    expect(JSON.stringify((mock.requests[5]!.body as { messages: unknown }).messages)).toContain('Revision B evidence.')
    expect(kernel.database.isRevisionReferenced(revisionA.revision.id)).toBe(true)
    await kernel.deleteSession('guest-a', first.sessionId)
    expect(kernel.database.isRevisionReferenced(revisionA.revision.id)).toBe(false)
  })

  it('settles an active generation as cancelled without exposing provider details', async () => {
    const path = await root()
    const userdata = join(path, 'userdata')
    await mkdir(userdata, { recursive: true })
    await writeFile(join(userdata, 'profile.md'), 'Evidence.\n', 'utf8')
    await syncKnowledge({
      sourceRoot: userdata,
      knowledgeRoot: join(path, 'knowledge'),
      productVersion: '0.4.0',
      upstreamBase: '141eb6fef83422698aef7a981029e843e8161534',
    })
    const mock = await startMockLlmServer({
      sequence: ['slow_success'],
      apiKey: 'mock-key',
      successText: 'This response should be cancelled before completion.',
      chunkSize: 1,
      chunkDelayMs: 20,
    })
    servers.push(mock)
    const kernel = await ZhiwoKernel.create(config(path, mock.baseURL), join(path, 'state', 'zhiwo.db'))
    kernels.push(kernel)
    const result = await kernel.prompt('guest-a', '停止测试', undefined, (event) => {
      if (event.type === 'start') queueMicrotask(() => { kernel.cancel('guest-a', event.sessionId) })
    })
    expect(result.message).toMatchObject({ status: 'cancelled', content: '回答已停止。' })
    expect(result.message.content).not.toContain('provider')
  })
})
