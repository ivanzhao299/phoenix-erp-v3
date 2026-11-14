#!/usr/bin/env node
/**
 * Issue #532 grade policy seed/audit — 8 档制终态（业务裁定 2026-11-14）。
 *
 * 现行等级体系 = GRADE_0..5（可售 6 档）+ DIRTY + BROKEN（缺陷 2 档），共 8 档。
 * 历史"9 档/九档/nine-grade"是 G67 时代（5 可售 + 4 缺陷）的计数残留，数量与
 * 成员均已失真，不得作为数据参考。CRACKED/DAMAGED 已由迁移
 * FreezeRetiredEggGrades1794500000000 永久退役（DB 触发器拒绝任何复活写法）。
 *
 * The TypeORM migration is schema-only. This controlled script applies the
 * reviewed eight-grade policy and reports SKU/company scope readiness. It never
 * invents companies or grants an organisation scope; those rows require an
 * explicit company approval and a separate manifest.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/seed-grade-inventory-policy.mjs --audit
 *   DATABASE_URL=... node scripts/seed-grade-inventory-policy.mjs --dry-run
 *   DATABASE_URL=... node scripts/seed-grade-inventory-policy.mjs --apply
 */
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

/** 已永久退役、禁止再进入策略/展示的等级码（硬防线在 DB 触发器，此处为审计口径）。 */
export const RETIRED_GRADES = ['CRACKED', 'DAMAGED'];

export const GRADE_POLICY = [
  { grade_code: 'GRADE_0', stock_managed: true, sale_enabled: true, default_stock_status: 'AVAILABLE', sort_order: 5 },
  ...[1, 2, 3, 4, 5].map(n => ({
    grade_code: `GRADE_${n}`, stock_managed: true, sale_enabled: true,
    default_stock_status: 'AVAILABLE', sort_order: (n + 1) * 10,
  })),
  { grade_code: 'DIRTY', stock_managed: true, sale_enabled: false, default_stock_status: 'QUARANTINE', sort_order: 60 },
  { grade_code: 'BROKEN', stock_managed: true, sale_enabled: false, default_stock_status: 'DAMAGED', sort_order: 80 },
];

export function databaseConfig(env) {
  if (env.DATABASE_URL?.trim()) return { connectionString: env.DATABASE_URL };
  const required = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
  const missing = required.filter(key => typeof env[key] !== 'string' || !env[key].trim());
  if (missing.length) throw new Error(`必须显式设置 DATABASE_URL 或完整 DB_*；缺少 ${missing.join(', ')}`);
  const port = Number(env.DB_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('DB_PORT 必须是有效端口');
  return { host: env.DB_HOST, port, user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME };
}

export async function readReadiness(client) {
  const grades = await client.query(`
    SELECT grade_code, stock_managed, sale_enabled, default_stock_status
      FROM product_grades WHERE grade_code = ANY($1) ORDER BY sort_order, grade_code`,
  [GRADE_POLICY.map(row => row.grade_code)]);
  const expected = new Map(GRADE_POLICY.map(row => [row.grade_code, row]));
  const mismatches = grades.rows.filter(row => {
    const want = expected.get(row.grade_code);
    return !want || row.stock_managed !== want.stock_managed
      || row.sale_enabled !== want.sale_enabled || row.default_stock_status !== want.default_stock_status;
  }).map(row => row.grade_code);
  const missingGrades = GRADE_POLICY.map(row => row.grade_code).filter(code => !grades.rows.some(row => row.grade_code === code));
  // 退役等级复活检测：CRACKED/DAMAGED 若仍 ACTIVE（迁移未跑/被绕过）→ fail-closed。
  const retired = await client.query(
    `SELECT grade_code, status FROM product_grades WHERE grade_code = ANY($1) AND status = 'ACTIVE'`,
    [RETIRED_GRADES],
  );
  const retiredGradeActive = retired.rows.map(row => row.grade_code);
  const skuScope = await client.query(`
    SELECT COUNT(*)::int AS active_skus,
           COUNT(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM md_sku_org_scope os
              WHERE os.sku_code = s.sku_code AND os.scope_type = 'COMPANY'
                AND os.status = 'ACTIVE' AND os.stock_enabled = true
           ))::int AS stock_scoped_skus,
           COUNT(*) FILTER (WHERE g.sale_enabled = true AND EXISTS (
             SELECT 1 FROM md_sku_org_scope os
              WHERE os.sku_code = s.sku_code AND os.scope_type = 'COMPANY'
                AND os.status = 'ACTIVE' AND os.sale_enabled = true
           ))::int AS sale_scoped_saleable_skus
      FROM product_skus s JOIN product_grades g ON g.grade_code = s.grade_code
     WHERE s.status = 'ACTIVE' AND s.grade_code = ANY($1)`,
  [GRADE_POLICY.map(row => row.grade_code)]);
  return {
    missingGrades,
    mismatches,
    retiredGradeActive,
    skuScope: skuScope.rows[0] ?? { active_skus: 0, stock_scoped_skus: 0, sale_scoped_saleable_skus: 0 },
  };
}

export async function applyPolicy(client, { dryRun = false, log = console.log } = {}) {
  await client.query('BEGIN');
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('issue-532-grade-inventory-policy'))");
    const readiness = await readReadiness(client);
    if (readiness.missingGrades.length) throw new Error(`缺少八档等级：${readiness.missingGrades.join(', ')}`);
    if (readiness.retiredGradeActive.length) {
      throw new Error(`退役等级仍为 ACTIVE：${readiness.retiredGradeActive.join(', ')}（先执行迁移 FreezeRetiredEggGrades1794500000000，DB 触发器会拒绝本脚本复活它们）`);
    }
    for (const row of GRADE_POLICY) {
      await client.query(`
        UPDATE product_grades
           SET stock_managed = $1, sale_enabled = $2, default_stock_status = $3,
               is_storable = $1, is_saleable = $2, sort_order = $4, updated_at = NOW()
         WHERE grade_code = $5`,
      [row.stock_managed, row.sale_enabled, row.default_stock_status, row.sort_order, row.grade_code]);
    }
    await client.query(dryRun ? 'ROLLBACK' : 'COMMIT');
    log(dryRun ? '[dry-run] 八档库存策略已校验并回滚' : '[apply] 八档库存策略已提交');
    return { ...readiness, applied: !dryRun };
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
    else console.log(JSON.stringify(await applyPolicy(client, { dryRun: args[0] === '--dry-run' }), null, 2));
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`[issue-532] 失败：${error.message}`); process.exitCode = 1; });
}
