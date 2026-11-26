import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function parseInspectionReceipt(stdout, target, run) {
  if (!/^[a-f0-9]{40}$/.test(target) || !/^[1-9][0-9]*-[1-9][0-9]*$/.test(run)) {
    throw new Error('INSPECTION_RECEIPT_INVALID_IDENTITY');
  }
  const lines = stdout.split(/\r?\n/);
  function read(key, expected) {
    const matches = lines.filter(line => line.startsWith(key + '='));
    const value = matches[0]?.slice(key.length + 1).trim();
    if (matches.length !== 1 || !expected.test(value)) throw new Error('INSPECTION_RECEIPT_INVALID_' + key);
    return value;
  }
  const ledgerSha256 = read('LEDGER_SHA256', /^[a-f0-9]{64}$/);
  const scopedInspectionSha256 = read('SCOPED_INSPECTION_SHA256', /^[a-f0-9]{64}$/);
  read('PENDING_MIGRATION_FILES', /^1795651200000-EggSourceIndependentPermissions$/);
  read('VET_BACKUP_VOLUME', /^VERIFIED$/);
  read('INSPECT', /^COMPLETE$/);
  return { target, run, ledgerSha256, scopedInspectionSha256 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { REMOTE_STDOUT, INSPECTION_TARGET, INSPECTION_RUN } = process.env;
  const receipt = parseInspectionReceipt(REMOTE_STDOUT ?? '', INSPECTION_TARGET, INSPECTION_RUN);
  writeFileSync(process.argv[2], JSON.stringify(receipt) + '\n', { flag: 'wx', mode: 0o600 });
}
