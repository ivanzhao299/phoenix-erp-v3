#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = new Set(process.argv.slice(2));
const outputDirArg = process.argv.find((arg) => arg.startsWith('--output-dir='));
const outputDir = outputDirArg?.split('=')[1] || 'docs/ops/runs';
const dryRun = args.has('--dry-run') || !args.has('--apply');

const COARSE_MENUS = [
  'MENU_FIN2',
  'MENU_PRC2',
  'MENU_PRC2_MASTER',
  'MENU_WORKFLOW',
  'MENU_MASTER',
  'MENU_SETTINGS_IT',
];

const ATOMIC_REPLACEMENTS = {
  MENU_FIN2: [
    'MENU_FIN2_DASHBOARD',
    'MENU_FIN2_CASH_VIEW',
    'MENU_FIN2_CASH_TRANSFER',
    'MENU_FIN2_AR',
    'MENU_FIN2_AR_LEDGER',
    'MENU_FIN2_AP',
    'MENU_FIN2_EXPENSE',
    'MENU_FIN2_REIMBURSE',
    'MENU_FIN2_SHAREHOLDER',
    'MENU_FIN2_REPORT',
  ],
  MENU_PRC2: [
    'MENU_PRC2_DASHBOARD',
    'MENU_PRC2_SUPPLIER',
    'MENU_PRC2_PROJECT',
    'MENU_PRC2_REQUEST',
    'MENU_PRC2_ORDER',
    'MENU_PRC2_PAYMENT',
    'MENU_PRC2_RECEIPT',
    'MENU_PRC2_SHIPMENT',
    'MENU_PRC2_FUND',
  ],
  MENU_PRC2_MASTER: [
    'MENU_PRC2_SUPPLIER',
    'MENU_PRC2_PROJECT',
    'MENU_MD_MATERIAL',
  ],
  MENU_WORKFLOW: [
    'MENU_WORKFLOW_TODO',
    'MENU_WORKFLOW_HISTORY',
    'MENU_WORKFLOW_NOTIFY',
    'MENU_WORKFLOW_CONFIG',
    'MENU_WORKFLOW_RULES',
    'MENU_WORKFLOW_FORM',
    'MENU_WORKFLOW_METRICS',
  ],
  MENU_MASTER: [
    'MENU_FARM_MASTER',
    'MENU_MASTER_GRADE',
    'MENU_MASTER_PRODUCT',
    'MENU_MASTER_PACKAGING',
    'MENU_MASTER_SKU',
  ],
  MENU_SETTINGS_IT: [
    'MENU_SETTINGS_USER',
    'MENU_SETTINGS_ROLE',
    'MENU_SETTINGS_PERMISSION_SET',
    'MENU_SETTINGS_SECURITY',
    'MENU_SETTINGS_AUDIT',
    'MENU_SETTINGS_BRAND',
    'MENU_SETTINGS_TERMINAL',
    'MENU_SETTINGS_POS',
    'MENU_SETTINGS_STOCK',
    'MENU_SETTINGS_NOTIFY',
  ],
};

function runPsql(sql) {
  const candidates = [
    process.env.PSQL_BIN,
    '/Applications/Postgres.app/Contents/Versions/latest/bin/psql',
    'psql',
  ].filter(Boolean);

  let lastError;
  for (const bin of candidates) {
    try {
      return execFileSync(bin, [
        '-X',
        '-v',
        'ON_ERROR_STOP=1',
        '-d',
        process.env.PGDATABASE || 'phoenix_erp',
        '-U',
        process.env.PGUSER || 'mac',
        '-A',
        '-t',
        '-F',
        '\t',
        '-c',
        sql,
      ], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function parseRows(output) {
  return output
    .trim()
    .split('\n')
    .filter((line) => line && !/^\(\d+ rows?\)$/.test(line))
    .map((line) => line.split('\t'));
}

const coarseList = COARSE_MENUS.map((menu) => `'${menu}'`).join(',');
const sql = `
SELECT
  r.role_code,
  COALESCE(r.role_name_zh, r.role_name_lo, r.role_code) AS role_name,
  m.menu_code,
  COALESCE(rmp.perm_codes, '') AS perm_codes
FROM sys_role_menu_permission rmp
JOIN sys_role r ON r.role_id = rmp.role_id
JOIN sys_menu m ON m.menu_id = rmp.menu_id
WHERE m.menu_code IN (${coarseList})
  AND r.role_code <> 'ROLE_ADMIN'
ORDER BY r.role_code, m.menu_code;
`;

let findings = [];
let dbError = null;

try {
  findings = parseRows(runPsql(sql)).map(([roleCode, roleName, menuCode, permCodes]) => ({
    role_code: roleCode,
    role_name: roleName,
    coarse_menu: menuCode,
    perm_codes: permCodes,
    recommended_atomic_menus: ATOMIC_REPLACEMENTS[menuCode] || [],
  }));
} catch (error) {
  dbError = String(error?.stderr || error?.message || error);
}

const severity = dbError ? 'HOLD' : findings.length > 0 ? 'HIGH' : 'PASS';
const result = {
  generated_at: new Date().toISOString(),
  mode: dryRun ? 'dry-run' : 'apply',
  db: {
    database: process.env.PGDATABASE || 'phoenix_erp',
    user: process.env.PGUSER || 'mac',
  },
  inspected_coarse_menus: COARSE_MENUS,
  finding_count: findings.length,
  severity,
  findings,
  db_error: dbError,
  writes_executed: false,
  migration_executed: false,
  deploy_executed: false,
};

const lines = [
  '# Role Permission Matrix Atomicity Audit',
  '',
  `Generated at: ${result.generated_at}`,
  '',
  `Mode: ${result.mode}`,
  `Database: ${result.db.database}`,
  `Severity: ${severity}`,
  `Finding count: ${findings.length}`,
  '',
  '## Boundary',
  '',
  '- Read-only audit only.',
  '- No DB write.',
  '- No migration.',
  '- No deploy.',
  '',
];

if (dbError) {
  lines.push('## DB Evidence Unavailable', '', '```text', dbError, '```', '');
} else if (findings.length === 0) {
  lines.push('## Result', '', 'PASS. No non-admin role grants were found on known coarse parent menu codes.', '');
} else {
  lines.push('## Findings', '');
  lines.push('| role_code | role_name | coarse_menu | perm_codes | recommended atomic replacement family |');
  lines.push('|---|---|---|---|---|');
  for (const finding of findings) {
    lines.push(`| ${finding.role_code} | ${finding.role_name} | ${finding.coarse_menu} | ${finding.perm_codes || '-'} | ${finding.recommended_atomic_menus.join(', ')} |`);
  }
  lines.push('', '## Recommended Next Gate', '');
  lines.push('1. Confirm each role should receive only the listed atomic menu family.');
  lines.push('2. Backfill missing atomic grants by role and action bit.');
  lines.push('3. Remove coarse parent grants from non-admin roles after role-owner approval.');
  lines.push('4. Re-login affected users and smoke test left navigation, center cards, and high-risk buttons.');
}

mkdirSync(outputDir, { recursive: true });
const jsonPath = join(outputDir, 'role-permission-matrix-audit-latest.json');
const mdPath = join(outputDir, 'role-permission-matrix-audit-latest.md');
writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
writeFileSync(mdPath, `${lines.join('\n')}\n`);

console.log(`role-permission-matrix-audit: ${severity}`);
console.log(`findings: ${findings.length}`);
console.log(`json: ${jsonPath}`);
console.log(`md: ${mdPath}`);
if (dbError) {
  console.error(dbError);
  process.exitCode = 2;
}
