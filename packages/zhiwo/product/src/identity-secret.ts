/** Persistent Host key for stateless Zhiwo visitor identity. */

import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'

const SECRET_FILE = 'zhiwo/identity.key'

function decodeSecret(text: string, filename: string): Buffer {
  const normalized = text.trim()
  if (!/^[A-Za-z0-9_-]{43}$/.test(normalized)) {
    throw new Error(`zhiwo identity key "${filename}" must be one base64url-encoded 32-byte value`)
  }
  const secret = Buffer.from(normalized, 'base64url')
  if (secret.byteLength !== 32) {
    throw new Error(`zhiwo identity key "${filename}" must contain exactly 32 bytes`)
  }
  return secret
}

/**
 * Read or atomically create the private identity key below DSH_HOME.
 * @param dshHome - explicit Harness home for composition tests; omission follows DSH_HOME.
 * @returns stable 32-byte secret.
 */
export async function loadIdentitySecret(dshHome?: string): Promise<Buffer> {
  const filename = join(resolveDshHome(dshHome), SECRET_FILE)
  await mkdir(dirname(filename), { recursive: true, mode: 0o700 })
  try {
    return decodeSecret(await readFile(filename, 'utf8'), filename)
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const encoded = randomBytes(32).toString('base64url')
  try {
    await writeFile(filename, `${encoded}\n`, { flag: 'wx', mode: 0o600 })
    return Buffer.from(encoded, 'base64url')
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    return decodeSecret(await readFile(filename, 'utf8'), filename)
  }
}
