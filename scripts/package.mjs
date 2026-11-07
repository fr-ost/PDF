// Packages dist/ into release/unique-pdf-<version>.zip for the Chrome Web Store.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const { version } = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const entries = {};
for (const file of walk(dist)) {
  const name = relative(dist, file).split('\\').join('/');
  entries[name] = [new Uint8Array(readFileSync(file)), { level: /\.(png|woff2|wasm)$/.test(name) ? 0 : 9, mtime: new Date('2026-01-01T00:00:00Z') }];
}
mkdirSync(join(root, 'release'), { recursive: true });
const out = join(root, 'release', `unique-pdf-${version}.zip`);
const zip = zipSync(entries);
writeFileSync(out, zip);
console.log(`Packaged ${Object.keys(entries).length} files → ${relative(root, out)} (${(zip.length / 1024 / 1024).toFixed(2)} MB)`);
