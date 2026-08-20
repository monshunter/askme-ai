/** Generate the auditable Zhiwo build manifest, checksums, and direct-dependency SPDX SBOM. */

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ZHIWO_ROUTE_TEMPLATES } from '../packages/zhiwo/product/src/server.ts'
import { ZHIWO_TEXT_TOOL_NAMES } from '../packages/zhiwo/product/src/tools.ts'
import { ZHIWO_SCHEMA_VERSION } from '../packages/zhiwo/product/src/database.ts'

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const distRoot = join(repositoryRoot, 'apps/zhiwo/dist')

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

async function outputChecksums(directory: string): Promise<Record<string, string>> {
  const checksums: Record<string, string> = {}
  const visit = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile()
        && entry.name !== 'build-manifest.json'
        && entry.name !== 'sbom.spdx.json'
        && entry.name !== 'SHA256SUMS') {
        checksums[relative(directory, path).split('/').join('/')] = sha256(await readFile(path))
      }
    }
  }
  await visit(directory)
  return Object.fromEntries(Object.entries(checksums).sort(([left], [right]) => left.localeCompare(right, 'en')))
}

interface PackageManifest {
  name: string
  version: string
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

const [version, upstreamBase, lockfile, appManifestText, productManifestText] = await Promise.all([
  readFile(join(repositoryRoot, 'VERSION'), 'utf8').then(value => value.trim()),
  readFile(join(repositoryRoot, 'UPSTREAM_BASE'), 'utf8').then(value => value.trim()),
  readFile(join(repositoryRoot, 'pnpm-lock.yaml')),
  readFile(join(repositoryRoot, 'apps/zhiwo/package.json'), 'utf8'),
  readFile(join(repositoryRoot, 'packages/zhiwo/product/package.json'), 'utf8'),
])
const appManifest = JSON.parse(appManifestText) as PackageManifest
const productManifest = JSON.parse(productManifestText) as PackageManifest
const sourceArchiveBuild = process.env.ZHIWO_SOURCE_ARCHIVE_BUILD === 'true'
const commit = sourceArchiveBuild
  ? upstreamBase
  : execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim()
if (!/^[0-9a-f]{40}$/u.test(commit)) {
  throw new Error(`release commit must be a 40-character lowercase Git object id, received ${JSON.stringify(commit)}`)
}
const dirty = sourceArchiveBuild
  || execFileSync('git', ['status', '--porcelain'], { cwd: repositoryRoot, encoding: 'utf8' }).length > 0
const artifacts = await outputChecksums(distRoot)
const builtAt = new Date().toISOString()
const dependencies = {
  ...appManifest.dependencies,
  ...appManifest.peerDependencies,
  ...productManifest.dependencies,
  ...productManifest.peerDependencies,
}

const sbom = {
  spdxVersion: 'SPDX-2.3',
  dataLicense: 'CC0-1.0',
  SPDXID: 'SPDXRef-DOCUMENT',
  name: `zhiwo-${version}`,
  documentNamespace: `https://github.com/monshunter/deepseek-harness/zhiwo/${commit}`,
  creationInfo: { created: builtAt, creators: ['Tool: scripts/generate-zhiwo-release.ts'] },
  packages: [
    { SPDXID: 'SPDXRef-Package-zhiwo', name: appManifest.name, versionInfo: appManifest.version, downloadLocation: 'NOASSERTION', filesAnalyzed: false },
    { SPDXID: 'SPDXRef-Package-zhiwo-product', name: productManifest.name, versionInfo: productManifest.version, downloadLocation: 'NOASSERTION', filesAnalyzed: false },
    ...Object.entries(dependencies).sort(([left], [right]) => left.localeCompare(right, 'en')).map(([name, declared], index) => ({
      SPDXID: `SPDXRef-Dependency-${index + 1}`,
      name,
      versionInfo: declared,
      downloadLocation: 'NOASSERTION',
      filesAnalyzed: false,
    })),
  ],
}
const sbomText = `${JSON.stringify(sbom, null, 2)}\n`

const manifest = {
  schemaVersion: 1,
  product: 'zhiwo',
  displayName: '知我',
  version,
  upstreamBase,
  commit,
  dirty,
  builtAt,
  entrypoint: 'zhiwo',
  agentDefinition: 'zhiwo-agent-v0.4',
  toolCatalog: [...ZHIWO_TEXT_TOOL_NAMES],
  publicRoutes: [...ZHIWO_ROUTE_TEMPLATES],
  clientRoutes: ['/'],
  knowledgeCompilerVersion: version,
  databaseSchemaVersion: ZHIWO_SCHEMA_VERSION,
  packageClassification: 'docs/PACKAGE_CLASSIFICATION.md',
  upstreamDelta: 'docs/UPSTREAM_DELTA.md',
  lockfileSha256: sha256(lockfile),
  sbomSha256: sha256(Buffer.from(sbomText)),
  artifacts,
}

await mkdir(distRoot, { recursive: true })
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`
await Promise.all([
  writeFile(join(distRoot, 'build-manifest.json'), manifestText, 'utf8'),
  writeFile(join(distRoot, 'sbom.spdx.json'), sbomText, 'utf8'),
])
const releaseChecksums = {
  ...artifacts,
  'build-manifest.json': sha256(Buffer.from(manifestText)),
  'sbom.spdx.json': sha256(Buffer.from(sbomText)),
}
const sums = `${Object.entries(releaseChecksums)
  .sort(([left], [right]) => left.localeCompare(right, 'en'))
  .map(([path, checksum]) => `${checksum}  ${path}`)
  .join('\n')}\n`
await writeFile(join(distRoot, 'SHA256SUMS'), sums, 'utf8')
process.stdout.write(`generated ${basename(join(distRoot, 'build-manifest.json'))}, SBOM, and SHA256SUMS\n`)
