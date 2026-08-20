/** Compile mutable userdata into immutable read-only knowledge revisions. */

import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import {
  cp,
  chmod,
  mkdir,
  lstat,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import { unzipSync } from 'fflate'
import { promisify } from 'node:util'
import { Worker } from 'node:worker_threads'
import { PDFParse } from 'pdf-parse'
import { defaultPolicy, parsePolicy } from './policy.ts'
import type {
  KnowledgeAudit,
  KnowledgeRevision,
  KnowledgeRevisionManifest,
  Readability,
  SourceRecord,
  SourceLocationMapEntry,
  SyncOptions,
  SyncReport,
  ZhiwoPolicy,
} from './types.ts'

const COMPILER_VERSION = '0.4.0'
const execFileAsync = promisify(execFile)
const MAX_DERIVED_TEXT_BYTES = 20 * 1024 * 1024
const MAX_EXPANDED_OFFICE_BYTES = 128 * 1024 * 1024
const MAX_OFFICE_ENTRIES = 10_000
const TEXT_EXTENSIONS = new Set([
  '.c', '.cc', '.conf', '.cpp', '.css', '.csv', '.go', '.h', '.hpp', '.html',
  '.ini', '.java', '.js', '.json', '.jsx', '.log', '.md', '.mjs', '.py', '.rb',
  '.rs', '.sh', '.sql', '.svg', '.toml', '.ts', '.tsx', '.txt', '.xml', '.yaml', '.yml',
])
const IMAGE_EXTENSIONS = new Set(['.avif', '.gif', '.heic', '.jpeg', '.jpg', '.png', '.webp'])
const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/u,
  /\bsk-[A-Za-z0-9_-]{20,}\b/u,
  /(?:api[_-]?key|password|secret|token)\s*[:=]\s*['"]?(?:[A-Z0-9_./+=]|-){12,}/iu,
]

interface PendingSource {
  absolutePath: string
  logicalPath: string
  size: number
}

/** Structured converter result transferred from the bounded worker. */
export interface ConvertedSource {
  readability: Readability
  content?: string
  mediaType?: string
  converter?: { name: string; version: string }
  locationMap?: SourceLocationMapEntry[]
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

function pathInside(root: string, candidate: string): boolean {
  const result = relative(root, candidate)
  return result === '' || (!result.startsWith(`..${sep}`) && result !== '..' && !result.startsWith(sep))
}

function logicalPath(root: string, absolutePath: string): string {
  return relative(root, absolutePath).split(sep).join('/')
}

function emptyAudit(): KnowledgeAudit {
  return {
    readabilityCount: {
      native_text: 0,
      native_image: 0,
      derived_text: 0,
      metadata_only: 0,
      unsupported: 0,
      failed: 0,
    },
    suspiciousSecretCount: 0,
    failedSourceCount: 0,
    oversizedSourceCount: 0,
    skippedSpecialNodeCount: 0,
    skippedSymlinkCount: 0,
    warnings: [],
  }
}

async function collectFiles(
  root: string,
  policy: ZhiwoPolicy,
  audit: KnowledgeAudit,
): Promise<{ files: PendingSource[]; gitRepositories: string[] }> {
  const files: PendingSource[] = []
  const gitRepositories: string[] = []
  let totalBytes = 0
  let entryCount = 0
  const visit = async (directory: string, depth: number): Promise<void> => {
    if (depth > policy.compiler.maxDepth) throw new Error('userdata exceeds compiler.max_depth')
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))
    for (const entry of entries) {
      if (entry.name === '.git') {
        gitRepositories.push(directory)
        continue
      }
      if (directory === root && entry.name === 'zhiwo.yaml') continue
      entryCount += 1
      if (entryCount > policy.compiler.maxEntries) throw new Error('userdata exceeds compiler.max_entries')
      const absolutePath = join(directory, entry.name)
      const metadata = await lstat(absolutePath)
      if (metadata.isSymbolicLink()) {
        audit.skippedSymlinkCount += 1
        audit.warnings.push(`Skipped symbolic link: ${logicalPath(root, absolutePath)}`)
        continue
      }
      if (metadata.isDirectory()) {
        await visit(absolutePath, depth + 1)
        continue
      }
      if (!metadata.isFile()) {
        audit.skippedSpecialNodeCount += 1
        audit.warnings.push(`Skipped special filesystem node: ${logicalPath(root, absolutePath)}`)
        continue
      }
      if (metadata.nlink > 1) {
        audit.skippedSpecialNodeCount += 1
        audit.warnings.push(`Skipped hard-linked file: ${logicalPath(root, absolutePath)}`)
        continue
      }
      if (metadata.size > policy.compiler.maxFileBytes) {
        audit.oversizedSourceCount += 1
        audit.warnings.push(`Skipped oversized file: ${logicalPath(root, absolutePath)}`)
        continue
      }
      totalBytes += metadata.size
      if (totalBytes > policy.compiler.maxTotalBytes) throw new Error('userdata exceeds compiler.max_total_bytes')
      files.push({ absolutePath, logicalPath: logicalPath(root, absolutePath), size: metadata.size })
    }
  }
  await visit(root, 0)
  return { files, gitRepositories: [...new Set(gitRepositories)] }
}

function decodeXmlText(xml: string): string {
  return xml
    .replace(/<w:tab\b[^>]*\/>/gu, '\t')
    .replace(/<w:br\b[^>]*\/>/gu, '\n')
    .replace(/<\/w:p>/gu, '\n')
    .replace(/<a:br\b[^>]*\/>/gu, '\n')
    .replace(/<\/a:p>/gu, '\n')
    .replace(/<[^>]+>/gu, '')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&amp;/gu, '&')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
}

function officeArchive(bytes: Buffer): Record<string, Uint8Array> {
  const minimumEndOffset = Math.max(0, bytes.byteLength - 65_557)
  let endOffset = -1
  for (let offset = bytes.byteLength - 22; offset >= minimumEndOffset; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) {
      endOffset = offset
      break
    }
  }
  if (endOffset < 0) throw new Error('Office document has no valid ZIP directory')
  const entryCount = bytes.readUInt16LE(endOffset + 10)
  const directoryBytes = bytes.readUInt32LE(endOffset + 12)
  const directoryOffset = bytes.readUInt32LE(endOffset + 16)
  if (entryCount === 0xffff || directoryBytes === 0xffffffff || directoryOffset === 0xffffffff) {
    throw new Error('ZIP64 Office documents are not supported')
  }
  if (entryCount > MAX_OFFICE_ENTRIES) throw new Error('Office document contains too many archive entries')
  if (directoryOffset + directoryBytes > endOffset) throw new Error('Office document has an invalid ZIP directory')
  let expandedBytes = 0
  let cursor = directoryOffset
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > bytes.byteLength || bytes.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error('Office document has an invalid ZIP entry')
    }
    const flags = bytes.readUInt16LE(cursor + 8)
    if ((flags & 0x1) !== 0) throw new Error('Encrypted Office documents are not supported')
    expandedBytes += bytes.readUInt32LE(cursor + 24)
    if (expandedBytes > MAX_EXPANDED_OFFICE_BYTES) {
      throw new Error('Office document expands beyond the compiler limit')
    }
    const nameBytes = bytes.readUInt16LE(cursor + 28)
    const extraBytes = bytes.readUInt16LE(cursor + 30)
    const commentBytes = bytes.readUInt16LE(cursor + 32)
    cursor += 46 + nameBytes + extraBytes + commentBytes
  }
  if (cursor !== directoryOffset + directoryBytes) throw new Error('Office document ZIP directory length is invalid')
  const archive = unzipSync(bytes)
  const entries = Object.entries(archive)
  if (entries.length !== entryCount) throw new Error('Office document ZIP entry count is invalid')
  const expanded = entries.reduce((total, [, value]) => total + value.byteLength, 0)
  if (expanded !== expandedBytes) throw new Error('Office document ZIP sizes are invalid')
  return archive
}

function sectionedText(
  sections: Array<{ heading: string; text: string; location: Omit<SourceLocationMapEntry, 'lineStart' | 'lineEnd'> }>,
): { content: string; locationMap: SourceLocationMapEntry[] } {
  const chunks: string[] = []
  const locationMap: SourceLocationMapEntry[] = []
  let nextLine = 1
  for (const section of sections) {
    const chunk = `${section.heading}\n${section.text.trim()}`
    const lineCount = chunk.split('\n').length
    chunks.push(chunk)
    locationMap.push({ lineStart: nextLine, lineEnd: nextLine + lineCount - 1, ...section.location })
    nextLine += lineCount + 2
  }
  const content = chunks.join('\n\n')
  if (Buffer.byteLength(content) > MAX_DERIVED_TEXT_BYTES) throw new Error('derived text exceeds compiler limit')
  return { content, locationMap }
}

function worksheetText(xml: string, sharedStrings: readonly string[]): string {
  const lines: string[] = []
  for (const match of xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gu)) {
    const attributes = match[1] ?? ''
    const body = match[2] ?? ''
    const reference = /\br="([A-Z]+[0-9]+)"/u.exec(attributes)?.[1] ?? '?'
    const value = /<v>([\s\S]*?)<\/v>/u.exec(body)?.[1]
    const inline = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/u.exec(body)?.[1]
    const shared = /\bt="s"/u.test(attributes) && value !== undefined ? sharedStrings[Number(value)] : undefined
    const text = decodeXmlText(shared ?? inline ?? value ?? '')
    if (text.length > 0) lines.push(`${reference}: ${text}`)
  }
  return lines.join('\n')
}

/**
 * Convert one already-policy-approved source without writing outside the caller's staging revision.
 * @param path - canonical owner-plane source path.
 * @returns bounded text, logical locations, or a metadata-only classification.
 */
export async function convertSource(path: string): Promise<ConvertedSource> {
  const extension = extname(path).toLowerCase()
  if (TEXT_EXTENSIONS.has(extension) || extension === '') {
    const bytes = await readFile(path)
    if (bytes.includes(0)) return { readability: 'metadata_only' }
    return { readability: 'native_text', content: bytes.toString('utf8'), mediaType: 'text/plain; charset=utf-8' }
  }
  if (extension === '.pdf') {
    const parser = new PDFParse({ data: await readFile(path) })
    try {
      const result = await parser.getText()
      if (result.pages.length > 2_000) throw new Error('PDF exceeds the page limit')
      const converted = sectionedText(result.pages.map(page => ({
        heading: `--- Page ${page.num} ---`,
        text: page.text,
        location: { page: page.num },
      })))
      return {
        readability: 'derived_text',
        ...converted,
        mediaType: 'application/pdf',
        converter: { name: 'pdf-parse', version: '2.4.5' },
      }
    } finally {
      await parser.destroy()
    }
  }
  if (extension === '.docx') {
    const archive = officeArchive(await readFile(path))
    const document = archive['word/document.xml']
    if (document === undefined) throw new Error('DOCX is missing word/document.xml')
    return {
      readability: 'derived_text',
      content: decodeXmlText(Buffer.from(document).toString('utf8')),
      mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      converter: { name: 'fflate-docx', version: '0.8.3' },
    }
  }
  if (extension === '.pptx') {
    const archive = officeArchive(await readFile(path))
    const slides = Object.entries(archive)
      .flatMap(([name, bytes]) => {
        const match = /^ppt\/slides\/slide([1-9][0-9]*)\.xml$/u.exec(name)
        return match === null ? [] : [{ number: Number(match[1]), bytes }]
      })
      .sort((left, right) => left.number - right.number)
    if (slides.length === 0) throw new Error('PPTX contains no slides')
    if (slides.length > 2_000) throw new Error('PPTX exceeds the slide limit')
    const converted = sectionedText(slides.map(slide => ({
      heading: `--- Slide ${slide.number} ---`,
      text: decodeXmlText(Buffer.from(slide.bytes).toString('utf8')),
      location: { slide: slide.number },
    })))
    return {
      readability: 'derived_text',
      ...converted,
      mediaType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      converter: { name: 'fflate-pptx', version: '0.8.3' },
    }
  }
  if (extension === '.xlsx') {
    const archive = officeArchive(await readFile(path))
    const sharedXml = archive['xl/sharedStrings.xml']
    const sharedStrings = sharedXml === undefined
      ? []
      : [...Buffer.from(sharedXml).toString('utf8').matchAll(/<si>([\s\S]*?)<\/si>/gu)]
        .map(match => decodeXmlText(match[1] ?? ''))
    const sheets = Object.entries(archive)
      .flatMap(([name, bytes]) => {
        const match = /^xl\/worksheets\/sheet([1-9][0-9]*)\.xml$/u.exec(name)
        return match === null ? [] : [{ number: Number(match[1]), bytes }]
      })
      .sort((left, right) => left.number - right.number)
    if (sheets.length === 0) throw new Error('XLSX contains no worksheets')
    if (sheets.length > 200) throw new Error('XLSX exceeds the worksheet limit')
    const converted = sectionedText(sheets.map(sheet => ({
      heading: `--- Sheet sheet${sheet.number} ---`,
      text: worksheetText(Buffer.from(sheet.bytes).toString('utf8'), sharedStrings),
      location: { sheet: `sheet${sheet.number}` },
    })))
    return {
      readability: 'derived_text',
      ...converted,
      mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      converter: { name: 'fflate-xlsx', version: '0.8.3' },
    }
  }
  if (IMAGE_EXTENSIONS.has(extension)) {
    return { readability: 'native_image', mediaType: `image/${extension.slice(1).replace('jpg', 'jpeg')}` }
  }
  return { readability: 'metadata_only' }
}

/**
 * Convert one source in a secret-free worker with memory and wall-clock limits.
 * @param path - canonical owner-plane source path.
 * @param timeoutMs - fixed compiler deadline; callers may lower it for a stricter deployment or test.
 * @returns structured conversion data copied back from the worker.
 */
export async function convertSourceIsolated(path: string, timeoutMs = 30_000): Promise<ConvertedSource> {
  const sourceLaunch = import.meta.url.endsWith('.ts')
  const worker = new Worker(new URL(sourceLaunch ? './converter-worker.ts' : './converter-worker.js', import.meta.url), {
    workerData: { path },
    env: {},
    execArgv: sourceLaunch ? ['--import', 'tsx/esm'] : [],
    resourceLimits: {
      maxOldGenerationSizeMb: 256,
      maxYoungGenerationSizeMb: 32,
      stackSizeMb: 8,
    },
  })
  const deadline = setTimeout(() => {
    void worker.terminate()
  }, timeoutMs)
  try {
    return await new Promise<ConvertedSource>((resolveWorker, rejectWorker) => {
      let received = false
      worker.once('message', (message: unknown) => {
        received = true
        if (message !== null && typeof message === 'object' && 'ok' in message && message.ok === true
          && 'result' in message) {
          resolveWorker(message.result as ConvertedSource)
          return
        }
        rejectWorker(new Error('source conversion failed'))
      })
      worker.once('error', () => {
        rejectWorker(new Error('source conversion worker failed'))
      })
      worker.once('exit', () => {
        if (!received) rejectWorker(new Error('source conversion exceeded its resource limit'))
      })
    })
  } finally {
    clearTimeout(deadline)
    await worker.terminate()
  }
}

async function gitOutput(repository: string, args: readonly string[], converterHome: string): Promise<string> {
  const { stdout } = await execFileAsync('git', [
    '-c', 'core.hooksPath=/dev/null',
    '-c', 'credential.helper=',
    '-C', repository,
    ...args,
  ], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    timeout: 30_000,
    env: {
      PATH: process.env.PATH,
      LANG: 'C',
      LC_ALL: 'C',
      HOME: converterHome,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_TERMINAL_PROMPT: '0',
      GIT_OPTIONAL_LOCKS: '0',
    },
  })
  return stdout.trim()
}

async function gitSummary(repository: string, converterHome: string, maxCommits: number): Promise<string> {
  const [head, branch, commits, firstDate, lastDate, tracked, version] = await Promise.all([
    gitOutput(repository, ['rev-parse', '--verify', 'HEAD'], converterHome),
    gitOutput(repository, ['branch', '--show-current'], converterHome),
    gitOutput(repository, ['log', `--max-count=${maxCommits}`, '--format=%H', 'HEAD'], converterHome),
    gitOutput(repository, ['log', '--max-parents=0', '--format=%cI', 'HEAD'], converterHome),
    gitOutput(repository, ['log', '-1', '--format=%cI', 'HEAD'], converterHome),
    gitOutput(repository, ['ls-files'], converterHome),
    gitOutput(repository, ['--version'], converterHome),
  ])
  const commitCount = commits.length === 0 ? 0 : commits.split('\n').length
  return [
    '# Git repository summary',
    `Branch: ${branch || '(detached)'}`,
    `HEAD: ${head}`,
    `Commit count: ${commitCount}${commitCount === maxCommits ? ' (configured limit reached)' : ''}`,
    `Commit range: ${firstDate.split('\n')[0] ?? lastDate} to ${lastDate}`,
    `Tracked files: ${tracked.length === 0 ? 0 : tracked.split('\n').length}`,
    `Compiler: ${version}`,
    '',
    'Commit count is descriptive metadata and does not measure contribution quality.',
  ].join('\n')
}

function countSecrets(content: string | undefined): number {
  if (content === undefined) return 0
  return SECRET_PATTERNS.reduce((count, pattern) => count + (pattern.test(content) ? 1 : 0), 0)
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
}

async function makeRevisionReadOnly(root: string): Promise<void> {
  const entries = await readdir(root, { withFileTypes: true })
  for (const entry of entries) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      await makeRevisionReadOnly(path)
      await chmod(path, 0o500)
    } else if (entry.isFile()) {
      await chmod(path, 0o400)
    }
  }
  await chmod(root, 0o500)
}

async function makeRevisionRemovable(root: string): Promise<void> {
  await chmod(root, 0o700)
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    await makeRevisionRemovable(join(root, entry.name))
  }
}

async function readPolicy(options: SyncOptions): Promise<{ policy: ZhiwoPolicy; checksum?: string }> {
  const configPath = options.configFile ?? join(options.sourceRoot, 'zhiwo.yaml')
  try {
    const text = await readFile(configPath, 'utf8')
    return { policy: parsePolicy(text), checksum: sha256(text) }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { policy: defaultPolicy() }
    }
    throw error
  }
}

async function validateRevision(revision: KnowledgeRevision): Promise<void> {
  if (revision.manifest.sourceCount !== revision.sources.length) throw new Error('revision source count is invalid')
  const seen = new Set<string>()
  for (const source of revision.sources) {
    if (seen.has(source.id)) throw new Error('revision source ids are not unique')
    seen.add(source.id)
    for (const artifact of [source.contentArtifact, source.previewArtifact, source.downloadArtifact]) {
      if (artifact === undefined) continue
      const path = resolve(revision.root, artifact)
      if (!pathInside(revision.root, path)) throw new Error('revision artifact escapes the revision root')
      await stat(path)
    }
    if (source.contentArtifact !== undefined) {
      const bytes = await readFile(resolveRevisionArtifact(revision, source.contentArtifact))
      if (source.artifactChecksum === undefined || sha256(bytes) !== source.artifactChecksum) {
        throw new Error('revision content artifact checksum is invalid')
      }
    }
    if (source.downloadArtifact !== undefined) {
      const bytes = await readFile(resolveRevisionArtifact(revision, source.downloadArtifact))
      if (sha256(bytes) !== source.sourceChecksum) throw new Error('revision download artifact checksum is invalid')
    }
  }
}

/**
 * Compile a userdata directory and atomically activate the validated result.
 * @param options - source, destination, release identity, and check-only controls.
 * @returns revision metadata and aggregate audit counts; source contents never enter the audit.
 */
async function syncKnowledgeUnlocked(options: SyncOptions): Promise<SyncReport> {
  const sourceRoot = await realpath(options.sourceRoot)
  const knowledgeRoot = resolve(options.knowledgeRoot)
  const { policy, checksum: configChecksum } = await readPolicy({ ...options, sourceRoot })
  const audit = emptyAudit()
  const collected = await collectFiles(sourceRoot, policy, audit)
  const { files } = collected
  const gitRepositories = policy.compiler.git.enabled && policy.compiler.git.includeHistorySummary
    ? collected.gitRepositories
    : []
  const revisionId = `rev_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`
  const stagingRoot = join(knowledgeRoot, '.staging', revisionId)
  const finalRoot = join(knowledgeRoot, 'revisions', revisionId)
  await mkdir(join(stagingRoot, 'knowledge'), { recursive: true, mode: 0o700 })
  await mkdir(join(stagingRoot, 'artifacts'), { recursive: true, mode: 0o700 })
  const converterHome = join(stagingRoot, '.converter-home')
  await mkdir(converterHome, { mode: 0o700 })
  const sources: SourceRecord[] = []
  let totalSourceBytes = 0
  let totalArtifactBytes = 0
  const rootHash = createHash('sha256')

  try {
    for (const file of files) {
      totalSourceBytes += file.size
      const sourceBytes = await readFile(file.absolutePath)
      const sourceChecksum = sha256(sourceBytes)
      rootHash.update(file.logicalPath).update('\0').update(sourceChecksum).update('\0')
      let converted: ConvertedSource
      try {
        converted = await convertSourceIsolated(file.absolutePath)
      } catch {
        converted = { readability: 'failed' }
        audit.failedSourceCount += 1
        audit.warnings.push(`Conversion failed: ${file.logicalPath}`)
      }
      audit.readabilityCount[converted.readability] += 1
      audit.suspiciousSecretCount += countSecrets(converted.content)
      const id = `src_${randomUUID()}`
      const record: SourceRecord = {
        id,
        revision: revisionId,
        logicalPath: file.logicalPath,
        displayTitle: basename(file.logicalPath),
        ...converted.mediaType === undefined ? {} : { mediaType: converted.mediaType },
        readability: converted.readability,
        sourceChecksum,
        ...converted.converter === undefined ? {} : { converter: converted.converter },
        ...converted.locationMap === undefined ? {} : { locationMap: converted.locationMap },
      }
      if (converted.content !== undefined) {
        const artifact = `knowledge/${id}.txt`
        const content = converted.content.endsWith('\n') ? converted.content : `${converted.content}\n`
        await writeFile(join(stagingRoot, artifact), content, { encoding: 'utf8', mode: 0o600 })
        record.contentArtifact = artifact
        record.artifactChecksum = sha256(content)
        totalArtifactBytes += Buffer.byteLength(content)
        record.previewArtifact = artifact
      }
      if (converted.readability === 'native_image') {
        const artifact = `knowledge/${id}${extname(file.logicalPath).toLowerCase()}`
        await cp(file.absolutePath, join(stagingRoot, artifact), { dereference: false, preserveTimestamps: false })
        record.contentArtifact = artifact
        record.artifactChecksum = sourceChecksum
        totalArtifactBytes += file.size
      }
      const artifact = `artifacts/${id}${extname(file.logicalPath).toLowerCase()}`
      await cp(file.absolutePath, join(stagingRoot, artifact), { dereference: false, preserveTimestamps: false })
      await open(join(stagingRoot, artifact), 'r').then(handle => handle.close())
      record.downloadArtifact = artifact
      totalArtifactBytes += file.size
      sources.push(record)
    }
    for (const repository of gitRepositories) {
      const repositoryPath = logicalPath(sourceRoot, repository)
      const summaryPath = repositoryPath.length === 0
        ? '.zhiwo/git-summary.txt'
        : `${repositoryPath}/.zhiwo/git-summary.txt`
      try {
        const content = `${await gitSummary(repository, converterHome, policy.compiler.git.maxCommits)}\n`
        const id = `src_${randomUUID()}`
        const artifact = `knowledge/${id}.txt`
        await writeFile(join(stagingRoot, artifact), content, { encoding: 'utf8', mode: 0o600 })
        const checksum = sha256(content)
        sources.push({
          id,
          revision: revisionId,
          logicalPath: summaryPath,
          displayTitle: `${basename(repository) || 'repository'} Git 摘要`,
          mediaType: 'text/plain; charset=utf-8',
          readability: 'derived_text',
          sourceChecksum: checksum,
          artifactChecksum: checksum,
          contentArtifact: artifact,
          previewArtifact: artifact,
          converter: { name: 'git-cli', version: 'system-pinned-by-build-environment' },
        })
        audit.readabilityCount.derived_text += 1
        totalArtifactBytes += Buffer.byteLength(content)
        rootHash.update(summaryPath).update('\0').update(checksum).update('\0')
      } catch {
        audit.failedSourceCount += 1
        audit.warnings.push(`Git summary failed: ${repositoryPath || '.'}`)
      }
    }
    await rm(converterHome, { recursive: true, force: true })
    const converterVersions = Object.fromEntries(
      [...new Set(sources.flatMap(source => source.converter === undefined
        ? []
        : [`${source.converter.name}\0${source.converter.version}`]))]
        .map(value => value.split('\0') as [string, string]),
    )
    const catalogText = `${JSON.stringify(sources, null, 2)}\n`
    const auditText = `${JSON.stringify(audit, null, 2)}\n`
    const manifest: KnowledgeRevisionManifest = {
      id: revisionId,
      createdAt: Date.now(),
      upstreamProductVersion: `${options.productVersion}+${options.upstreamBase.slice(0, 12)}`,
      sourceRootChecksum: rootHash.digest('hex'),
      ...configChecksum === undefined ? {} : { configChecksum },
      catalogChecksum: sha256(catalogText),
      auditChecksum: sha256(auditText),
      compilerVersion: COMPILER_VERSION,
      converterVersions,
      starterQuestions: [...policy.starterQuestions],
      sourceCount: sources.length,
      readabilityCount: { ...audit.readabilityCount },
      totalSourceBytes,
      totalArtifactBytes,
      auditSummary: {
        suspiciousSecretCount: audit.suspiciousSecretCount,
        failedSourceCount: audit.failedSourceCount,
        oversizedSourceCount: audit.oversizedSourceCount,
        warningCount: audit.warnings.length,
      },
    }
    const revision: KnowledgeRevision = { id: revisionId, root: stagingRoot, manifest, sources }
    await writeJson(join(stagingRoot, 'manifest.json'), manifest)
    await writeFile(join(stagingRoot, 'catalog.json'), catalogText, { encoding: 'utf8', mode: 0o600 })
    await writeFile(join(stagingRoot, 'audit.json'), auditText, { encoding: 'utf8', mode: 0o600 })
    await validateRevision(revision)
    if (options.check) {
      return { checkedOnly: true, activated: false, revision, audit }
    }
    await mkdir(dirname(finalRoot), { recursive: true, mode: 0o700 })
    await rename(stagingRoot, finalRoot)
    await makeRevisionReadOnly(finalRoot)
    const pointerStaging = join(knowledgeRoot, `.current-${randomUUID()}.json`)
    await writeJson(pointerStaging, { revisionId })
    await rename(pointerStaging, join(knowledgeRoot, 'current.json'))
    return {
      checkedOnly: false,
      activated: true,
      revision: { ...revision, root: finalRoot },
      audit,
    }
  } finally {
    await rm(stagingRoot, { recursive: true, force: true })
  }
}

/**
 * Compile a userdata directory under a single owner-plane lock.
 * @param options - source, destination, release identity, and check-only controls.
 * @returns revision metadata and aggregate audit counts; source contents never enter the audit.
 */
export async function syncKnowledge(options: SyncOptions): Promise<SyncReport> {
  const knowledgeRoot = resolve(options.knowledgeRoot)
  await mkdir(knowledgeRoot, { recursive: true, mode: 0o700 })
  const lock = join(knowledgeRoot, '.sync.lock')
  try {
    await mkdir(lock, { mode: 0o700 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('another Zhiwo sync is active')
    throw error
  }
  try {
    return await syncKnowledgeUnlocked(options)
  } finally {
    await rm(lock, { recursive: true, force: true })
  }
}

/**
 * Load one immutable knowledge revision and validate artifact containment.
 * @param knowledgeRoot - product knowledge directory.
 * @param revisionId - opaque revision identifier from the current pointer or a session row.
 * @returns validated revision catalog.
 */
export async function loadKnowledgeRevision(knowledgeRoot: string, revisionId: string): Promise<KnowledgeRevision> {
  if (!/^rev_[a-z0-9]+_[a-f0-9-]+$/u.test(revisionId)) throw new Error('invalid knowledge revision id')
  const root = resolve(knowledgeRoot, 'revisions', revisionId)
  if (!pathInside(resolve(knowledgeRoot, 'revisions'), root)) throw new Error('knowledge revision escapes root')
  const [manifestText, catalogText, auditText] = await Promise.all([
    readFile(join(root, 'manifest.json'), 'utf8').then(text => JSON.parse(text) as KnowledgeRevisionManifest),
    readFile(join(root, 'catalog.json'), 'utf8'),
    readFile(join(root, 'audit.json'), 'utf8'),
  ])
  const manifest = manifestText
  if (manifest.catalogChecksum !== sha256(catalogText) || manifest.auditChecksum !== sha256(auditText)) {
    throw new Error('knowledge revision catalog or audit checksum is invalid')
  }
  const sources = JSON.parse(catalogText) as SourceRecord[]
  const revision = { id: revisionId, root, manifest, sources } satisfies KnowledgeRevision
  await validateRevision(revision)
  return revision
}

/**
 * Load the revision selected by the atomic current pointer.
 * @param knowledgeRoot - product knowledge directory.
 * @returns validated current revision.
 */
export async function loadCurrentKnowledgeRevision(knowledgeRoot: string): Promise<KnowledgeRevision> {
  const pointer = JSON.parse(await readFile(join(knowledgeRoot, 'current.json'), 'utf8')) as { revisionId?: unknown }
  if (typeof pointer.revisionId !== 'string') throw new Error('current knowledge pointer is invalid')
  return loadKnowledgeRevision(knowledgeRoot, pointer.revisionId)
}

/**
 * Atomically select an already validated immutable revision for new sessions.
 * @param knowledgeRoot - product knowledge directory.
 * @param revisionId - retained revision selected by the owner.
 * @returns the validated revision made current.
 */
export async function activateKnowledgeRevision(
  knowledgeRoot: string,
  revisionId: string,
): Promise<KnowledgeRevision> {
  const revision = await loadKnowledgeRevision(knowledgeRoot, revisionId)
  const pointerStaging = join(resolve(knowledgeRoot), `.current-${randomUUID()}.json`)
  await writeJson(pointerStaging, { revisionId })
  await rename(pointerStaging, join(resolve(knowledgeRoot), 'current.json'))
  return revision
}

/**
 * Resolve a catalog-owned artifact without accepting a caller-provided filesystem path.
 * @param revision - validated knowledge revision.
 * @param artifact - artifact name stored in its catalog.
 * @returns contained absolute artifact path.
 */
export function resolveRevisionArtifact(revision: KnowledgeRevision, artifact: string): string {
  const path = resolve(revision.root, artifact)
  if (!pathInside(revision.root, path)) throw new Error('knowledge artifact escapes revision root')
  return path
}

/**
 * Remove a revision selected by an owner-side retention decision.
 * @param knowledgeRoot - product knowledge directory.
 * @param revisionId - already-unreferenced immutable revision id.
 */
export async function removeKnowledgeRevision(knowledgeRoot: string, revisionId: string): Promise<void> {
  if (!/^rev_[a-z0-9]+_[a-f0-9-]+$/u.test(revisionId)) throw new Error('invalid knowledge revision id')
  const root = resolve(knowledgeRoot, 'revisions', revisionId)
  if (!pathInside(resolve(knowledgeRoot, 'revisions'), root)) throw new Error('knowledge revision escapes root')
  await makeRevisionRemovable(root)
  await rm(root, { recursive: true, force: true })
}
