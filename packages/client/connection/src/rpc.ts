/** Generic RPC and API-access contracts shared by the Host and Client Connection halves. */

import type { HostFrame, MuxFrame, RpcRequest, RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'

/** Request headers retained for a Host API downlink upgrade. */
export type ConnectionApiHeaders = Readonly<Record<string, string | undefined>>

/** Fetch continuation supplied to the deployment's API access policy. */
export interface ConnectionApiFetchNext {
  /** Dispatch the request through the registered `/api` interceptor or native API Proxy. */
  fetch(request: Request): Promise<Response>
}

/** Optional deployment policy around every native HTTP call and event stream. */
export interface ConnectionApiAccess {
  /**
   * Authorize, rewrite, or filter one `/api` request and its response.
   * @param request - Decoded Fetch request with the browser's headers.
   * @param next - Native API dispatcher.
   * @returns The complete response exposed to the browser.
   */
  fetch(request: Request, next: ConnectionApiFetchNext): Promise<Response>
  /**
   * Authorize and filter one browser event stream.
   * @param kind - Native stream being opened.
   * @param headers - Browser upgrade headers.
   * @param source - Native Host stream.
   * @returns Frames visible to this browser.
   */
  stream<F extends MuxFrame | HostFrame>(
    kind: 'mux' | 'host',
    headers: ConnectionApiHeaders,
    source: AsyncIterable<RpcRequest<F>>,
  ): AsyncIterable<RpcRequest<F>>
}

/** Single deployment-owned API access-policy registration. */
export interface HostConnectionApiAccess {
  /**
   * Install the policy around `/api` HTTP and event-stream traffic.
   * @param access - Deployment authorization and filtering policy.
   * @returns asynchronous disposer removing the policy.
   */
  register(access: ConnectionApiAccess): () => Promise<void>
}

/** Trust fence applied before a Host RPC channel reaches its handler. */
export type ConnectionRpcAuthority = 'trusted-host' | 'loopback'

/** Registration policy for one logical RPC channel. */
export interface ConnectionRpcHandlerOptions {
  /** Browser authority accepted by every endpoint in this channel. */
  readonly authority: ConnectionRpcAuthority
}

/** Handler invoked after Connection has decoded the transport envelope. */
export type ConnectionRpcHandler = (
  endpoint: string,
  payload: unknown,
  signal: AbortSignal,
) => Promise<RpcResult<unknown>>

/** Synchronous ownership test for one endpoint on a shared RPC channel. */
export type ConnectionRpcEndpointMatcher = (endpoint: string) => boolean

/** Host registry for logical RPC channels carried by the current transport. */
export interface HostConnectionRpc {
  /**
   * Register one absolute channel prefix and its trust policy.
   * @param channel - absolute logical channel such as `/rpc`.
   * @param handler - decoded endpoint handler returning the existing RPC result shape.
   * @param options - channel trust policy.
   * @returns asynchronous disposer removing the channel and its physical route.
   */
  handle(
    channel: string,
    handler: ConnectionRpcHandler,
    options: ConnectionRpcHandlerOptions,
  ): () => Promise<void>

  /**
   * Intercept owned endpoints on the shared `/api` channel before its fallback.
   * @param channel - reserved shared channel; currently `/api`.
   * @param matches - synchronous endpoint ownership test.
   * @param handler - decoded endpoint handler returning the existing RPC result shape.
   * @param options - trust policy for every endpoint claimed by this interceptor.
   * @returns asynchronous disposer removing the interceptor.
   */
  intercept(
    channel: '/api',
    matches: ConnectionRpcEndpointMatcher,
    handler: ConnectionRpcHandler,
    options: ConnectionRpcHandlerOptions,
  ): () => Promise<void>
}

/** Host `ctx.connection` shape consumed by transport-independent adapters. */
export interface HostConnectionHandle {
  /** Generic RPC channel registry. */
  readonly rpc: HostConnectionRpc
  /** Optional deployment authorization around the native browser API. */
  readonly apiAccess: HostConnectionApiAccess
}

/** Client caller for logical RPC channels carried by the current transport. */
export interface ClientConnectionRpc {
  /**
   * Call one endpoint through an already registered logical channel.
   * @param channel - absolute logical channel such as `/api`.
   * @param endpoint - channel-relative endpoint such as `goals/create`.
   * @param payload - channel-owned request payload.
   * @param signal - optional caller cancellation.
   * @returns the existing RPC success/error result; correlation stays inside Connection.
   */
  call(
    channel: string,
    endpoint: string,
    payload: unknown,
    signal?: AbortSignal,
  ): Promise<RpcResult<unknown>>
}
