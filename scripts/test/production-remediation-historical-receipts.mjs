// Synthetic v1 receipts on the actual 20 released Git blobs and an isolated PG ledger.
// They never enter a protected registry or become production evidence.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {isCompatibleReceipt} from '../ops/record-migration-apply-receipt.mjs';
import {INITIAL_MODERN_SCHEMA_PROFILE} from '../ops/production-modern-schema-facts.mjs';
import {digest} from '../ops/chanjet-admission-schema-receipt.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const candidate = process.argv[2];
assert.match(candidate, /^[a-f0-9]{40}$/);
const git = (...args) => execFileSync('git', ['--no-replace-objects', ...args], {cwd:root, encoding:'utf8'}).trim();
const sourceSha = git('rev-parse', 'eaeec067bbc5f^{commit}');
const paths = git('diff','--name-only',INITIAL_MODERN_SCHEMA_PROFILE.runtimeSha,sourceSha,'--',
  'apps/api/src/database/migrations').split('\n');
assert.equal(paths.length, INITIAL_MODERN_SCHEMA_PROFILE.pendingCount);
const entries = JSON.parse(fs.readFileSync(0, 'utf8'));
const ledger = {typeorm:entries.map(line => {
  const [,timestamp,name] = line.split('|');
  return {timestamp,name};
})};
for (const migrationPath of paths) {
  const [,timestamp,migrationName] = /\/(\d{13})-(\w+)\.ts$/.exec(migrationPath);
  const old = {schema:'phoenix.migration-apply-receipt/v1', outcome:'SUCCESS',
    migrationPath, migrationTimestamp:Number(timestamp), migrationName, sourceSha, sourceBlob:git('rev-parse',sourceSha+':'+migrationPath),
    runId:'1-1', appliedAt:'2026-11-22T00:00:00.000Z', beforeLedgerSha256:digest('fixture-before'), afterLedgerSha256:digest('fixture-after')};
  const target = {...old, sourceSha:candidate, runId:'2-1', afterLedgerSha256:digest(JSON.stringify(ledger))};
  assert.ok(isCompatibleReceipt(old,target,{root,ledger}),migrationPath);
  const missing = {typeorm:ledger.typeorm.filter(row => row.timestamp !== timestamp)};
  assert.equal(isCompatibleReceipt(old,target,{root,ledger:missing}),false,migrationPath);
  assert.equal(isCompatibleReceipt({...old,sourceBlob:'0'.repeat(40)},target,{root,ledger}),false,migrationPath);
}
console.log(paths.length);
