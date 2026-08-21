import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadIdentitySecret } from '../src/identity-secret.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { force: true, recursive: true })))
})

describe('Zhiwo identity key', () => {
  it('creates one owner-only key and reuses it across Host restarts', async () => {
    const home = await mkdtemp(join(tmpdir(), 'zhiwo-identity-'))
    roots.push(home)
    const first = await loadIdentitySecret(home)
    const second = await loadIdentitySecret(home)

    expect(first).toHaveLength(32)
    expect(second).toEqual(first)
    expect((await stat(join(home, 'zhiwo', 'identity.key'))).mode & 0o777).toBe(0o600)
  })
})
