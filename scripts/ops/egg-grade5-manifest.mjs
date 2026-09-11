import fs from 'node:fs';
import crypto from 'node:crypto';

export const CANONICAL = Object.freeze({ product_code: 'EGG', grade_code: 'GRADE_5', spec_code: 'PKG_PACK_SPEC_3' });
export const CONFIRM = 'APPLY-EGG-GRADE5-MANIFEST-20260911';

export function loadManifest(path) {
  if (!path) throw new Error('manifest path is required');
  if (!path.startsWith('scripts/ops/manifests/') || path.includes('..')) throw new Error('manifest must be a repository manifest');
  const raw = fs.readFileSync(path, 'utf8');
  const manifest = JSON.parse(raw);
  validateManifest(manifest);
  return { manifest, raw };
}

export function manifestHash(raw) { return crypto.createHash('sha256').update(raw).digest('hex'); }

export function validateManifest(m) {
  if (!m || m.version !== 1 || !Array.isArray(m.targets) || m.targets.length !== 1) throw new Error('manifest must contain exactly one target');
  if (m.product_code !== CANONICAL.product_code || m.grade_code !== CANONICAL.grade_code || m.spec_code !== CANONICAL.spec_code) throw new Error('manifest canonical tuple mismatch');
  if (m.confirmation !== CONFIRM) throw new Error('manifest confirmation mismatch');
  if (!m.revision || !/^[0-9a-f]{40}$/.test(m.revision)) throw new Error('manifest revision must be a full git SHA');
  const t = m.targets[0];
  for (const k of ['product_code','grade_code','spec_code']) if (t[k] !== CANONICAL[k]) throw new Error(`target ${k} mismatch`);
  if (!t.sku_code || !t.source_no) throw new Error('target sku_code and source_no are required');
  if (/GRADE_[12]/.test(JSON.stringify(m)) || /PRD-EGG-[12]/.test(JSON.stringify(m))) throw new Error('GRADE_1/2 is forbidden');
  if (m.product_code !== 'EGG') throw new Error('arbitrary product is forbidden');
  return true;
}

if (process.argv[1]?.endsWith('egg-grade5-manifest.mjs')) {
  const { raw } = loadManifest(process.argv[2]);
  console.log(JSON.stringify({ sha256: manifestHash(raw), canonical: CANONICAL }));
}
