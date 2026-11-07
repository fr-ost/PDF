// Writes THIRD_PARTY_NOTICES.txt into the build output, listing every
// production dependency that ships in the extension with its license text.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, process.argv[2] ?? 'dist');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const seen = new Map();

function findPackageDir(name) {
  const dir = join(root, 'node_modules', name);
  return existsSync(join(dir, 'package.json')) ? dir : null;
}

function visit(name) {
  if (seen.has(name)) return;
  const dir = findPackageDir(name);
  if (!dir) return;
  const meta = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const licenseFile = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f));
  seen.set(name, {
    name,
    version: meta.version,
    license: typeof meta.license === 'string' ? meta.license : meta.license?.type ?? 'UNKNOWN',
    text: licenseFile ? readFileSync(join(dir, licenseFile), 'utf8').trim() : '',
  });
  for (const dep of Object.keys(meta.dependencies ?? {})) visit(dep);
}

for (const dep of Object.keys(pkg.dependencies ?? {})) visit(dep);

const header = `Unique PDF ${pkg.version} — third-party software notices\n\nUnique PDF includes the following open-source components.\n`;
const body = [...seen.values()]
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((p) => `${'='.repeat(78)}\n${p.name} ${p.version}\nLicense: ${p.license}\n${'-'.repeat(78)}\n${p.text || '(license text not included in package; see the license identifier above)'}\n`)
  .join('\n');
const pdfjsWasm = ['LICENSE_OPENJPEG', 'LICENSE_JBIG2', 'LICENSE_QCMS', 'LICENSE_PDFJS_OPENJPEG', 'LICENSE_PDFJS_JBIG2', 'LICENSE_PDFJS_QCMS']
  .map((f) => join(root, 'node_modules', 'pdfjs-dist', 'wasm', f))
  .filter(existsSync)
  .map((f) => `${'='.repeat(78)}\npdfjs-dist/wasm/${f.split('/').pop()}\n${'-'.repeat(78)}\n${readFileSync(f, 'utf8').trim()}\n`)
  .join('\n');
writeFileSync(join(outDir, 'THIRD_PARTY_NOTICES.txt'), `${header}\n${body}\n${pdfjsWasm}`);
console.log(`THIRD_PARTY_NOTICES.txt written (${seen.size} packages)`);
