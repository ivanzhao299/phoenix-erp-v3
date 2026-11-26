import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const pendingByScope = {
  'egg-source-permissions-1126': /^1795651200000-EggSourceIndependentPermissions$/,
  'egg-source-house-1126': /^1795654800000-EggSourceHouseContract$/,
};
export function parseInspectionReceipt(stdout, target, run, scope='egg-source-permissions-1126') {
  if (!Object.hasOwn(pendingByScope,scope)) throw new Error('INSPECTION_RECEIPT_INVALID_SCOPE');
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
  read('PENDING_MIGRATION_FILES', pendingByScope[scope]);
  read('VET_BACKUP_VOLUME', /^VERIFIED$/);
  read('INSPECT', /^COMPLETE$/);
  return { target, run, ledgerSha256, scopedInspectionSha256 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { REMOTE_STDOUT, INSPECTION_TARGET, INSPECTION_RUN, INSPECTION_SCOPE } = process.env;
  const receipt = parseInspectionReceipt(REMOTE_STDOUT ?? '', INSPECTION_TARGET, INSPECTION_RUN, INSPECTION_SCOPE);
  writeFileSync(process.argv[2], JSON.stringify(receipt) + '\n', { flag: 'wx', mode: 0o600 });
}
