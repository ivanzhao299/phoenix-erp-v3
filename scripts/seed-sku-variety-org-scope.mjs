#!/usr/bin/env node
/**
 * SKU 壳色目录准备（不启用、不授权、不回填历史）。
 * 前置：SkuVarietyOrgScope 结构迁移已由受控流程执行；本脚本不补 DDL。
 * 用法：DATABASE_URL=postgres://... node scripts/seed-sku-variety-org-scope.mjs [--dry-run]
 * 或显式提供全部 DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME。
 * --dry-run 真实执行目录 INSERT 后仅 ROLLBACK，不 COMMIT；不是离线预览。
 *
 * 当前仅准备 DRAFT 目录。组织分配/品种映射/激活尚未实现：须另行审核含
 * companyCode、varietyCode、breedCode、sku（或 spec）的 manifest 后独立 apply。
 * 不推断白壳/本地鸡的商业壳色；不写 md_variety_breeds / md_sku_org_scope。
 * GRADE_0 保留标识，附件未确认重量边界，weight_range 保持 NULL。
 * 已有目录只对账不改写；含引用的历史 SKU 和旧 grade-in-product 均不自动迁移。
 */
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const SPECS = [
  ['LOOSE', '散装'], ['TRAY30', '30枚/托'], ['TRAY36', '36枚/托'],
  ['BOX360', '360枚/箱'], ['BOX720', '720枚/箱'], ['GIFT12', '礼盒装 12枚'], ['GIFT24', '礼盒装 24枚'],
];
const GRADES = [
  ['0', 'GRADE_0', '0号蛋'], ['1', 'GRADE_1', '1号蛋'], ['2', 'GRADE_2', '2号蛋'],
  ['3', 'GRADE_3', '3号蛋'], ['4', 'GRADE_4', '4号蛋'], ['5', 'GRADE_5', '5号蛋'],
];
const VARIETIES = [
  ['EGG_RED', '红壳蛋', 'Red Shell Egg', 'RED', 'R'],
  ['EGG_PINK', '粉壳蛋', 'Pink Shell Egg', 'PINK', 'P'],
];
export const CONFIGURATION_NOTICE = '[catalog-only] 配置缺失：尚无已审核的 companyCode/varietyCode/breedCode/sku（或 spec）manifest 及独立 apply。仅准备 DRAFT 目录；不激活、不分配组织、不建立品种映射、不回填鸡群。GRADE_0 重量边界待附件确认。';

export function databaseConfig(env) {
  if (env.DATABASE_URL?.trim()) return { connectionString: env.DATABASE_URL };
  const required = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
  const missing = required.filter(key => typeof env[key] !== 'string' || !env[key].trim());
  if (missing.length) throw new Error(`必须显式设置 DATABASE_URL 或完整 DB_*；缺少 ${missing.join(', ')}`);
  const port = Number(env.DB_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('DB_PORT 必须是有效端口');
  return { host: env.DB_HOST, port, user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME };
}

export function buildCatalog() {
  const varieties = VARIETIES.map(([variety_code, variety_name, variety_name_en, shell_color]) => ({
    variety_code, variety_name, variety_name_en, shell_color, status: 'DRAFT',
  }));
  // 产品身份仅为壳色；等级/规格只在 SKU 上，不再新增 PRD-EGG-RED-0..5 等产品。
  const products = VARIETIES.map(([variety_code, product_name, , shell]) => ({
    product_code: `PRD-EGG-${shell}`, product_name, product_name_zh: product_name,
    unit_zh: '枚', category_code: 'EGG', has_grade: true, has_spec: true, status: 'DRAFT', variety_code,
  }));
  const skus = VARIETIES.flatMap(([variety_code, name, , shell, letter]) => GRADES.flatMap(([num, grade_code, gradeName]) =>
    SPECS.map(([spec_code, specName]) => ({
      sku_code: `SKU-${letter}-${num}-${spec_code}`, product_code: `PRD-EGG-${shell}`,
      product_name: name, grade_code, spec_code, sku_name: `${name} ${gradeName} ${specName}`, status: 'DRAFT', variety_code,
    })),
  ));
  return {
    grades: [{ grade_code: 'GRADE_0', grade_name: '0号蛋', grade_name_lo: 'ໄຂ່ຊັ້ນ 0', weight_range: null,
      sort_order: 5, is_saleable: false, is_storable: false, status: 'DRAFT' }],
    varieties, products, skus,
  };
}

export function assertCompatible(existing, desired, label) {
  if (!existing) return;
  const differences = Object.keys(desired).filter(key => existing[key] !== desired[key]);
  if (differences.length) throw new Error(`目录冲突 ${label}：${differences.join(', ')}；保留历史，需独立人工审核，不覆写`);
}

// 表/列名完全来自本模块固定计划；所有数据使用参数，不接受外部 SQL 标识符。
async function insertUnchanged(client, table, key, desired) {
  const columns = Object.keys(desired);
  const old = await client.query(`SELECT ${columns.join(', ')} FROM ${table} WHERE ${key} = $1 FOR UPDATE`, [desired[key]]);
  assertCompatible(old.rows[0], desired, `${table}/${desired[key]}`);
  if (old.rows.length) return 0;
  const result = await client.query(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
    Object.values(desired),
  );
  return result.rowCount ?? 0;
}

export async function prepareCatalog(client, { dryRun = false, log = console.log } = {}) {
  log(CONFIGURATION_NOTICE);
  const catalog = buildCatalog();
  let inTransaction = false;
  try {
    await client.query('BEGIN');
    inTransaction = true;
    // 串行目录准备；并发写入仍由数据库唯一约束保护，冲突即整体回滚。
    await client.query("SELECT pg_advisory_xact_lock(hashtext('seed-sku-variety-org-scope'))");
    const legacy = await client.query(`
      SELECT product_code FROM mst_products
       WHERE (variety_code IN ('EGG_RED', 'EGG_PINK')
          AND product_code NOT IN ('PRD-EGG-RED', 'PRD-EGG-PINK'))
          OR product_code ~ '^PRD-EGG-(RED|PINK)-[0-9]+$'
    `);
    if (legacy.rows.length) throw new Error(`目录冲突：已有按等级拆分或非标准壳色产品 ${legacy.rows.map(r => r.product_code).join(', ')}；不迁移、不覆写历史/被引用 SKU`);
    // 只读检查依赖；缺表/缺列/缺等级/缺规格必须失败，不捕获 missing-table 后继续事务。
    const grades = await client.query('SELECT grade_code FROM product_grades WHERE grade_code = ANY($1)', [GRADES.slice(1).map(g => g[1])]);
    const specs = await client.query('SELECT spec_code FROM packaging_specs WHERE spec_code = ANY($1)', [SPECS.map(s => s[0])]);
    const missing = [
      ...GRADES.slice(1).filter(g => !grades.rows.some(r => r.grade_code === g[1])).map(g => g[1]),
      ...SPECS.filter(s => !specs.rows.some(r => r.spec_code === s[0])).map(s => s[0]),
    ];
    if (missing.length) throw new Error(`目录依赖缺失：${missing.join(', ')}；请通过独立审核流程准备`);
    let inserted = 0;
    for (const [table, key, rows] of [
      ['product_grades', 'grade_code', catalog.grades],
      ['md_product_varieties', 'variety_code', catalog.varieties],
      ['mst_products', 'product_code', catalog.products],
      ['product_skus', 'sku_code', catalog.skus],
    ]) {
      for (const row of rows) inserted += await insertUnchanged(client, table, key, row);
    }
    await client.query(dryRun ? 'ROLLBACK' : 'COMMIT');
    inTransaction = false;
    log(dryRun ? `[dry-run] 目录拟新增 ${inserted} 行，已 ROLLBACK（未启用）` : `[catalog-only] 新增 ${inserted} 行 DRAFT 目录（未启用）`);
    return inserted;
  } catch (error) {
    if (inTransaction) await client.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--dry-run')) throw new Error('仅支持 [--dry-run]；本脚本不支持 manifest apply/启用/组织授权');
  // 先验证显式连接配置；import 本模块及纯测试不会加载 pg 或连接数据库。
  const cfg = databaseConfig(process.env);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const require = createRequire(path.join(here, '..', 'apps', 'api', 'package.json'));
  const { Client } = require('pg');
  const client = new Client(cfg);
  try {
    await client.connect();
    await prepareCatalog(client, { dryRun: args.includes('--dry-run') });
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error('[catalog-only] 失败（停止执行，未启用）：', error.message);
    process.exitCode = 1;
  });
}
