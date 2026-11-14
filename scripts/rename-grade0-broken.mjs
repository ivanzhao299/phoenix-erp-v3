#!/usr/bin/env node
/**
 * 蛋品等级显示名统一改名（2026-11-14 业务确认）：
 *   · GRADE_0 "0号特大蛋" → "0号蛋"（"特大"是线下口语，业务确认与 0 号蛋同物，不单独命名）
 *     同步: mst_products PRD-EGG-0 产品名、product_skus.sku_name 前缀（21 个 GRADE_0 SKU）
 *   · BROKEN "破蛋" → "破损蛋"（与日报列名/缺陷处置文案统一；历史基线 20260530 用的"破蛋"）
 *
 * 只改显示名，不动 grade_code / sku_code / product_code，历史数据与对账零风险。
 * 幂等：已是目标名的行不会被更新（WHERE 条件排除）。
 *
 * Usage:
 *   DATABASE_URL=... node scripts/rename-grade0-broken.mjs --audit
 *   DATABASE_URL=... node scripts/rename-grade0-broken.mjs --dry-run
 *   DATABASE_URL=... node scripts/rename-grade0-broken.mjs --apply
 */
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export const RENAMES = {
  grade0: { grade_code: 'GRADE_0', from: '0号特大蛋', to: '0号蛋' },
  broken: { grade_code: 'BROKEN', from: '破蛋', to: '破损蛋' },
  product: { product_code: 'PRD-EGG-0', from: '0号特大蛋', to: '0号蛋' },
};

export function databaseConfig(env) {
  if (env.DATABASE_URL?.trim()) return { connectionString: env.DATABASE_URL };
  const required = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
  const missing = required.filter(key => typeof env[key] !== 'string' || !env[key].trim());
  if (missing.length) throw new Error(`必须显式设置 DATABASE_URL 或完整 DB_*；缺少 ${missing.join(', ')}`);
  const port = Number(env.DB_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('DB_PORT 必须是有效端口');
  return { host: env.DB_HOST, port, user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME };
}

/** 只读审计：各改名维度的当前值分布与待更新行数。 */
export async function readReadiness(client) {
  const grades = await client.query(
    `SELECT grade_code, grade_name FROM product_grades WHERE grade_code = ANY($1)`,
    [[RENAMES.grade0, RENAMES.broken].map(row => row.grade_code)],
  );
  const products = await client.query(
    `SELECT product_code, product_name, product_name_zh FROM mst_products WHERE product_code = $1`,
    [RENAMES.product.product_code],
  );
  const skus = await client.query(
    `SELECT sku_code, sku_name FROM product_skus WHERE sku_name LIKE '%' || $1 || '%' ORDER BY sku_code`,
    [RENAMES.grade0.from],
  );
  return {
    grades: [RENAMES.grade0, RENAMES.broken].map(rename => {
      const row = grades.rows.find(candidate => candidate.grade_code === rename.grade_code);
      return { grade_code: rename.grade_code, current_name: row?.grade_name ?? null, target_name: rename.to,
        needsUpdate: row ? row.grade_name !== rename.to : false };
    }),
    product: products.rows.map(row => ({
      product_code: row.product_code,
      current_name: row.product_name,
      current_name_zh: row.product_name_zh,
      target_name: RENAMES.product.to,
      needsUpdate: row.product_name !== RENAMES.product.to || row.product_name_zh !== RENAMES.product.to,
    })),
    skus: { matchingLegacyName: skus.rows.length, sample: skus.rows.slice(0, 5) },
    ready: true,
  };
}

export async function applyRenames(client, { dryRun = false, log = console.log } = {}) {
  await client.query('BEGIN');
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('rename-grade0-broken'))");
    const updates = [];
    // 1) product_grades：GRADE_0 / BROKEN 显示名（当前值 ≠ 目标值才更新，幂等）
    for (const rename of [RENAMES.grade0, RENAMES.broken]) {
      const result = await client.query(
        `UPDATE product_grades SET grade_name = $1, updated_at = NOW() WHERE grade_code = $2 AND grade_name IS DISTINCT FROM $1`,
        [rename.to, rename.grade_code],
      );
      updates.push({ table: 'product_grades', key: rename.grade_code, rows: result.rowCount ?? 0 });
    }
    // 2) mst_products：PRD-EGG-0 产品名（中英双列任一不是目标值才更新）
    const productResult = await client.query(
      `UPDATE mst_products SET product_name = $1, product_name_zh = $1, updated_at = NOW()
        WHERE product_code = $2 AND (product_name IS DISTINCT FROM $1 OR product_name_zh IS DISTINCT FROM $1)`,
      [RENAMES.product.to, RENAMES.product.product_code],
    );
    updates.push({ table: 'mst_products', key: RENAMES.product.product_code, rows: productResult.rowCount ?? 0 });
    // 3) product_skus：sku_name 中 "0号特大蛋" → "0号蛋"（历史 21 个 GRADE_0 SKU）
    const skuResult = await client.query(
      `UPDATE product_skus SET sku_name = replace(sku_name, $1, $2), updated_at = NOW()
        WHERE sku_name LIKE '%' || $1 || '%'`,
      [RENAMES.grade0.from, RENAMES.grade0.to],
    );
    updates.push({ table: 'product_skus', key: `${RENAMES.grade0.from}→${RENAMES.grade0.to}`, rows: skuResult.rowCount ?? 0 });
    await client.query(dryRun ? 'ROLLBACK' : 'COMMIT');
    log(dryRun ? '[dry-run] 改名已校验并回滚' : '[apply] 改名已提交');
    return { updates, applied: !dryRun };
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
    else console.log(JSON.stringify(await applyRenames(client, { dryRun: args[0] === '--dry-run' }), null, 2));
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`[rename-grade0-broken] 失败：${error.message}`); process.exitCode = 1; });
}
