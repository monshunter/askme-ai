/** Verify and snapshot the fixed Zhiwo tool, API, and browser build surfaces. */

import { readFile, readdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ZHIWO_ROUTE_TEMPLATES } from '../packages/zhiwo/product/src/server.ts'
import { ZHIWO_TEXT_TOOL_NAMES } from '../packages/zhiwo/product/src/tools.ts'

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const distRoot = join(repositoryRoot, 'apps/zhiwo/dist')
const BASELINE_SNAPSHOT_SHA256 = '92f84c5955fcd21a490d8b22b8791cd54c0c87a7e60d85742cd1a8c4104c6519'
const baselineSnapshotText = await readFile(
  join(repositoryRoot, 'tests/snapshots/zhiwo/upstream-baseline-surface.json'),
  'utf8',
)
const baselineSnapshot = JSON.parse(baselineSnapshotText) as {
  upstreamBase: string
  surfaces: Record<string, { path: string; sha256: string }>
}
const configuredBaseline = (await readFile(join(repositoryRoot, 'UPSTREAM_BASE'), 'utf8')).trim()
if (baselineSnapshot.upstreamBase !== configuredBaseline) {
  throw new Error('Zhiwo upstream surface snapshot does not match UPSTREAM_BASE')
}
if (process.env.ZHIWO_SOURCE_ARCHIVE_BUILD === 'true') {
  if (createHash('sha256').update(baselineSnapshotText).digest('hex') !== BASELINE_SNAPSHOT_SHA256) {
    throw new Error('Zhiwo source archive baseline snapshot is not the reviewed artifact')
  }
} else {
  for (const [name, surface] of Object.entries(baselineSnapshot.surfaces)) {
    const content = execFileSync('git', ['show', `${configuredBaseline}:${surface.path}`], {
      cwd: repositoryRoot,
      maxBuffer: 10 * 1024 * 1024,
    })
    if (createHash('sha256').update(content).digest('hex') !== surface.sha256) {
      throw new Error(`Zhiwo upstream ${name} surface provenance is invalid`)
    }
  }
}
const files = await readdir(join(distRoot, 'assets'))
const scriptFiles = files.filter(file => file.endsWith('.js'))
if (scriptFiles.length === 0) throw new Error('Zhiwo surface audit found no browser JavaScript')
const clientScript = (await Promise.all(scriptFiles.map(file => readFile(join(distRoot, 'assets', file), 'utf8')))).join('\n')
const forbiddenClientTerms = [
  '/api/tools', '/api/plugins', '/api/terminal', '/api/workspaces',
  'run_code', 'bash', 'pwsh', 'subagent', 'workflow', 'skill catalog',
  '/Users/', 'C:\\Users\\', 'workspace:', 'sourceMappingURL=',
]
const present = forbiddenClientTerms.filter(term => clientScript.includes(term))
if (present.length > 0) throw new Error(`Zhiwo client contains forbidden coding terms: ${present.join(', ')}`)
const snapshot = {
  schemaVersion: 1,
  tools: [...ZHIWO_TEXT_TOOL_NAMES],
  routes: [...ZHIWO_ROUTE_TEMPLATES],
  clientRoutes: ['/'],
  forbiddenClientTerms,
  scriptFiles: scriptFiles.sort(),
  upstreamBaselineSnapshot: 'tests/snapshots/zhiwo/upstream-baseline-surface.json',
}
await writeFile(join(distRoot, 'surface-snapshot.json'), `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
process.stdout.write('Zhiwo surface audit passed\n')
