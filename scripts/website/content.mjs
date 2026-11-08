/**
 * Website content drawn from the extension itself, so the two stay in sync:
 * the tool list (src/features/registry.ts), the FAQ (store listing
 * description), the donation wallets (src/services/support/support.ts) and the
 * version (package.json). Longer tool copy for the Features page lives here.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ROOT = new URL('../../', import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

export const VERSION = JSON.parse(read('package.json')).version;

export const CATEGORIES = [
  { id: 'ai', title: 'Unique AI', blurb: 'Chat with your PDFs and get instant summaries.' },
  { id: 'organize', title: 'Organize', blurb: 'Merge, split and rearrange documents and pages.' },
  { id: 'convert', title: 'Convert', blurb: 'Compress PDFs and convert between PDFs and images.' },
  { id: 'edit', title: 'Edit', blurb: 'Add text, drawings, signatures, watermarks and page numbers.' },
  { id: 'security', title: 'Security', blurb: 'Protect, unlock, redact and clean up documents.' },
];

const kebab = (name) => name.replace(/([a-z])([A-Z0-9])/g, '$1-$2').replace(/([A-Z])([A-Z][a-z])/g, '$1-$2').toLowerCase();

/** The 20 tools, parsed from the registry. */
export function loadTools() {
  const src = read('src/features/registry.ts');
  const tools = [];
  const re = /tool\(\{ id: '([^']+)', name: '([^']+)', description: '([^']+)', category: '([^']+)', icon: ([A-Za-z0-9]+)/g;
  for (const m of src.matchAll(re)) tools.push({ id: m[1], name: m[2], description: m[3], category: m[4], icon: kebab(m[5]) });
  if (tools.length !== 20) throw new Error(`Expected 20 tools in the registry, found ${tools.length}`);
  return tools;
}

const iconCache = new Map();
/** Inline SVG of a Lucide icon (the same icon set the extension uses). */
export async function icon(name, size = 20, strokeWidth = 2, cls = '') {
  if (!iconCache.has(name)) {
    const file = join(ROOT, `node_modules/lucide-react/dist/esm/icons/${name}.mjs`);
    if (!existsSync(file)) throw new Error(`Unknown icon ${name}`);
    const { __iconData } = await import(pathToFileURL(file).href);
    iconCache.set(name, __iconData.node.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== 'key').map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join(''));
  }
  return `<svg${cls ? ` class="${cls}"` : ''} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconCache.get(name)}</svg>`;
}

/** Questions and answers from the store description's FAQ section. */
export function loadFaq() {
  const text = read('store-assets/listing/description.txt');
  const section = text.split('FREQUENTLY ASKED QUESTIONS')[1]?.split(/\n[A-Z][A-Z ]+\n/)[0];
  if (!section) throw new Error('FAQ section not found in the store description');
  const blocks = section.trim().split(/\n\n+/);
  const faq = blocks.map((b) => {
    const [q, ...rest] = b.split('\n');
    return { q: q.trim(), a: rest.join(' ').trim() };
  });
  if (faq.length < 10 || faq.some((f) => !f.q.endsWith('?') || !f.a)) throw new Error('Could not parse the FAQ');
  return faq;
}

/** Donation wallets from the extension's support data. */
export function loadWallets() {
  const src = read('src/services/support/support.ts');
  const re = /id: '(evm|sol|btc)',\s*name: '([^']+)',\s*subtitle: '([^']+)',\s*address: '([^']+)',\s*qr: '([^']+)'[\s\S]*?networks: \[([^\]]+)\],\s*note: '([^']+)'/g;
  const wallets = [...src.matchAll(re)].map((m) => ({ id: m[1], name: m[2], subtitle: m[3], address: m[4], qr: m[5], networks: [...m[6].matchAll(/'([^']+)'/g)].map((n) => n[1]), note: m[7] }));
  if (wallets.length !== 3) throw new Error('Could not read the donation wallets');
  return wallets;
}

/** Longer copy for each tool on the Features page. */
export const TOOL_DETAILS = {
  'ai-chat': {
    long: 'Ask questions about any PDF in plain language. Unique AI answers in seconds and shows the page each answer comes from, so you can check the source with one click.',
    points: ['Clickable page references and a sources list on every answer', 'Follow-up questions, suggested questions, stop and regenerate', 'Replies in English, Spanish or Japanese; export the chat as Markdown'],
  },
  'ai-summary': {
    long: 'Get the gist of a long report, paper or manual in seconds. Choose key points, a short overview, a teaser or a single headline.',
    points: ['Short, medium or long; summarize all pages or a range', 'Tell it what to focus on, such as deadlines or costs', 'Copy the summary or download it as a Markdown file'],
  },
  merge: {
    long: 'Combine several documents into one file. Drag the files into order or use the arrow buttons, then save a single PDF.',
    points: ['Any number of files, in any order', 'Drag and drop or arrow buttons to arrange them', 'Merge the same file more than once if you need to'],
  },
  split: {
    long: 'Break a document into separate files: one per page, custom ranges, equal parts, or new files that start at the pages you click.',
    points: ['Page ranges like 1-3, 5, 8- with instant validation', 'Several files download together as a ZIP archive', 'Links between pages are kept inside each part'],
  },
  organize: {
    long: 'A single workspace for pages from several documents. Reorder by dragging, rotate and delete pages, then save one new file.',
    points: ['Thumbnails with source colours for each file', 'Keyboard drag and drop with screen-reader announcements', 'Extract a selection as a separate PDF'],
  },
  rotate: { long: 'Turn individual pages, a selection or the whole document by 90 or 180 degrees.', points: ['Select pages with click, Shift-click or keyboard', 'See the result in the thumbnails before saving'] },
  reorder: { long: 'Drag page thumbnails into a new order, or reverse the whole document with one click.', points: ['Mouse, touch and keyboard drag and drop', 'Bookmarks and forms stay intact'] },
  'delete-pages': { long: 'Remove the pages you do not need. Deleted pages are removed from the file completely, along with their annotations and hidden data.', points: ['Confirmation before deleting', 'Byte-level checks in our tests prove deleted content is gone'] },
  extract: { long: 'Save selected pages as one new PDF, or as separate files.', points: ['Pick pages by clicking or typing a range', 'Only data from the chosen pages is kept'] },
  compress: {
    long: 'Make large documents smaller so they are easier to email and share. Images are optimized while text and drawings stay sharp and searchable.',
    points: ['Choose a light, balanced or strong level', 'See the size before and after', 'Optional maximum compression turns pages into images, with a clear warning'],
  },
  'images-to-pdf': {
    long: 'Turn photos, scans and screenshots into a clean PDF. Choose the page size, orientation and margins, and reorder images before you save.',
    points: ['Phone photos are turned the right way up automatically', 'JPEG photos are embedded without re-compression', 'Fit to page or keep the original size'],
  },
  'pdf-to-images': { long: 'Save pages as high-quality images at the resolution you need.', points: ['From 72 to 600 DPI', 'One image, or several in a ZIP archive'] },
  edit: {
    long: 'Add text, freehand drawings, highlights, rectangles, ellipses, lines, arrows and pictures to any page, with undo, redo and zoom.',
    points: ['Move, resize and style every object', 'Works correctly on rotated pages', 'Adds new content; it does not rewrite existing text'],
  },
  sign: { long: 'Draw your signature once and place it anywhere on the document. The signature is saved as crisp vector lines.', points: ['Resize and move it before saving', 'Undo and redo while you place it'] },
  watermark: { long: 'Stamp text or an image across pages with full control over transparency, angle, position and tiling.', points: ['Live preview', 'Put it behind or in front of the content', 'Apply to all pages or a selection'] },
  'page-numbers': { long: 'Number pages in several styles, choose the corner or centre, the start number and which pages to skip.', points: ['Formats like "1", "Page 1" and "Page 1 of 12"', 'Live preview on your document'] },
  protect: { long: 'Encrypt a document with a password using AES-256, and decide whether others may print, copy or change it.', points: ['Password strength meter', 'Optional separate permissions password'] },
  unlock: { long: 'Remove the password from a document when you know it. Unique PDF never guesses or bypasses passwords.', points: ['Works with files made by other apps', 'Restrictions need the owner password'] },
  redact: {
    long: 'Remove sensitive information for good. Search for words and numbers or draw boxes, and the content underneath is removed from the file, not just covered.',
    points: ['Automatic verification after redacting', 'Removes hidden information such as metadata and attachments', 'Optionally keeps the rest of the page searchable'],
  },
  metadata: { long: 'View, edit or remove document details such as title, author, subject and keywords.', points: ['Remove all metadata in one click', 'Keeps the XMP metadata in sync'] },
};
