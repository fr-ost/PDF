/**
 * Website settings. Change these, then run `npm run website` to regenerate
 * website/ (the folder you deploy to Vercel).
 */
export const SITE = {
  /** Public address of the website, without a trailing slash (canonical URLs, sitemap, social cards). */
  url: (process.env.SITE_URL || 'https://uniquepdf.vercel.app').replace(/\/+$/, ''),
  name: 'Unique PDF',
  tagline: 'Free PDF editor for Chrome with AI chat',
  /**
   * "Add to Chrome" link. Replace with the Chrome Web Store listing URL once the
   * extension is approved (or set STORE_URL when building).
   */
  storeUrl: process.env.STORE_URL || 'https://chromewebstore.google.com/search/Unique%20PDF',
  brand: 'Unique Labs',
  developer: { name: 'Shahriar Ahmed', url: 'https://www.shahriarahmed.net', telegram: 'https://t.me/igfrostt', handle: '@igfrostt' },
  locale: 'en',
  twitter: '',
};
