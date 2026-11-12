import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { AUDIT_BUNDLE_FILES } from './readonly-audit-bundle-stage.mjs';
export { AUDIT_BUNDLE_FILES };


function imports(source) {
  const found = new Set();
  for (const pattern of [/(?:from\s+|import\()\s*['"]\.\/([^'"]+)['"]/g, /new URL\(\s*['"]\.\/([^'"]+)['"]/g]) {
    for (const match of source.matchAll(pattern)) found.add(match[1]);
  }
  return found;
}

export function auditBundleManifest(root = path.resolve('scripts/ops')) {
  const files = new Set(AUDIT_BUNDLE_FILES);
  const seen = new Set();
  const visit = name => {
    if (seen.has(name)) return;
    seen.add(name);
    if (!name.endsWith('.mjs')) return;
    const source = fs.readFileSync(path.join(root, name), 'utf8');
    for (const imported of imports(source)) { if (!files.has(imported)) throw new Error(`AUDIT_BUNDLE_MANIFEST_MISSING=${imported}`); visit(imported); }
  };
  for (const file of files) {
    if (!fs.lstatSync(path.join(root, file)).isFile()) throw new Error(`AUDIT_BUNDLE_MANIFEST_FILE=${file}`);
    visit(file);
  }
  const names = [...files].sort();
  return { schema: 'phoenix.readonly-audit-closure/1', targetSha: process.env.AUDIT_MANIFEST_TARGET_SHA || '', fileCount: names.length, closureSha256: createHash('sha256').update(names.join('\n')).digest('hex'), files: names.map(file => ({ path: file, sha256: createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex') })) };
}

if (import.meta.url === `file://${process.argv[1]}`) process.stdout.write(`${JSON.stringify(auditBundleManifest())}\n`);
