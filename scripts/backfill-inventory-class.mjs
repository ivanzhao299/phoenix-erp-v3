#!/usr/bin/env node
/**
 * Inventory-class audit/backfill for the approved eight-grade model.
 *
 * The TypeORM migration is schema-only. Run this controlled script with an
 * explicit DATABASE_URL after reviewing --audit/--dry-run output.
 */
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export const DEFECT_GRADES = ['DIRTY', 'BROKEN'];
export const LIVE_GRADES = [
  'GRADE_0', 'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5',
  'DIRTY', 'BROKEN',
];

export function databaseConfig(env) {
  if (env.DATABASE_URL?.trim()) return { connectionString: env.DATABASE_URL };
  const required = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
  const missing = required.filter(key => typeof env[key] !== 'string' || !env[key].trim());
  if (missing.length) throw new Error(`必须显式设置 DATABASE_URL 或完整 DB_*；缺少 ${missing.join(', ')}`);
  return {
    host: env.DB_HOST,
    port: Number(env.DB_PORT),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  };
}

export async function readAudit(client) {
  const result = await client.query(`
    SELECT
      COUNT(*)::int AS total_batches,
      COUNT(*) FILTER (WHERE UPPER(COALESCE(NULLIF(BTRIM(grade_code_std), ''), NULLIF(BTRIM(quality_grade), ''), '')) = ANY($1))::int AS defect_grade_batches,
      COUNT(*) FILTER (
        WHERE NULLIF(BTRIM(grade_code_std), '') IS NOT NULL
          AND NULLIF(BTRIM(quality_grade), '') IS NOT NULL
          AND UPPER(BTRIM(grade_code_std)) <> UPPER(BTRIM(quality_grade))
      )::int AS grade_conflicts,
      COUNT(*) FILTER (
        WHERE (NULLIF(BTRIM(grade_code_std), '') IS NOT NULL
               AND NOT (UPPER(BTRIM(grade_code_std)) = ANY($2)))
           OR (NULLIF(BTRIM(quality_grade), '') IS NOT NULL
               AND NOT (UPPER(BTRIM(quality_grade)) = ANY($2)))
      )::int AS unknown_grade_batches,
      COUNT(*) FILTER (WHERE UPPER(COALESCE(NULLIF(BTRIM(grade_code_std), ''), NULLIF(BTRIM(quality_grade), ''), '')) = ANY($1)
                        AND inventory_class <> 'DEFECT_SALE')::int AS defect_mismatches,
      COUNT(*) FILTER (WHERE UPPER(COALESCE(NULLIF(BTRIM(grade_code_std), ''), NULLIF(BTRIM(quality_grade), ''), '')) <> ALL($2)
                        AND inventory_class <> 'STANDARD')::int AS standard_mismatches,
      COUNT(*) FILTER (WHERE inventory_class IS NULL)::int AS null_classes,
      COUNT(*) FILTER (WHERE inventory_class NOT IN ('STANDARD', 'DEFECT_SALE'))::int AS invalid_classes
    FROM inv_batches
  `, [DEFECT_GRADES, LIVE_GRADES]);
  return result.rows[0] ?? {};
}

export async function applyBackfill(client, { dryRun = false, log = console.log } = {}) {
  await client.query('BEGIN');
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('inventory-class-backfill'))");
    const audit = await readAudit(client);
    if (Number(audit.null_classes) > 0 || Number(audit.invalid_classes) > 0
      || Number(audit.grade_conflicts) > 0 || Number(audit.unknown_grade_batches) > 0) {
      throw new Error('存在库存分类为空/非法、等级字段冲突或未知等级，先完成数据审计后再执行回填');
    }
    await client.query(`
      UPDATE inv_batches
         SET inventory_class = CASE
           WHEN UPPER(COALESCE(NULLIF(BTRIM(grade_code_std), ''), NULLIF(BTRIM(quality_grade), ''), '')) = ANY($1)
             THEN 'DEFECT_SALE'
           ELSE 'STANDARD'
         END,
             updated_at = NOW()
       WHERE inventory_class IS DISTINCT FROM CASE
         WHEN UPPER(COALESCE(NULLIF(BTRIM(grade_code_std), ''), NULLIF(BTRIM(quality_grade), ''), '')) = ANY($1)
           THEN 'DEFECT_SALE'
         ELSE 'STANDARD'
       END
    `, [DEFECT_GRADES]);
    await client.query(dryRun ? 'ROLLBACK' : 'COMMIT');
    log(dryRun ? '[dry-run] inventory_class 回填已校验并回滚' : '[apply] inventory_class 回填已提交');
    return { ...audit, applied: !dryRun };
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
  const here = path.dirname(fileURLToPath(import.meta.url));
  const require = createRequire(path.join(here, '..', 'apps', 'api', 'package.json'));
  const { Client } = require('pg');
  const client = new Client(databaseConfig(process.env));
  try {
    await client.connect();
    if (args[0] === '--audit') console.log(JSON.stringify(await readAudit(client), null, 2));
    else console.log(JSON.stringify(await applyBackfill(client, { dryRun: args[0] === '--dry-run' }), null, 2));
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`[inventory-class] 失败：${error.message}`); process.exitCode = 1; });
}
