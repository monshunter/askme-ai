/** URL policy for untrusted assistant-authored Markdown. */

import type { UrlTransform } from 'react-markdown'

/** Allow only explicit remote links and mail addresses; reject images and local navigation. */
export const safeMarkdownUrl: UrlTransform = (url, key) => {
  if (key !== 'href') return null
  try {
    const protocol = new URL(url).protocol
    return protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:' ? url : null
  } catch {
    return null
  }
}
