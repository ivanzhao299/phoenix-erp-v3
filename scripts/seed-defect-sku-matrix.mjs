#!/usr/bin/env node
/**
 * Defect-grade SKU matrix seed/audit (issue #532 follow-up; 8 档制终态 2026-11-14).
 *
 * 日产蛋入库 / 包装缺陷入库对每一档都强制走 SkuAvailabilityService.resolve()，
 * 而已审批的 sku-two-company-source-activation 目录只建了 GRADE_0..5 的 SKU，
 * 缺陷档一个 SKU 都没有 → 缺陷蛋无法入库。本脚本按同一目录惯例补齐缺陷档
 * LOOSE 规格 SKU 矩阵（破损蛋不装托盘，仅散装）。
 *
 * 8 档制终态（业务裁定 2026-11-14）：缺陷档只有 脏蛋 DIRTY + 破损蛋 BROKEN 两档；
 * CRACKED/DAMAGED 已由迁移 FreezeRetiredEggGrades1794500000000 永久退役
 * （DB 触发器拒绝复活），本脚本同时审计其残留 SKU 是否已随之废弃。
 *
 *   普通线 PRD-EGG-0   (variety NULL)   → COMP-LAO-AGRI    SKU-0-{grade}-LOOSE
 *   红壳线 PRD-EGG-RED (EGG_RED)        → COMP-LAO-XINGCHI SKU-R-{grade}-LOOSE
 *   粉壳线 PRD-EGG-PINK(EGG_PINK)       → COMP-LAO-XINGCHI SKU-P-{grade}-LOOSE
 *
 * 每个 SKU 配 md_sku_org_scope COMPANY 行：stock_enabled=true / sale_enabled=false
 * （缺陷档只进受控库存，销售 FIFO 的 saleGradeCondition 天然隔离）。
 * 前置依赖 scripts/seed-grade-inventory-policy.mjs --apply（缺陷档 stock_managed=true）。
 *
 * Usage:
 *   DATABASE_URL=... node scripts/seed-defect-sku-matrix.mjs --audit
 *   DATABASE_URL=... node scripts/seed-defect-sku-matrix.mjs --dry-run
 *   DATABASE_URL=... node scripts/seed-defect-sku-matrix.mjs --apply
 */
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export const DEFECT_GRADES = [
  { grade_code: 'DIRTY', grade_name: '脏蛋', default_stock_status: 'QUARANTINE' },
  { grade_code: 'BROKEN', grade_name: '破损蛋', default_stock_status: 'DAMAGED' },
];

/** 已永久退役的缺陷档码：其 SKU 若仍 ACTIVE 视为冲突（应已随冻结迁移废弃）。 */
export const RETIRED_DEFECT_GRADES = ['CRACKED', 'DAMAGED'];

/** 与 sku-two-company-source-activation 的产品线/scope 惯例一一对应。 */
export const DEFECT_LINES = [
  { prefix: '0', product_code: 'PRD-EGG-0', variety_code: null, company_code: 'COMP-LAO-AGRI', line_label: '普通' },
  { prefix: 'R', product_code: 'PRD-EGG-RED', variety_code: 'EGG_RED', company_code: 'COMP-LAO-XINGCHI', line_label: '红壳' },
  { prefix: 'P', product_code: 'PRD-EGG-PINK', variety_code: 'EGG_PINK', company_code: 'COMP-LAO-XINGCHI', line_label: '粉壳' },
];

export const DEFECT_SPEC_CODE = 'LOOSE';

/** 6 个期望 SKU 的完整定义（不含运行时校验信息）。 */
export function defectSkuMatrix() {
  return DEFECT_LINES.flatMap(line => DEFECT_GRADES.map(grade => ({
    sku_code: `SKU-${line.prefix}-${grade.grade_code}-${DEFECT_SPEC_CODE}`,
    product_code: line.product_code,
    grade_code: grade.grade_code,
    spec_code: DEFECT_SPEC_CODE,
    variety_code: line.variety_code,
    sku_name: `${grade.grade_name}(${line.line_label}) ${DEFECT_SPEC_CODE}`,
    status: 'ACTIVE',
    org_context_required: true,
    scope: { scope_type: 'COMPANY', scope_code: line.company_code, sale_enabled: false, stock_enabled: true, status: 'ACTIVE' },
  })));
}

export function databaseConfig(env) {
  if (env.DATABASE_URL?.trim()) return { connectionString: env.DATABASE_URL };
  const required = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
  const missing = required.filter(key => typeof env[key] !== 'string' || !env[key].trim());
  if (missing.length) throw new Error(`必须显式设置 DATABASE_URL 或完整 DB_*；缺少 ${missing.join(', ')}`);
  const port = Number(env.DB_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('DB_PORT 必须是有效端口');
  return { host: env.DB_HOST, port, user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME };
}

function skuIdentityMatches(existing, desired) {
  return existing.product_code === desired.product_code
    && existing.grade_code === desired.grade_code
    && existing.spec_code === desired.spec_code
    && existing.status === 'ACTIVE'
    && existing.org_context_required === true
    && (existing.variety_code ?? null) === desired.variety_code;
}

export async function readReadiness(client) {
  const desired = defectSkuMatrix();
  const missingPrerequisites = [];
  const productRows = await client.query(
    `SELECT product_code, product_name, status, variety_code FROM mst_products WHERE product_code = ANY($1)`,
    [DEFECT_LINES.map(line => line.product_code)],
  );
  for (const line of DEFECT_LINES) {
    const rows = productRows.rows.filter(row => row.product_code === line.product_code);
    if (rows.length !== 1 || rows[0].status !== 'ACTIVE' || (rows[0].variety_code ?? null) !== line.variety_code) {
      missingPrerequisites.push(`产品 ${line.product_code} 不存在、未启用或品种与 ${line.variety_code ?? 'STANDARD'} 不一致`);
    }
  }
  const gradeRows = await client.query(
    `SELECT grade_code, status, COALESCE(stock_managed, is_storable) AS stock_managed
       FROM product_grades WHERE grade_code = ANY($1)`,
    [DEFECT_GRADES.map(row => row.grade_code)],
  );
  for (const grade of DEFECT_GRADES) {
    const row = gradeRows.rows.find(candidate => candidate.grade_code === grade.grade_code);
    if (!row || row.status !== 'ACTIVE' || row.stock_managed !== true) {
      missingPrerequisites.push(`等级 ${grade.grade_code} 缺失、未启用或未纳入库存管理（请先运行 scripts/seed-grade-inventory-policy.mjs --apply）`);
    }
  }
  const specRows = await client.query(
    `SELECT spec_code, status FROM packaging_specs WHERE spec_code = $1`, [DEFECT_SPEC_CODE],
  );
  if (specRows.rows.length !== 1 || specRows.rows[0].status !== 'ACTIVE') {
    missingPrerequisites.push(`包装规格 ${DEFECT_SPEC_CODE} 不存在或未启用`);
  }
  const companyRows = await client.query(
    `SELECT COALESCE(company_code, org_code) AS company_code FROM sys_organizations
      WHERE org_type = 'COMPANY' AND status = 'ACTIVE' AND COALESCE(company_code, org_code) = ANY($1)`,
    [DEFECT_LINES.map(line => line.company_code)],
  );
  for (const line of DEFECT_LINES) {
    if (!companyRows.rows.some(row => row.company_code === line.company_code)) {
      missingPrerequisites.push(`公司 ${line.company_code} 不存在或未启用，无法授予 SKU 适用范围`);
    }
  }
  const skuRows = await client.query(
    `SELECT * FROM product_skus WHERE sku_code = ANY($1)`,
    [desired.map(row => row.sku_code)],
  );
  const scopeRows = await client.query(
    `SELECT * FROM md_sku_org_scope WHERE sku_code = ANY($1)`,
    [desired.map(row => row.sku_code)],
  );
  const skus = desired.map(row => {
    const existing = skuRows.rows.filter(candidate => candidate.sku_code === row.sku_code);
    if (existing.length === 0) return { ...row, state: 'MISSING' };
    if (existing.length > 1 || !skuIdentityMatches(existing[0], row)) {
      return { ...row, state: 'CONFLICT', detail: 'SKU 已存在但身份与期望不一致，拒绝改写，需人工评审' };
    }
    const scopes = scopeRows.rows.filter(candidate => candidate.sku_code === row.sku_code);
    const expectedScope = scopes.find(candidate => candidate.scope_type === 'COMPANY'
      && candidate.scope_code === row.scope.scope_code
      && candidate.status === 'ACTIVE' && candidate.stock_enabled === true && candidate.sale_enabled === false);
    const extraScopes = scopes.filter(candidate => candidate !== expectedScope);
    if (!expectedScope) {
      return { ...row, state: 'CONFLICT', detail: `缺少预期的 COMPANY/${row.scope.scope_code} 库存范围行` };
    }
    if (extraScopes.length > 0) {
      return { ...row, state: 'CONFLICT', detail: `存在 ${extraScopes.length} 条额外范围行，需人工评审` };
    }
    return { ...row, state: 'READY' };
  });
  const retiredConflicts = await retiredSkuConflicts(client);
  return {
    missingPrerequisites,
    skus,
    ready: missingPrerequisites.length === 0 && skus.every(row => row.state === 'READY') && retiredConflicts.length === 0,
    missing: skus.filter(row => row.state === 'MISSING').length,
    conflicts: skus.filter(row => row.state === 'CONFLICT').map(row => ({ sku_code: row.sku_code, detail: row.detail })),
    retiredSkuConflicts: retiredConflicts,
  };
}

/** 退役缺陷档(CRACKED/DAMAGED)的 SKU 若仍 ACTIVE → 冲突(应已随冻结迁移废弃)。 */
async function retiredSkuConflicts(client) {
  const rows = await client.query(
    `SELECT sku_code FROM product_skus WHERE grade_code = ANY($1) AND status = 'ACTIVE' ORDER BY sku_code`,
    [RETIRED_DEFECT_GRADES],
  );
  return rows.rows.map(row => ({
    sku_code: row.sku_code,
    detail: '退役等级(CRACKED/DAMAGED)的 SKU 仍为 ACTIVE，应随迁移 FreezeRetiredEggGrades1794500000000 废弃',
  }));
}

export async function applyMatrix(client, { dryRun = false, log = console.log } = {}) {
  await client.query('BEGIN');
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('defect-sku-matrix-seed'))");
    const readiness = await readReadiness(client);
    if (readiness.missingPrerequisites.length) throw new Error(`前置条件不满足：${readiness.missingPrerequisites.join('；')}`);
    if (readiness.conflicts.length) {
      throw new Error(`SKU 冲突，拒绝改写既有目录：${readiness.conflicts.map(row => `${row.sku_code}（${row.detail}）`).join('；')}`);
    }
    if (readiness.retiredSkuConflicts.length) {
      throw new Error(`退役等级 SKU 冲突：${readiness.retiredSkuConflicts.map(row => `${row.sku_code}（${row.detail}）`).join('；')}`);
    }
    const parents = await client.query(
      `SELECT product_code, COALESCE(NULLIF(product_name_zh, ''), product_name) AS product_name
         FROM mst_products WHERE product_code = ANY($1)`,
      [DEFECT_LINES.map(line => line.product_code)],
    );
    const parentName = new Map(parents.rows.map(row => [row.product_code, row.product_name]));
    let insertedSkus = 0;
    let insertedScopes = 0;
    for (const row of readiness.skus) {
      if (row.state !== 'MISSING') continue;
      const skuResult = await client.query(
        `INSERT INTO product_skus (sku_code, product_code, product_name, grade_code, spec_code, variety_code, sku_name, status, org_context_required)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'ACTIVE',true)`,
        [row.sku_code, row.product_code, parentName.get(row.product_code) ?? '', row.grade_code, row.spec_code, row.variety_code, row.sku_name],
      );
      if (skuResult.rowCount !== 1) throw new Error(`INSERT_NOT_ACKNOWLEDGED:product_skus/${row.sku_code}`);
      insertedSkus++;
      const scopeResult = await client.query(
        `INSERT INTO md_sku_org_scope (sku_code, scope_type, scope_code, sale_enabled, stock_enabled, status, effective_date, expire_date)
         VALUES ($1,'COMPANY',$2,false,true,'ACTIVE',NULL,NULL)`,
        [row.sku_code, row.scope.scope_code],
      );
      if (scopeResult.rowCount !== 1) throw new Error(`INSERT_NOT_ACKNOWLEDGED:md_sku_org_scope/${row.sku_code}`);
      insertedScopes++;
    }
    await client.query(dryRun ? 'ROLLBACK' : 'COMMIT');
    log(dryRun ? '[dry-run] 缺陷档 SKU 矩阵已校验并回滚' : '[apply] 缺陷档 SKU 矩阵已提交');
    return { ...readiness, insertedSkus, insertedScopes, applied: !dryRun };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !['--audit', '--dry-run', '--apply'].includes(args[0])) {
    throw new Error('仅支持 --audit、--dry-run 或 --apply');
  }
  const cfg = databaseConfig(process.env);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const require = createRequire(path.join(here, '..', 'apps', 'api', 'package.json'));
  const { Client } = require('pg');
  const client = new Client(cfg);
  try {
    await client.connect();
    if (args[0] === '--audit') console.log(JSON.stringify(await readReadiness(client), null, 2));
    else console.log(JSON.stringify(await applyMatrix(client, { dryRun: args[0] === '--dry-run' }), null, 2));
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`[defect-sku-matrix] 失败：${error.message}`); process.exitCode = 1; });
}
