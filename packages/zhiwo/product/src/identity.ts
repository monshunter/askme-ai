/** Signed guest-cookie identity and request-forgery protection for the Public Runtime. */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/** Server-resolved guest identity returned for one HTTP request. */
export interface GuestIdentity {
  guestId: string
  csrfToken: string
  setCookie?: string
}

function hmac(secret: Buffer, purpose: string, value: string): string {
  return createHmac('sha256', secret).update(purpose).update('\0').update(value).digest('base64url')
}

function parseCookies(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>()
  for (const part of header?.split(';') ?? []) {
    const separator = part.indexOf('=')
    if (separator <= 0) continue
    const name = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()
    if (name.length > 0) cookies.set(name, value)
  }
  return cookies
}

function verifySubject(secret: Buffer, sealed: string | undefined, maxAgeDays: number): string | undefined {
  if (sealed === undefined) return undefined
  const [version, subject, issuedAtText, signature, ...extra] = sealed.split('.')
  if (version !== 'v1' || subject === undefined || issuedAtText === undefined
    || signature === undefined || extra.length > 0) return undefined
  if (!/^[A-Za-z0-9_-]{43}$/u.test(subject) || !/^[A-Za-z0-9_-]{43}$/u.test(signature)) return undefined
  if (!/^[1-9][0-9]{9,12}$/u.test(issuedAtText)) return undefined
  const issuedAt = Number(issuedAtText)
  const now = Date.now()
  if (!Number.isSafeInteger(issuedAt) || issuedAt > now + 60_000
    || now - issuedAt > maxAgeDays * 86_400_000) return undefined
  const expected = hmac(secret, 'cookie', `${subject}.${issuedAtText}`)
  const actualBytes = Buffer.from(signature)
  const expectedBytes = Buffer.from(expected)
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) return undefined
  return subject
}

/**
 * Resolve a valid cookie or issue a new random subject without exposing it as the database key.
 * @param cookieHeader - incoming Cookie header.
 * @param cookieName - deployment cookie name.
 * @param secret - at least 32 bytes of trusted secret material.
 * @param maxAgeDays - persistent-cookie lifetime.
 * @param secure - whether to require an HTTPS transport for the cookie.
 * @param previousSecret - optional previous signing key accepted only to rotate a valid cookie to the current key.
 * @returns HMAC-derived database id, CSRF token, and optional Set-Cookie value.
 */
export function resolveGuestIdentity(
  cookieHeader: string | undefined,
  cookieName: string,
  secret: Buffer,
  maxAgeDays: number,
  secure = true,
  previousSecret?: Buffer,
): GuestIdentity {
  const sealed = parseCookies(cookieHeader).get(cookieName)
  const currentSubject = verifySubject(secret, sealed, maxAgeDays)
  const previousSubject = currentSubject === undefined && previousSecret !== undefined
    ? verifySubject(previousSecret, sealed, maxAgeDays)
    : undefined
  const subject = currentSubject ?? previousSubject ?? randomBytes(32).toString('base64url')
  const guestId = createHash('sha256').update('zhiwo-guest\0').update(subject).digest('base64url')
  const csrfToken = hmac(secret, 'csrf', subject)
  if (currentSubject !== undefined) return { guestId, csrfToken }
  const issuedAt = String(Date.now())
  const rotated = `v1.${subject}.${issuedAt}.${hmac(secret, 'cookie', `${subject}.${issuedAt}`)}`
  const attributes = [
    `${cookieName}=${rotated}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(maxAgeDays * 86_400)}`,
    ...(secure ? ['Secure'] : []),
  ]
  return { guestId, csrfToken, setCookie: attributes.join('; ') }
}

/**
 * Validate the exact public origin and CSRF token for a state-changing request.
 * @param method - uppercase HTTP method.
 * @param headers - origin, referer, and token headers.
 * @param publicOrigin - configured external origin.
 * @param expectedToken - subject-bound expected token.
 */
export function assertWriteRequest(
  method: string,
  headers: { origin?: string; referer?: string; csrfToken?: string },
  publicOrigin: URL,
  expectedToken: string,
): void {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return
  const requestOrigin = headers.origin ?? (headers.referer === undefined
    ? undefined
    : new URL(headers.referer).origin)
  if (requestOrigin !== publicOrigin.origin) throw new Error('ZHIWO_ORIGIN_REJECTED')
  if (headers.csrfToken === undefined) throw new Error('ZHIWO_CSRF_REJECTED')
  const actual = Buffer.from(headers.csrfToken)
  const expected = Buffer.from(expectedToken)
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error('ZHIWO_CSRF_REJECTED')
  }
}
