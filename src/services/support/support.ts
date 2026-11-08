/**
 * Ways to support Unique PDF: donation addresses (the Unique Labs wallets also
 * used by GrowX and UnfollowX), the store review page and the developer
 * contact. Nothing here makes a network request; links open in a new tab only
 * when the user clicks them.
 */

export interface Token {
  id: 'eth' | 'usdt' | 'bnb' | 'avax' | 'sol' | 'btc';
  label: string;
}

export interface Wallet {
  id: 'evm' | 'sol' | 'btc';
  name: string;
  subtitle: string;
  /** Exact address; the QR code image encodes this string (checked by a unit test). */
  address: string;
  /** QR code image, served from the extension package. */
  qr: string;
  tokens: Token[];
  networks: string[];
  note: string;
}

const token = (id: Token['id'], label: string): Token => ({ id, label });

export const WALLETS: Wallet[] = [
  {
    id: 'evm',
    name: 'EVM networks',
    subtitle: 'ETH, USDT, BNB, AVAX and more',
    address: '0x257F291514AaAa1533832cC2C8981Cc14063ED17',
    qr: '/donate/qr-evm.svg',
    tokens: [token('eth', 'ETH'), token('usdt', 'USDT'), token('bnb', 'BNB'), token('avax', 'AVAX')],
    networks: ['Ethereum', 'BNB Smart Chain', 'Avalanche C-Chain', '+ other EVM chains'],
    note: 'One address for every EVM network. Send ETH, USDT, BNB, AVAX or other EVM tokens.',
  },
  {
    id: 'sol',
    name: 'Solana',
    subtitle: 'SOL and Solana tokens',
    address: 'GwwZWYxzms9ebEWQNCAJrPSQdsN6SVPGbpMwCYomWqWa',
    qr: '/donate/qr-sol.svg',
    tokens: [token('sol', 'SOL')],
    networks: ['Solana network'],
    note: 'Solana network only. Fast and almost free to send — perfect for small tips.',
  },
  {
    id: 'btc',
    name: 'Bitcoin',
    subtitle: 'BTC',
    address: 'bc1qg6clyevlmfekg3rkyhlk5ggeh3g6dnt5sdje4j',
    qr: '/donate/qr-btc.svg',
    tokens: [token('btc', 'BTC')],
    networks: ['Bitcoin network', 'Native SegWit (bc1)'],
    note: 'Bitcoin network only.',
  },
];

export const tokenIcon = (id: Token['id']) => `/donate/tok-${id}.svg`;

export const DEVELOPER = {
  name: 'Shahriar Ahmed',
  role: 'Developer, Unique Labs',
  website: 'https://www.shahriarahmed.net',
  websiteLabel: 'www.shahriarahmed.net',
  /** Packaged with the extension (no image is fetched). */
  photo: '/developer/shahriar-ahmed.webp',
  telegram: 'https://t.me/igfrostt',
  handle: '@igfrostt',
} as const;

export interface StoreListing {
  /** Where users leave a rating and review. */
  reviewUrl: string;
  /** The extension's public page (for sharing). */
  pageUrl: string;
  storeName: string;
}

/**
 * The store this copy was installed from, or null for development and
 * side-loaded copies (their ID has no store page). Stores add `update_url` to
 * the installed manifest; unpacked extensions don't have one.
 */
export function storeListing(): StoreListing | null {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime?.id) return null;
    const id = chrome.runtime.id;
    const updateUrl = (chrome.runtime.getManifest() as { update_url?: string }).update_url ?? '';
    if (/^https:\/\/[a-z0-9.-]+\.google\.com\//.test(updateUrl)) {
      const pageUrl = `https://chromewebstore.google.com/detail/${id}`;
      return { reviewUrl: `${pageUrl}/reviews`, pageUrl, storeName: 'Chrome Web Store' };
    }
    if (/^https:\/\/[a-z0-9.-]+\.microsoft\.com\//.test(updateUrl)) {
      const pageUrl = `https://microsoftedge.microsoft.com/addons/detail/${id}`;
      return { reviewUrl: pageUrl, pageUrl, storeName: 'Edge Add-ons' };
    }
  } catch {
    /* not running as an installed extension */
  }
  return null;
}

/** A short note people can paste to a friend. */
export function shareMessage(listing = storeListing()): string {
  const where = listing ? listing.pageUrl : 'Search “Unique PDF” in the Chrome Web Store.';
  return `Unique PDF: free PDF tools for Chrome — chat with PDFs, summaries, merge, compress, sign and more. Nothing is uploaded, no watermarks, no sign-up. ${where}`;
}
