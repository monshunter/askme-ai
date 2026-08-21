/** Build the same-origin data URL for one Host-validated Workspace document. */

/**
 * Build the same-origin, Host-validated document preview URL for one virtual Workspace path.
 * @param path - virtual absolute path emitted by the native Workspace runtime.
 * @returns Preview data URL, or `undefined` when the path is not a valid virtual absolute path.
 */
export function documentPreviewHref(path: string): string | undefined {
  if (!path.startsWith('/') || path.includes('\\') || path.includes('\0')) return undefined
  return `/api/zhiwo/document?path=${encodeURIComponent(path)}`
}
