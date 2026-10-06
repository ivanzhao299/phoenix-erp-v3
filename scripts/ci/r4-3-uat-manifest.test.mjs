import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const runId = 'UAT-20261006-R4-6b0e3f';
const dir = path.join(root, 'artifacts', 'uat', runId);
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'uat-run-manifest.json'), 'utf8'));
const graph = JSON.parse(fs.readFileSync(path.join(dir, 'uat-cleanup-graph.json'), 'utf8'));
const results = JSON.parse(fs.readFileSync(path.join(dir, 'uat-case-results.json'), 'utf8'));
assert.equal(manifest.run_id, runId);
assert.equal(manifest.transactional_uat_write_authorized, false);
assert.deepEqual(manifest.created_objects, []);
assert.equal(manifest.cleanup_status, 'NOT_STARTED');
assert.equal(graph.roots.length, 0);
assert(Object.values(results.cases).every((c) => c.status === 'NOT_RUN'));
for (const file of fs.readdirSync(dir)) {
  const text = fs.readFileSync(path.join(dir, file), 'utf8');
  assert(!/Bearer\s+[A-Za-z0-9._-]{20,}/i.test(text), `${file} contains token-like material`);
  assert(!/password|cookie|secret/i.test(text), `${file} contains secret marker`);
}
console.log('R4.3 design manifest checks passed; no production write authorized');
