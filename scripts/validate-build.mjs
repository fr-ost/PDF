// Post-build validation of the extension package: manifest correctness,
// permission/CSP audit, and checks that no remote code, eval, source maps or
// test fixtures ship in a production build.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, process.argv[2] ?? 'dist');
const production = !process.argv[2] || process.argv[2] === 'dist';
const errors = [];
const warnings = [];
const fail = (m) => errors.push(m);

if (!existsSync(dist)) {
  console.error(`Build output not found: ${dist}`);
  process.exit(1);
}

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const files = walk(dist);
const rel = (p) => relative(dist, p);

// ---- manifest -------------------------------------------------------------
const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
if (manifest.manifest_version !== 3) fail('manifest_version must be 3');
if (manifest.version !== pkg.version) fail(`manifest version ${manifest.version} != package.json ${pkg.version}`);
if (!/^\d+(\.\d+){0,3}$/.test(manifest.version)) fail('manifest version must be 1-4 dot-separated integers');
if (!manifest.name || manifest.name.length > 75) fail('name missing or longer than 75 characters');
if (!manifest.description || manifest.description.length > 132) fail(`description must be 1-132 characters (is ${manifest.description?.length})`);
if (manifest.short_name && manifest.short_name.length > 12) warnings.push('short_name longer than 12 characters may be truncated');
for (const [size, path] of Object.entries(manifest.icons ?? {})) {
  if (!existsSync(join(dist, path))) fail(`icon ${size} missing: ${path}`);
}
for (const size of ['16', '32', '48', '128']) if (!manifest.icons?.[size]) fail(`icon size ${size} not declared`);
const referenced = [manifest.action?.default_popup, manifest.options_ui?.page, manifest.background?.service_worker].filter(Boolean);
for (const p of referenced) if (!existsSync(join(dist, p))) fail(`manifest references missing file: ${p}`);
if (!existsSync(join(dist, 'app.html'))) fail('app.html missing');

// ---- permissions & CSP audit ---------------------------------------------
const allowedPermissions = new Set(['storage']);
for (const p of manifest.permissions ?? []) if (!allowedPermissions.has(p)) fail(`unexpected permission: ${p}`);
if (manifest.host_permissions?.length) fail('host_permissions must be empty');
if (manifest.optional_host_permissions?.length) fail('optional_host_permissions must be empty');
if (manifest.content_scripts?.length) fail('content_scripts are not expected');
if (manifest.web_accessible_resources?.length) fail('web_accessible_resources are not expected');
if (manifest.externally_connectable) fail('externally_connectable is not expected');
const csp = manifest.content_security_policy?.extension_pages ?? '';
if (!csp) fail('extension_pages CSP missing');
if (/unsafe-eval(?!')|'unsafe-eval'/.test(csp.replace("'wasm-unsafe-eval'", ''))) fail("CSP must not contain 'unsafe-eval'");
if (/script-src[^;]*https?:/.test(csp)) fail('CSP must not allow remote scripts');
if (!/connect-src 'self' blob: data:/.test(csp)) fail('CSP must restrict connect-src to local sources');
if (!/object-src 'none'/.test(csp)) fail("CSP must set object-src 'none'");

// ---- code checks -----------------------------------------------------------
const jsFiles = files.filter((f) => /\.(m?js)$/.test(f));
for (const f of jsFiles) {
  const code = readFileSync(f, 'utf8');
  if (/\beval\s*\(/.test(code)) fail(`${rel(f)} contains eval(`);
  if (/new\s+Function\s*\(/.test(code)) fail(`${rel(f)} contains new Function(`);
  if (/importScripts\s*\(\s*['"]https?:/.test(code) || /import\s*\(\s*['"]https?:/.test(code)) fail(`${rel(f)} loads remote code`);
  if (/https?:\/\/(cdn|unpkg|jsdelivr|cdnjs|googleapis|gstatic)/i.test(code)) fail(`${rel(f)} references a CDN URL`);
  if (/google-analytics|googletagmanager|segment\.io|mixpanel|sentry\.io|hotjar/i.test(code)) fail(`${rel(f)} references a telemetry service`);
}
for (const f of files.filter((p) => p.endsWith('.html'))) {
  const html = readFileSync(f, 'utf8');
  if (/<script[^>]+src=["']https?:/i.test(html)) fail(`${rel(f)} loads a remote script`);
  if (/<script(?![^>]*\bsrc=)[^>]*>[^<]+<\/script>/i.test(html)) fail(`${rel(f)} contains an inline script (blocked by CSP)`);
  if (/<link[^>]+href=["']https?:/i.test(html)) fail(`${rel(f)} loads a remote stylesheet`);
}

// pdf-lib (the PDF writer) must only live in the processing worker bundle.
for (const f of jsFiles) {
  const code = readFileSync(f, 'utf8');
  if (/ForeignPageError|Hopding\/pdf-lib/.test(code) && !rel(f).includes('processing.worker')) fail(`pdf-lib leaked into a UI bundle: ${rel(f)}`);
}

if (production) {
  const maps = files.filter((f) => f.endsWith('.map'));
  if (maps.length) fail(`source maps present in production build (${maps.length})`);
  const fixtures = files.filter((f) => /fixtures|\.test\.|\/tests?\//.test(rel(f)));
  if (fixtures.length) fail(`test files in production build: ${fixtures.map(rel).join(', ')}`);
  const quickjs = files.filter((f) => /quickjs/i.test(f));
  if (quickjs.length) fail('PDF.js scripting engine (QuickJS) must not be shipped');
  if (!existsSync(join(dist, 'THIRD_PARTY_NOTICES.txt'))) warnings.push('THIRD_PARTY_NOTICES.txt missing');
}

// ---- report ----------------------------------------------------------------
const total = files.reduce((n, f) => n + statSync(f).size, 0);
console.log(`Validated ${rel(dist) || dist}: ${files.length} files, ${(total / 1024 / 1024).toFixed(2)} MB`);
console.log(`  name: ${manifest.name}  version: ${manifest.version}`);
console.log(`  permissions: ${JSON.stringify(manifest.permissions ?? [])}  host_permissions: ${JSON.stringify(manifest.host_permissions ?? [])}`);
for (const w of warnings) console.warn(`  warning: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`  ERROR: ${e}`);
  process.exit(1);
}
console.log('  ✓ manifest, permissions, CSP and bundle checks passed');
