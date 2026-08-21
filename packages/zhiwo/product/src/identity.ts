/** Browser visitor identity derived from one private Host key and an opaque cookie subject. */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const COOKIE_NAME = 'zhiwo_guest'
const COOKIE_MARKER = 'zhiwo_guest_ready'
const SUBJECT_PATTERN = /^[A-Za-z0-9_-]{22}$/
const OWNER_TAG_BYTES = 18

function hmac(secret: Buffer, purpose: string, subject: string): Buffer {
  return createHmac('sha256', secret).update(purpose).update('\0').update(subject).digest()
}

function parseCookies(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>()
  for (const part of header?.split(';') ?? []) {
    const separator = part.indexOf('=')
    if (separator < 1) continue
    const name = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()
    if (name !== '') cookies.set(name, value)
  }
  return cookies
}

function validSignature(secret: Buffer, subject: string, signature: string): boolean {
  if (!/^[A-Za-z0-9_-]{43}$/.test(signature)) return false
  const received = Buffer.from(signature, 'base64url')
  const expected = hmac(secret, 'cookie', subject)
  return received.byteLength === expected.byteLength && timingSafeEqual(received, expected)
}

/** One authenticated browser visitor and an optional cookie upgrade. */
export interface VisitorIdentity {
  /** Prefix every native Session id owned by this browser carries. */
  readonly sessionPrefix: string
  /** Signed HttpOnly replacement for a missing or bootstrap cookie. */
  readonly setCookie?: string
}

/** Stable browser identity resolver; it persists no visitor or Session records. */
export class VisitorIdentities {
  /**
   * @param secret - Host-private 256-bit key persisted under DSH_HOME.
   * @param cookieMaxAgeSeconds - browser identity lifetime.
   */
  constructor(
    private readonly secret: Buffer,
    private readonly cookieMaxAgeSeconds: number,
  ) {
    if (secret.byteLength !== 32) throw new Error('zhiwo identity secret must contain exactly 32 bytes')
  }

  /**
   * Resolve a signed cookie or the short-lived script bootstrap value.
   * @param cookieHeader - HTTP Cookie header.
   * @returns authenticated identity and a signed replacement when required.
   */
  resolve(cookieHeader: string | undefined): VisitorIdentity {
    const value = parseCookies(cookieHeader).get(COOKIE_NAME)
    const parts = value?.split('.')
    let subject: string | undefined
    let replace = true
    if (parts?.length === 3 && parts[0] === 'v1' && SUBJECT_PATTERN.test(parts[1] ?? '')
      && validSignature(this.secret, parts[1] as string, parts[2] as string)) {
      subject = parts[1]
      replace = false
    } else if (parts?.length === 2 && parts[0] === 'v0' && SUBJECT_PATTERN.test(parts[1] ?? '')) {
      subject = parts[1]
    }
    subject ??= randomBytes(16).toString('base64url')
    const tag = hmac(this.secret, 'session-owner', subject).subarray(0, OWNER_TAG_BYTES).toString('base64url')
    return {
      sessionPrefix: `zhiwo-${tag}-`,
      ...replace ? { setCookie: this.sealedCookie(subject) } : {},
    }
  }

  /**
   * Script inserted before the native browser modules to establish one subject for concurrent API and WebSocket opens.
   * @returns Inline script that seeds the short-lived bootstrap cookie.
   */
  bootstrapScript(): string {
    return `<script>(()=>{if(document.cookie.split('; ').includes('${COOKIE_MARKER}=1'))return;const b=new Uint8Array(16);crypto.getRandomValues(b);const s=btoa(String.fromCharCode(...b)).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');document.cookie='${COOKIE_NAME}=v0.'+s+'; Path=/; Max-Age=${String(this.cookieMaxAgeSeconds)}; SameSite=Strict';document.cookie='${COOKIE_MARKER}=1; Path=/; Max-Age=${String(this.cookieMaxAgeSeconds)}; SameSite=Strict'})()</script>`
  }

  private sealedCookie(subject: string): string {
    const signature = hmac(this.secret, 'cookie', subject).toString('base64url')
    return `${COOKIE_NAME}=v1.${subject}.${signature}; Path=/; Max-Age=${String(this.cookieMaxAgeSeconds)}; HttpOnly; SameSite=Strict`
  }
}
