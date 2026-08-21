/** Host-owned browser-document branding for the Zhiwo Web profile. */

/** Stable product title placed in the initial Zhiwo document. */
export const ZHIWO_PRODUCT_TITLE = '知我AI'

/** Product logo served to browser tabs, install surfaces, and Client brand slots. */
export const ZHIWO_LOGO_PATH = '/assets/zhiwo/logo.png'

/** Zhiwo install metadata served instead of the generic Web manifest. */
export const ZHIWO_WEB_MANIFEST = `${JSON.stringify({
  id: '/',
  name: ZHIWO_PRODUCT_TITLE,
  short_name: ZHIWO_PRODUCT_TITLE,
  start_url: '/',
  scope: '/',
  display: 'fullscreen',
  icons: [{ src: ZHIWO_LOGO_PATH, sizes: '1254x1254', type: 'image/png', purpose: 'any' }],
}, null, 2)}\n`
