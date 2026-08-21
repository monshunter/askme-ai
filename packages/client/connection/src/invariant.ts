/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-connection`.
 * @module @deepseek-ai/dsh-client-connection/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-connection'

/** Cordis companion plugin name. */
export const name = 'client-connection-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the wire layer emits no Cordis events. Behavior specs
 * exercise stream/reconnect sequencing and the single access-policy slot's
 * duplicate/disposal lifecycle. The API Proxy owns rpcId round trips, and the
 * Web Server invariant audits the node half's route registration lifecycle.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
