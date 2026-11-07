// Copies the PDF.js runtime assets (character maps, standard fonts, ICC
// profiles and WebAssembly image decoders) into public/vendor/pdfjs so they
// ship inside the extension and work offline. The QuickJS sandbox used for
// executing document JavaScript is intentionally NOT copied: Unique PDF never
// runs scripts embedded in PDF files.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'pdfjs-dist');
const dest = join(root, 'public', 'vendor', 'pdfjs');

if (!existsSync(src)) {
  console.error('pdfjs-dist is not installed. Run npm install first.');
  process.exit(1);
}
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });

for (const dir of ['cmaps', 'standard_fonts', 'iccs']) {
  cpSync(join(src, dir), join(dest, dir), { recursive: true });
}
mkdirSync(join(dest, 'wasm'), { recursive: true });
for (const file of readdirSync(join(src, 'wasm'))) {
  if (file.toLowerCase().includes('quickjs')) continue;
  cpSync(join(src, 'wasm', file), join(dest, 'wasm', file));
}
cpSync(join(src, 'LICENSE'), join(dest, 'LICENSE'));
console.log('PDF.js assets copied to public/vendor/pdfjs');
