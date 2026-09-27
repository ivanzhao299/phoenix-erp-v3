import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const wrapper = fs.readFileSync('scripts/phase1-controlled-production-execution.sh', 'utf8');
const start = wrapper.indexOf('copy_evidence_file() {');
const end = wrapper.indexOf('\nprintf \'%s\\n\' "$TARGET_SHA"', start);
assert.ok(start >= 0 && end > start, 'evidence copy helper must be present');
const helper = wrapper.slice(start, end).trim();

function runHelper(src, dst) {
  return spawnSync('bash', ['-c', `${helper}\ncopy_evidence_file "$1" "$2"`, 'evidence-copy', src, dst], {
    encoding: 'utf8'
  });
}

test('same-file evidence copy is a successful no-op and preserves content', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase1-evidence-copy-'));
  const file = path.join(root, 'preflight.json');
  const content = '{"pass":true,"diagnostics":{"canonical_typeorm_pending":[]}}\n';
  fs.writeFileSync(file, content);

  const result = runHelper(file, file);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(file, 'utf8'), content);
});

test('different-file evidence copy replaces the destination', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase1-evidence-copy-'));
  const source = path.join(root, 'source', 'preflight.json');
  const destination = path.join(root, 'evidence', 'preflight.json');
  fs.mkdirSync(path.dirname(source));
  fs.mkdirSync(path.dirname(destination));
  fs.writeFileSync(source, '{"pass":true}\n');
  fs.writeFileSync(destination, '{"pass":false}\n');

  const result = runHelper(source, destination);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(destination, 'utf8'), fs.readFileSync(source, 'utf8'));
});

test('missing evidence source fails closed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase1-evidence-copy-'));
  const result = runHelper(path.join(root, 'missing.json'), path.join(root, 'destination.json'));
  assert.notEqual(result.status, 0);
});

test('empty evidence source fails closed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase1-evidence-copy-'));
  const source = path.join(root, 'empty.json');
  const destination = path.join(root, 'destination.json');
  fs.writeFileSync(source, '');
  const result = runHelper(source, destination);
  assert.notEqual(result.status, 0);
});
