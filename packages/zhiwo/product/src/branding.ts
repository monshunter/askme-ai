/** Host-owned browser-document branding for the Zhiwo Web profile. */

/** Stable product title placed in the initial Zhiwo document. */
export const ZHIWO_PRODUCT_TITLE = '知我AI'

/** Rounded “知” icon served to browser tabs and install surfaces. */
export const ZHIWO_FAVICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="#111318"/><text x="16" y="22" text-anchor="middle" font-family="system-ui,sans-serif" font-size="18" font-weight="700" fill="white">知</text></svg>'

/** Self-contained rounded “知” favicon used before the Client starts. */
export const ZHIWO_FAVICON_DATA_URL = `data:image/svg+xml,${encodeURIComponent(ZHIWO_FAVICON_SVG)}`

/** Zhiwo install metadata served instead of the generic Web manifest. */
export const ZHIWO_WEB_MANIFEST = `${JSON.stringify({
  id: '/',
  name: ZHIWO_PRODUCT_TITLE,
  short_name: ZHIWO_PRODUCT_TITLE,
  start_url: '/',
  scope: '/',
  display: 'fullscreen',
  icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
}, null, 2)}\n`
