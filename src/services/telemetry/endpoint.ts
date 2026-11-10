/**
 * The Unique PDF tracker (tracker/worker.js on Cloudflare Workers). The only
 * remote host the extension may connect to: it is the single extra entry in
 * the manifest's connect-src, and it is used only while the user has turned
 * on anonymous usage stats.
 */
export const USAGE_STATS_ENDPOINT = 'https://unique-pdf.shahriarahmed614.workers.dev';
