/**
 * ZIP archive creation (fflate, synchronous API — the async API spawns blob:
 * workers, which the extension's CSP forbids). PDFs and images are already
 * compressed, so entries are stored without recompression for speed.
 */
import { zipSync, type Zippable } from 'fflate';

export interface ZipEntry {
  name: string;
  bytes: Uint8Array;
}

/** Makes names unique inside an archive: "a.pdf", "a (2).pdf", … */
export function uniqueNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    let candidate = name;
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    for (let i = 2; used.has(candidate.toLowerCase()); i++) candidate = `${stem} (${i})${ext}`;
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

export function createZip(entries: ZipEntry[]): Uint8Array {
  const names = uniqueNames(entries.map((e) => e.name.replace(/[\\/]/g, '_')));
  const files: Zippable = {};
  entries.forEach((entry, i) => {
    files[names[i]!] = [entry.bytes, { level: 0 }];
  });
  return zipSync(files, { level: 0 });
}
