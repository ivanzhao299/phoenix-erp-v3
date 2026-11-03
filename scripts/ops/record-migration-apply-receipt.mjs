/** Record a controlled out-of-band migration application as a durable receipt.
 * Runs on the production host after scripts/deploy-schema-first.sh applied the
 * pending TypeORM migrations from the reviewed candidate image. The receipt is
 * what later lets a v3 floor re-anchor tolerate the applied migrations
 * (see assertScopeMigrationsReceipted in chanjet-admission-schema-receipt.mjs).
 * Refuses to record anything the production ledger cannot confirm. */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONTRACT, git, secureJson, verifyContext } from './production-config-guard.mjs';
import { atomicState } from './production-atomic-state.mjs';
import { RECEIPT_DIRECTORY, digest, readProductionLedger } from './chanjet-admission-schema-receipt.mjs';

const hold = reason => { throw new Error(`MIGRATION_RECEIPT=HOLD_${reason}`); };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = CONTRACT.repository;
    const targetSha = process.env.TARGET_SHA || '';
    const runId = process.env.MIGRATION_RUN_ID || '';
    const beforeLedgerSha256 = process.env.BEFORE_LEDGER_SHA256 || '';
    const migrationPaths = process.argv.slice(2);
    if (!/^[a-f0-9]{40}$/.test(targetSha) || !/^\d+-\d+$/.test(runId) || !/^[a-f0-9]{64}$/.test(beforeLedgerSha256)) hold('INPUT');
    if (!migrationPaths.length) hold('NO_MIGRATIONS');
    verifyContext(root, CONTRACT.stateDirectory);
    const ledger = readProductionLedger();
    const ledgerDigest = digest(JSON.stringify(ledger));
    const applied = new Set(ledger.typeorm.map(row => `${row.timestamp}:${row.name}`));
    for (const migrationPath of migrationPaths) {
      if (!migrationPath.startsWith('apps/api/src/database/migrations/')) hold('PATH_SCOPE');
      const name = path.basename(migrationPath, '.ts');
      const match = /^(\d+)-([A-Za-z0-9]+)$/.exec(name);
      if (!match) hold(`NAME:${name}`);
      const sourceBlob = git(root, ['rev-parse', `${targetSha}:${migrationPath}`]);
      if (!applied.has(`${match[1]}:${match[2]}`)) hold(`NOT_APPLIED:${name}`);
      const receipt = {
        schema: 'phoenix.migration-apply-receipt/v1', outcome: 'SUCCESS',
        migrationPath, migrationTimestamp: Number(match[1]), migrationName: match[2],
        runId, appliedAt: new Date().toISOString(), sourceSha: targetSha, sourceBlob,
        beforeLedgerSha256, afterLedgerSha256: ledgerDigest,
      };
      const file = path.join(CONTRACT.stateDirectory, RECEIPT_DIRECTORY, `${name}.json`);
      if (secureJsonOptional(file)) hold(`RECEIPT_EXISTS:${name}`);
      atomicState(file, receipt);
      console.log(`MIGRATION_RECEIPT=RECORDED;migration=${name};run=${runId};ledger=${ledgerDigest.slice(0, 12)}`);
    }
    // Sanity: the recorded digest must reproduce from a fresh read.
    if (digest(JSON.stringify(readProductionLedger())) !== ledgerDigest) hold('LEDGER_UNSTABLE');
    console.log('MIGRATION_RECEIPT=COMPLETE');
  } catch (error) {
    const message = String(error?.message || '').replace(/\s+/g, ' ').slice(0, 200);
    console.error(message.startsWith('MIGRATION_RECEIPT=') ? message : `MIGRATION_RECEIPT=HOLD_VALIDATION:${message}`);
    process.exitCode = 1;
  }
}
function secureJsonOptional(file) {
  try { return secureJson(file); } catch { return null; }
}
