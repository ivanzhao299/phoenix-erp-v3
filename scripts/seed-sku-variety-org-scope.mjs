#!/usr/bin/env node
/**
 * SKU 多公司品种适配 · 阶段 0 数据种子脚本（幂等，可重复执行）
 * ════════════════════════════════════════════════════════════════════════
 * 依据：修正版方案一（审批决策 9/10/11）
 *   决策 9  → GRADE_0 特大档恢复为集团标准等级
 *   决策 10 → 只建「红壳蛋/粉壳蛋」两个变体，品种多对一映射
 *   决策 11 → 阶段 0+2+3 最小闭环
 *
 * 前置：1794400000000-SkuVarietyOrgScope.ts 迁移已执行（四张表 + 列已建）。
 *
 * 种子内容（全部 ON CONFLICT DO NOTHING / WHERE NOT EXISTS，幂等）：
 *   1. GRADE_0 特大蛋等级（≥66g，is_saleable=true, is_storable=true）
 *   2. 变体 EGG_RED 红壳蛋 / EGG_PINK 粉壳蛋
 *   3. 品种映射：褐壳系→EGG_RED，白壳/粉壳系→EGG_PINK，本地土鸡→EGG_RED
 *   4. 新产品 PRD-EGG-RED-0..5 / PRD-EGG-PINK-0..5（含 GRADE_0 档，共 12 个）
 *   5. 新 SKU：2 变体 × 6 等级 × 7 规格 = 84 个（SKU-R-{n}-{spec} / SKU-P-{n}-{spec}）
 *      + GRADE_0 补档到既有无变体产品线 PRD-EGG-0：SKU-0-LOOSE…BOX720（礼盒装不补，
 *        散装/托/箱 5 规格，保持与 G68 命名一致）
 *   6. scope 兜底：全部新 SKU 插入 scope_type='ALL' 行（集团共享初始态；
 *      后续由公司管理员在 scope 维护界面收窄）
 *   7. brd_flocks.breed_code 回填：strain 中文名 → BRD_BREED 码
 *
 * 明确不做：
 *   - 不归档 G68 既有 35 个 SKU（PRD-EGG-1..5 是"无变体"产品线，与红/粉壳并存；
 *     是否淘汰由阶段 4 销售切换时决策）
 *   - 不回填 product_skus.variety_code（既有 SKU 属无变体产品线，NULL 即语义）
 *
 * 用法：node scripts/seed-sku-variety-org-scope.mjs [--dry-run]
 * 环境变量：DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME（默认 localhost:5432/phoenix_erp）
 */
import pg from 'pg';

const dry = process.argv.includes('--dry-run');
const cfg = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'mac',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'phoenix_erp',
};

const SPECS = [
  ['LOOSE', '散装'], ['TRAY30', '30枚/托'], ['TRAY36', '36枚/托'],
  ['BOX360', '360枚/箱'], ['BOX720', '720枚/箱'], ['GIFT12', '礼盒装 12枚'], ['GIFT24', '礼盒装 24枚'],
];
const GRADES = [
  ['0', 'GRADE_0', '0号特大蛋', '≥66g'],
  ['1', 'GRADE_1', '1号蛋', '59-66g'],
  ['2', 'GRADE_2', '2号蛋', '53-59g'],
  ['3', 'GRADE_3', '3号蛋', '46-53g'],
  ['4', 'GRADE_4', '4号蛋', '40-46g'],
  ['5', 'GRADE_5', '5号蛋', '30-40g'],
];
const VARIETIES = [
  ['EGG_RED', '红壳蛋', 'Red Shell Egg', 'RED'],
  ['EGG_PINK', '粉壳蛋', 'Pink Shell Egg', 'PINK'],
];
const VARIETY_BREEDS = [
  ['EGG_RED', 'HY_LINE_BROWN'], ['EGG_RED', 'LOHMANN_BROWN'], ['EGG_RED', 'ISA_BROWN'], ['EGG_RED', 'LOCAL'],
  ['EGG_PINK', 'HY_LINE_WHITE'], ['EGG_PINK', 'LOHMANN_WHITE'], ['EGG_PINK', 'DEKALB_WHITE'],
];
const STRAIN_TO_BREED = [
  ['海兰褐', 'HY_LINE_BROWN'], ['罗曼褐', 'LOHMANN_BROWN'], ['伊莎褐', 'ISA_BROWN'], ['本地土鸡', 'LOCAL'],
  ['海兰白', 'HY_LINE_WHITE'], ['罗曼白', 'LOHMANN_WHITE'], ['德卡白', 'DEKALB_WHITE'],
];

const client = new pg.Client(cfg);
await client.connect();
let seeded = 0;
try {
  await client.query('BEGIN');

  // 0) 兜底：迁移在 isolated bootstrap（无 brd_flocks 表）时跳过加列——真库上确保列存在
  await client.query(`ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS breed_code VARCHAR(64)`).catch(err => {
    if (!String(err.message).includes('does not exist')) throw err;
  });

  // 1) GRADE_0 等级（product_grades 无 grade_name_en 列——G67 同款列集）
  const g0 = await client.query(`
    INSERT INTO product_grades (grade_code, grade_name, grade_name_lo, weight_range, sort_order, is_saleable, is_storable, status)
    VALUES ('GRADE_0', '0号特大蛋', 'ໄຂ່ຊັ້ນ 0', '≥66g', 5, true, true, 'ACTIVE')
    ON CONFLICT (grade_code) DO NOTHING
  `);
  seeded += g0.rowCount ?? 0;

  // 2) 变体
  const v = await client.query(`
    INSERT INTO md_product_varieties (variety_code, variety_name, variety_name_en, shell_color, status)
    SELECT * FROM (VALUES
      ('EGG_RED', '红壳蛋', 'Red Shell Egg', 'RED', 'ACTIVE'),
      ('EGG_PINK', '粉壳蛋', 'Pink Shell Egg', 'PINK', 'ACTIVE')
    ) AS t(variety_code, variety_name, variety_name_en, shell_color, status)
    ON CONFLICT (variety_code) DO NOTHING
  `);
  seeded += v.rowCount ?? 0;

  // 3) 品种映射
  const vb = await client.query(`
    INSERT INTO md_variety_breeds (variety_code, breed_code)
    SELECT * FROM (VALUES
      ${VARIETY_BREEDS.map(r => `('${r[0]}', '${r[1]}')`).join(', ')}
    ) AS t(variety_code, breed_code)
    ON CONFLICT (variety_code, breed_code) DO NOTHING
  `);
  seeded += vb.rowCount ?? 0;

  // 4) 变体产品线 12 个（2 变体 × 6 等级）
  const products = [];
  for (const [vCode, vName] of VARIETIES) {
    const prefix = vCode === 'EGG_RED' ? 'PRD-EGG-RED' : 'PRD-EGG-PINK';
    const skuPrefix = vCode === 'EGG_RED' ? 'R' : 'P';
    for (const [num, gCode, gName] of GRADES) {
      products.push([`${prefix}-${num}`, `${vName}${num}号${gName.replace(/^\d+号/, '')}`.replace('0号特大蛋', '0号特大'), gCode, vCode, skuPrefix]);
    }
  }
  // 修正产品名：红壳蛋0号特大 / 红壳蛋1号蛋 …
  for (const p of products) {
    p[1] = p[1].includes('特大') ? `${p[3] === 'EGG_RED' ? '红壳' : '粉壳'}蛋0号特大` : `${p[3] === 'EGG_RED' ? '红壳' : '粉壳'}蛋${p[2].replace('GRADE_', '')}号蛋`;
  }
  const pr = await client.query(`
    INSERT INTO mst_products (product_code, product_name, product_name_zh, unit_zh, category_code, has_grade, has_spec, status, variety_code)
    SELECT * FROM (VALUES
      ${products.map(p => `('${p[0]}', '${p[1]}', '${p[1]}', '枚', 'EGG', true, true, 'ACTIVE', '${p[3]}')`).join(', ')}
    ) AS t(product_code, product_name, product_name_zh, unit_zh, category_code, has_grade, has_spec, status, variety_code)
    ON CONFLICT (product_code) DO NOTHING
  `);
  seeded += pr.rowCount ?? 0;

  // 5a) 变体 SKU：2 × 6 × 7 = 84
  const skus = [];
  for (const [vCode, , , skuLetter] of VARIETIES.map(x => [x[0], x[1], x[2], x[0] === 'EGG_RED' ? 'R' : 'P'])) {
    for (const [num, gCode, gName] of GRADES) {
      const prefix = vCode === 'EGG_RED' ? 'PRD-EGG-RED' : 'PRD-EGG-PINK';
      for (const [specCode, specName] of SPECS) {
        skus.push([`SKU-${skuLetter}-${num}-${specCode}`, `${prefix}-${num}`, gName, gCode, specCode, vCode]);
      }
    }
  }
  const sk = await client.query(`
    INSERT INTO product_skus (sku_code, product_code, product_name, grade_code, spec_code, sku_name, status, variety_code)
    SELECT * FROM (VALUES
      ${skus.map(s => `('${s[0]}', '${s[1]}', '${s[2]}', '${s[3]}', '${s[4]}', '${s[2]} ${SPECS.find(x => x[0] === s[4])[1]}', 'ACTIVE', '${s[5]}')`).join(',\n      ')}
    ) AS t(sku_code, product_code, product_name, grade_code, spec_code, sku_name, status, variety_code)
    ON CONFLICT (sku_code) DO NOTHING
  `);
  seeded += sk.rowCount ?? 0;

  // 5b) GRADE_0 补档到既有无变体产品线 PRD-EGG-0（散/托/箱 5 规格，与 G68 命名一致）
  const g0Product = await client.query(`
    INSERT INTO mst_products (product_code, product_name, product_name_zh, unit_zh, category_code, has_grade, has_spec, status)
    VALUES ('PRD-EGG-0', '0号特大蛋', '0号特大蛋', '枚', 'EGG', true, true, 'ACTIVE')
    ON CONFLICT (product_code) DO NOTHING
  `);
  seeded += g0Product.rowCount ?? 0;
  const plainG0 = await client.query(`
    INSERT INTO product_skus (sku_code, product_code, product_name, grade_code, spec_code, sku_name, status)
    SELECT 'SKU-0-' || s.spec_code, 'PRD-EGG-0', '0号特大蛋', 'GRADE_0', s.spec_code, '0号特大蛋 ' || s.spec_name, 'ACTIVE'
    FROM (VALUES ${SPECS.filter(x => x[0] !== 'GIFT12' && x[0] !== 'GIFT24').map(x => `('${x[0]}', '${x[1]}')`).join(', ')}) AS s(spec_code, spec_name)
    WHERE NOT EXISTS (SELECT 1 FROM product_skus px WHERE px.sku_code = 'SKU-0-' || s.spec_code)
  `);
  seeded += plainG0.rowCount ?? 0;

  // 6) scope 兜底：全部 84+5 SKU 插 ALL 行（不覆盖既有行）
  const scope = await client.query(`
    INSERT INTO md_sku_org_scope (sku_code, scope_type, scope_code, sale_enabled, stock_enabled, status, default_flag)
    SELECT ps.sku_code, 'ALL', '', true, true, 'ACTIVE', true
      FROM product_skus ps
     WHERE (ps.variety_code IN ('EGG_RED', 'EGG_PINK') OR ps.sku_code LIKE 'SKU-0-%')
       AND NOT EXISTS (
         SELECT 1 FROM md_sku_org_scope sc
          WHERE sc.sku_code = ps.sku_code AND sc.scope_type = 'ALL' AND sc.scope_code = ''
       )
    ON CONFLICT (sku_code, scope_type, scope_code) DO NOTHING
  `);
  seeded += scope.rowCount ?? 0;

  // 7) brd_flocks.breed_code 回填（strain 中文 → BRD_BREED 码；不动已回填行）
  const flocks = await client.query(`
    UPDATE brd_flocks f SET breed_code = m.breed_code
      FROM (VALUES ${STRAIN_TO_BREED.map(r => `('${r[0]}', '${r[1]}')`).join(', ')}) AS m(strain, breed_code)
     WHERE f.strain = m.strain AND (f.breed_code IS NULL OR f.breed_code = '')
  `).catch(err => {
    if (!String(err.message).includes('does not exist')) throw err;
    return { rowCount: 0 };
  });
  seeded += flocks.rowCount ?? 0;

  if (dry) {
    await client.query('ROLLBACK');
    console.log(`[dry-run] 将写入 ${seeded} 行，已回滚`);
  } else {
    await client.query('COMMIT');
    console.log(`[seed] 完成，共写入 ${seeded} 行`);
  }
} catch (error) {
  await client.query('ROLLBACK');
  console.error('[seed] 失败已回滚：', error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
