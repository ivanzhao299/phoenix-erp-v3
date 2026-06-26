#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = new Set(process.argv.slice(2));
const outputDirArg = process.argv.find((arg) => arg.startsWith('--output-dir='));
const outputDir = outputDirArg?.split('=')[1] || 'docs/ops/runs';
const apply = args.has('--apply');
const dryRun = args.has('--dry-run') || !apply;

const ACTION_ORDER = ['V', 'C', 'E', 'D', 'A', 'X'];
const ADMIN_ROLES = new Set(['ROLE_ADMIN']);

const MENU_DEFINITIONS = [
  ['MENU_FIN2_DASHBOARD', '财务总览', 'FIN2', 'MENU_FIN2', 10, 'LayoutDashboard', '/finance2'],
  ['MENU_FIN2_CASH_VIEW', '资金账户查看', 'FIN2', 'MENU_FIN2_CASH', 30, 'Wallet', '/finance2/cash-accounts'],
  ['MENU_FIN2_CASH_TRANSFER', '资金调拨', 'FIN2', 'MENU_FIN2_CASH', 40, 'ArrowLeftRight', '/finance2/fund-transfers'],
  ['MENU_FIN2_AR_LEDGER', '应收总账', 'FIN2', 'MENU_FIN2_AR', 55, 'BookOpen', '/finance2/ar-ledger'],

  ['MENU_PRC2_DASHBOARD', '采购看板', 'PRC', 'MENU_PRC2_MASTER', 58, 'LayoutDashboard', '/procurement2/dashboard'],
  ['MENU_PRC2_SUPPLIER', '供应商档案', 'PRC', 'MENU_PRC2_MASTER', 60, 'Globe', '/procurement2/suppliers'],
  ['MENU_PRC2_PROJECT', '采购项目', 'PRC', 'MENU_PRC2_MASTER', 61, 'FolderKanban', '/procurement2/projects'],
  ['MENU_PRC2_REQUEST', '采购申请', 'PRC', 'MENU_PRC2_MASTER', 62, 'FilePlus', '/procurement2/requests'],
  ['MENU_PRC2_ORDER', '采购订单', 'PRC', 'MENU_PRC2_MASTER', 63, 'ShoppingBag', '/procurement2/orders'],
  ['MENU_PRC2_PAYMENT', '付款管理', 'PRC', 'MENU_PRC2_MASTER', 64, 'Banknote', '/procurement2/payments'],
  ['MENU_PRC2_RECEIPT', '收货管理', 'PRC', 'MENU_PRC2_MASTER', 65, 'PackageCheck', '/procurement2/receipts'],
  ['MENU_PRC2_SHIPMENT', '物流管理', 'PRC', 'MENU_PRC2_MASTER', 66, 'Truck', '/procurement2/shipments'],
  ['MENU_PRC2_FUND', '股东资金', 'PRC', 'MENU_PRC2_MASTER', 67, 'DollarSign', '/procurement2/shareholder-funds'],
  ['MENU_PRC2_INIT', '历史初始化', 'PRC', 'MENU_PRC2_MASTER', 68, 'UploadCloud', '/procurement2/init'],

  ['MENU_MASTER_DATA', '主数据中心', 'MASTER', null, 700, 'Database', '/master-data'],
  ['MENU_MD_CUSTOMER', '客户档案', 'MASTER', 'MENU_MASTER_DATA', 701, 'Users', '/master-data/customers'],
  ['MENU_MD_SUPPLIER', '供应商档案', 'MASTER', 'MENU_MASTER_DATA', 702, 'Globe', '/master-data/suppliers'],
  ['MENU_MD_PROJECT', '项目档案', 'MASTER', 'MENU_MASTER_DATA', 703, 'FolderKanban', '/master-data/projects'],
  ['MENU_MD_PRODUCT', '产品档案', 'MASTER', 'MENU_MASTER_DATA', 704, 'Egg', '/master-data/products'],
  ['MENU_MD_GRADE', '等级档案', 'MASTER', 'MENU_MASTER_DATA', 705, 'Tag', '/master-data/product-grades'],
  ['MENU_MD_PACKAGING', '包装规格', 'MASTER', 'MENU_MASTER_DATA', 706, 'Package', '/master-data/packaging-specs'],
  ['MENU_MD_SKU', 'SKU档案', 'MASTER', 'MENU_MASTER_DATA', 707, 'Layers', '/master-data/product-skus'],
  ['MENU_MD_WAREHOUSE', '仓库档案', 'MASTER', 'MENU_MASTER_DATA', 708, 'Warehouse', '/master-data/warehouses'],
  ['MENU_MD_STORE', '门店档案', 'MASTER', 'MENU_MASTER_DATA', 709, 'Store', '/master-data/stores'],
  ['MENU_MD_DRIVER', '司机档案', 'MASTER', 'MENU_MASTER_DATA', 710, 'UserCheck', '/master-data/drivers'],
  ['MENU_MD_VEHICLE', '车辆档案', 'MASTER', 'MENU_MASTER_DATA', 711, 'Car', '/master-data/vehicles'],
  ['MENU_MD_CASH_ACCOUNT', '资金账户档案', 'MASTER', 'MENU_MASTER_DATA', 712, 'Wallet', '/master-data/cash-accounts'],
  ['MENU_MD_MATERIAL', '物料档案', 'MASTER', 'MENU_MASTER_DATA', 713, 'Package', '/master-data/materials'],
  ['MENU_MD_BANK_ACCOUNT', '银行账户中心', 'MASTER', 'MENU_MASTER_DATA', 715, 'Landmark', '/master-data/bank-accounts'],
  ['MENU_MD_DICT_CENTER', '数据字典中心', 'MASTER', 'MENU_MASTER_DATA', 720, 'BookOpen', '/master-data/dictionaries'],
  ['MENU_MD_QUALITY', '数据质量中心', 'MASTER', 'MENU_MASTER_DATA', 730, 'ShieldCheck', '/master-data/quality'],
  ['MENU_MD_AUDIT', '主数据审计', 'MASTER', 'MENU_MASTER_DATA', 735, 'ScrollText', '/master-data/audit'],
  ['MENU_MD_PENDING', '主数据待审批', 'MASTER', 'MENU_MASTER_DATA', 740, 'ClipboardCheck', '/master-data/pending'],
];

const REPLACEMENTS = {
  MENU_FIN2: [
    ['MENU_FIN2_DASHBOARD', ['V']],
    ['MENU_FIN2_CASH_VIEW', ['V', 'X']],
    ['MENU_FIN2_CASH_TRANSFER', ['V', 'C', 'E', 'A']],
    ['MENU_FIN2_AR', ['V', 'C', 'E', 'A', 'X']],
    ['MENU_FIN2_AR_LEDGER', ['V', 'E', 'X']],
    ['MENU_FIN2_AP', ['V', 'C', 'E', 'A', 'X']],
    ['MENU_FIN2_EXPENSE', ['V', 'C', 'E', 'A', 'X']],
    ['MENU_FIN2_REIMBURSE', ['V', 'C', 'E', 'A', 'X']],
    ['MENU_FIN2_SHAREHOLDER', ['V', 'C', 'E', 'A', 'X']],
    ['MENU_FIN2_REPORT', ['V', 'X']],
  ],
  MENU_PRC2: [
    ['MENU_PRC2_DASHBOARD', ['V', 'X']],
    ['MENU_PRC2_SUPPLIER', ['V', 'C', 'E', 'X']],
    ['MENU_PRC2_PROJECT', ['V', 'C', 'E', 'X']],
    ['MENU_PRC2_REQUEST', ['V', 'C', 'E', 'D', 'A', 'X']],
    ['MENU_PRC2_ORDER', ['V', 'C', 'E', 'D', 'A', 'X']],
    ['MENU_PRC2_PAYMENT', ['V', 'C', 'E', 'A', 'X']],
    ['MENU_PRC2_RECEIPT', ['V', 'C', 'E', 'A', 'X']],
    ['MENU_PRC2_SHIPMENT', ['V', 'C', 'E', 'A', 'X']],
    ['MENU_PRC2_FUND', ['V', 'C', 'E', 'A', 'X']],
  ],
  MENU_PRC2_MASTER: [
    ['MENU_PRC2_SUPPLIER', ['V', 'C', 'E', 'X']],
    ['MENU_PRC2_PROJECT', ['V', 'C', 'E', 'X']],
    ['MENU_MD_MATERIAL', ['V', 'C', 'E', 'X']],
  ],
  MENU_WORKFLOW: [
    ['MENU_WORKFLOW_TODO', ['V', 'C', 'E', 'A']],
    ['MENU_WORKFLOW_HISTORY', ['V']],
    ['MENU_WORKFLOW_NOTIFY', ['V', 'E']],
    ['MENU_WORKFLOW_CONFIG', ['V', 'C', 'E', 'D']],
    ['MENU_WORKFLOW_RULES', ['V', 'C', 'E', 'D']],
    ['MENU_WORKFLOW_FORM', ['V', 'C', 'E']],
    ['MENU_WORKFLOW_METRICS', ['V', 'X']],
  ],
  MENU_MASTER: [
    ['MENU_MASTER_DATA', ['V', 'C', 'E', 'X']],
    ['MENU_MD_PRODUCT', ['V', 'C', 'E', 'X']],
    ['MENU_MD_GRADE', ['V', 'C', 'E', 'X']],
    ['MENU_MD_PACKAGING', ['V', 'C', 'E', 'X']],
    ['MENU_MD_SKU', ['V', 'C', 'E', 'X']],
    ['MENU_MD_STORE', ['V', 'C', 'E', 'X']],
  ],
  MENU_SETTINGS_IT: [
    ['MENU_SETTINGS_USER', ['V', 'C', 'E', 'D']],
    ['MENU_SETTINGS_ROLE', ['V', 'C', 'E', 'D']],
    ['MENU_SETTINGS_PERMISSION_SET', ['V', 'C', 'E', 'D']],
    ['MENU_SETTINGS_SECURITY', ['V', 'C', 'E', 'D']],
    ['MENU_SETTINGS_AUDIT', ['V', 'X']],
    ['MENU_SETTINGS_BRAND', ['V', 'E']],
    ['MENU_SETTINGS_TERMINAL', ['V', 'C', 'E', 'D']],
    ['MENU_SETTINGS_POS', ['V', 'C', 'E', 'D']],
    ['MENU_SETTINGS_STOCK', ['V', 'C', 'E', 'D']],
    ['MENU_SETTINGS_NOTIFY', ['V', 'C', 'E', 'D']],
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
      ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
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

function sqlString(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlArray(values) {
  return `ARRAY[${values.map(sqlString).join(',')}]::text[]`;
}

function normalizePerms(permCodes) {
  if (!permCodes) return [];
  if (permCodes.includes('*')) return [...ACTION_ORDER];
  return [...new Set(permCodes.split(',').map((item) => item.trim()).filter(Boolean))]
    .filter((code) => ACTION_ORDER.includes(code))
    .sort((a, b) => ACTION_ORDER.indexOf(a) - ACTION_ORDER.indexOf(b));
}

function intersectPerms(source, allowed) {
  const sourceSet = new Set(normalizePerms(source));
  return allowed.filter((code) => sourceSet.has(code));
}

function unionPerms(left, right) {
  const merged = new Set([...normalizePerms(left), ...normalizePerms(right)]);
  return ACTION_ORDER.filter((code) => merged.has(code)).join(',');
}

function loadCurrentState() {
  const menuCodes = [
    ...new Set([
      ...MENU_DEFINITIONS.map(([code]) => code),
      ...Object.keys(REPLACEMENTS),
      ...Object.values(REPLACEMENTS).flat().map(([code]) => code),
    ]),
  ];
  const menuSql = `
SELECT menu_code
FROM sys_menu
WHERE menu_code = ANY(${sqlArray(menuCodes)})
ORDER BY menu_code;
`;

  const grantsSql = `
SELECT
  r.role_id::text,
  r.role_code,
  COALESCE(r.role_name_zh, r.role_name_lo, r.role_code) AS role_name,
  m.menu_code,
  COALESCE(rmp.perm_codes, '') AS perm_codes
FROM sys_role_menu_permission rmp
JOIN sys_role r ON r.role_id = rmp.role_id
JOIN sys_menu m ON m.menu_id = rmp.menu_id
WHERE r.role_code <> ALL(${sqlArray([...ADMIN_ROLES])})
  AND (
    m.menu_code = ANY(${sqlArray(Object.keys(REPLACEMENTS))})
    OR m.menu_code = ANY(${sqlArray(Object.values(REPLACEMENTS).flat().map(([code]) => code))})
  )
ORDER BY r.role_code, m.menu_code;
`;

  const existingMenus = new Set(parseRows(runPsql(menuSql)).map(([code]) => code));
  const grants = parseRows(runPsql(grantsSql)).map(([roleId, roleCode, roleName, menuCode, permCodes]) => ({
    role_id: roleId,
    role_code: roleCode,
    role_name: roleName,
    menu_code: menuCode,
    perm_codes: permCodes,
  }));
  return { existingMenus, grants };
}

function buildPlan(state) {
  const grantsByRoleMenu = new Map();
  for (const grant of state.grants) {
    grantsByRoleMenu.set(`${grant.role_id}:${grant.menu_code}`, grant);
  }

  const menuInserts = MENU_DEFINITIONS
    .filter(([code]) => !state.existingMenus.has(code))
    .map(([menu_code, menu_name_zh, domain, parent_code, sort_order, icon, route]) => ({
      menu_code, menu_name_zh, domain, parent_code, sort_order, icon, route,
    }));

  const grantUpserts = [];
  const coarseDeletes = [];

  for (const grant of state.grants) {
    const targets = REPLACEMENTS[grant.menu_code];
    if (!targets) continue;
    coarseDeletes.push(grant);
    for (const [targetMenu, allowed] of targets) {
      const nextPerms = intersectPerms(grant.perm_codes, allowed);
      if (!nextPerms.length) continue;
      const existing = grantsByRoleMenu.get(`${grant.role_id}:${targetMenu}`);
      const finalPerms = unionPerms(existing?.perm_codes || '', nextPerms.join(','));
      grantUpserts.push({
        role_id: grant.role_id,
        role_code: grant.role_code,
        role_name: grant.role_name,
        source_menu: grant.menu_code,
        target_menu: targetMenu,
        source_perm_codes: grant.perm_codes,
        final_perm_codes: finalPerms,
        existing_perm_codes: existing?.perm_codes || '',
      });
    }
  }

  return {
    menu_inserts: menuInserts,
    grant_upserts: grantUpserts,
    coarse_deletes: coarseDeletes,
  };
}

function applyPlan(plan) {
  const menuValues = MENU_DEFINITIONS
    .map(([menu_code, menu_name_zh, domain, parent_code, sort_order, icon, route]) => (
      `(${sqlString(menu_code)}, ${sqlString(menu_name_zh)}, NULL, ${sqlString(domain)}, ${sqlString(parent_code)}, ${Number(sort_order)}, ${sqlString(icon)}, ${sqlString(route)})`
    ))
    .join(',\n        ');

  const upserts = plan.grant_upserts
    .map((item) => `(${sqlString(item.role_code)}, ${sqlString(item.target_menu)}, ${sqlString(item.final_perm_codes)})`)
    .join(',\n        ');

  const coarseMenus = sqlArray(Object.keys(REPLACEMENTS));
  const adminRoles = sqlArray([...ADMIN_ROLES]);

  const sql = `
BEGIN;

INSERT INTO sys_menu (menu_code, menu_name_zh, menu_name_lo, domain, parent_code, sort_order, icon, route)
VALUES
        ${menuValues}
ON CONFLICT (menu_code) DO UPDATE SET
  menu_name_zh = EXCLUDED.menu_name_zh,
  menu_name_lo = EXCLUDED.menu_name_lo,
  domain = EXCLUDED.domain,
  parent_code = EXCLUDED.parent_code,
  sort_order = EXCLUDED.sort_order,
  icon = EXCLUDED.icon,
  route = EXCLUDED.route;

${upserts ? `
WITH desired(role_code, menu_code, perm_codes) AS (
  VALUES
        ${upserts}
)
INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
SELECT r.role_id, m.menu_id, desired.perm_codes
FROM desired
JOIN sys_role r ON r.role_code = desired.role_code
JOIN sys_menu m ON m.menu_code = desired.menu_code
ON CONFLICT (role_id, menu_id) DO UPDATE SET
  perm_codes = EXCLUDED.perm_codes;
` : ''}

DELETE FROM sys_role_menu_permission p
USING sys_role r, sys_menu m
WHERE p.role_id = r.role_id
  AND p.menu_id = m.menu_id
  AND r.role_code <> ALL(${adminRoles})
  AND m.menu_code = ANY(${coarseMenus});

COMMIT;
`;

  return runPsql(sql);
}

function writeReports(result) {
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = join(outputDir, 'role-permission-matrix-repair-latest.json');
  const mdPath = join(outputDir, 'role-permission-matrix-repair-latest.md');
  writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`);

  const lines = [
    '# Role Permission Matrix Repair Plan',
    '',
    `Generated at: ${result.generated_at}`,
    `Mode: ${result.mode}`,
    `Database: ${result.db.database}`,
    `User: ${result.db.user}`,
    `Decision: ${result.decision}`,
    '',
    '## Boundary',
    '',
    '- Atomic menu insertion/update is limited to finance, procurement, master-data, workflow, and settings permission menu codes listed in the script.',
    '- Non-admin coarse parent grants are removed only after atomic replacements are upserted.',
    '- `ROLE_ADMIN` coarse grants are preserved.',
    '- No migration command, deploy command, push, cleanup, or reset is executed by this script.',
    '',
    '## Summary',
    '',
    `- Menu rows to insert/update: ${result.plan.menu_inserts.length}`,
    `- Atomic grant upserts: ${result.plan.grant_upserts.length}`,
    `- Coarse non-admin grants to remove: ${result.plan.coarse_deletes.length}`,
    `- DB writes executed: ${result.writes_executed ? 'yes' : 'no'}`,
    '',
    '## Coarse Grants To Remove',
    '',
    '| role_code | role_name | coarse_menu | perm_codes |',
    '|---|---|---|---|',
  ];
  for (const item of result.plan.coarse_deletes.slice(0, 120)) {
    lines.push(`| ${item.role_code} | ${item.role_name} | ${item.menu_code} | ${item.perm_codes || '-'} |`);
  }
  if (result.plan.coarse_deletes.length > 120) {
    lines.push(`| ... | ... | ${result.plan.coarse_deletes.length - 120} more | ... |`);
  }
  lines.push('', '## Atomic Grant Upserts', '', '| role_code | source_menu | target_menu | final_perm_codes |', '|---|---|---|---|');
  for (const item of result.plan.grant_upserts.slice(0, 160)) {
    lines.push(`| ${item.role_code} | ${item.source_menu} | ${item.target_menu} | ${item.final_perm_codes} |`);
  }
  if (result.plan.grant_upserts.length > 160) {
    lines.push(`| ... | ... | ${result.plan.grant_upserts.length - 160} more | ... |`);
  }
  if (result.error) {
    lines.push('', '## Error', '', '```text', result.error, '```');
  }
  writeFileSync(mdPath, `${lines.join('\n')}\n`);
  return { jsonPath, mdPath };
}

let result;
try {
  const state = loadCurrentState();
  const plan = buildPlan(state);
  result = {
    generated_at: new Date().toISOString(),
    mode: dryRun ? 'dry-run' : 'apply',
    db: {
      database: process.env.PGDATABASE || 'phoenix_erp',
      user: process.env.PGUSER || 'mac',
    },
    decision: dryRun ? 'DRY_RUN_READY' : 'APPLIED',
    plan,
    writes_executed: false,
    migration_executed: false,
    deploy_executed: false,
    push_executed: false,
  };

  if (apply) {
    applyPlan(plan);
    result.writes_executed = true;
  }
} catch (error) {
  result = {
    generated_at: new Date().toISOString(),
    mode: dryRun ? 'dry-run' : 'apply',
    db: {
      database: process.env.PGDATABASE || 'phoenix_erp',
      user: process.env.PGUSER || 'mac',
    },
    decision: 'HOLD',
    plan: { menu_inserts: [], grant_upserts: [], coarse_deletes: [] },
    writes_executed: false,
    migration_executed: false,
    deploy_executed: false,
    push_executed: false,
    error: String(error?.stderr || error?.message || error),
  };
  process.exitCode = 2;
}

const paths = writeReports(result);
console.log(`role-permission-matrix-repair: ${result.decision}`);
console.log(`menu inserts: ${result.plan.menu_inserts.length}`);
console.log(`grant upserts: ${result.plan.grant_upserts.length}`);
console.log(`coarse deletes: ${result.plan.coarse_deletes.length}`);
console.log(`writes executed: ${result.writes_executed ? 'yes' : 'no'}`);
console.log(`json: ${paths.jsonPath}`);
console.log(`md: ${paths.mdPath}`);
