#!/usr/bin/env node
/**
 * W4 — 主数据引用一致性体检脚本
 * ════════════════════════════════════════════════════════════════════════
 * 静态 + 动态(可选)体检主数据 canonical 表的使用与漂移。
 *
 * 输出三段:
 *   🟢 canonical 表使用情况(每张表被几个 module 引用)
 *   🟡 alias 表健康(行数、type 分布)               —— 需 DATABASE_URL
 *   🔴 旧 canonical 仍在用的 grep 命中(行号 + 文件)
 *
 * 调用:
 *   node scripts/check-master-data-references.mjs                 # 仅静态
 *   DATABASE_URL=postgres://... node scripts/check-master-data-references.mjs --with-db
 *   node scripts/check-master-data-references.mjs --json          # JSON 输出
 *
 * 退出语义:
 *   W4 阶段:信息性,永远 exit 0(除非 IO 异常)
 *   后续 wave 可选挂 CI red-line(W6+ 决定)
 *
 * 参考:
 *   - docs/MASTER_DATA_W4_EXECUTION_PLAN.md §5
 *   - docs/MASTER_DATA_PHASE2_DESIGN.md §7.2
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../../');
const SRC_DIR = join(ROOT, 'apps', 'api', 'src', 'modules');

const args = new Set(process.argv.slice(2));
const WITH_DB = args.has('--with-db');
const JSON_OUT = args.has('--json');

// ── canonical 主数据表清单(W4 时点) ─────────────────────────────────────────
const CANONICAL_TABLES = [
  'sys_organizations',
  'sys_organization_type_rules', // W4 新建
  'biz_business_units',
  'biz_projects',
  'biz_site_aliases',
  'sal_customers',
  'sal_drivers',
  'prc2_suppliers',
  'mst_products',
  'mst_materials',
  'product_grades',
  'packaging_specs',
  'product_skus',
  'mst_stores',                  // user 拍板 #2:作为兼容台账保留
  'wms_warehouses',              // user 拍板 #1:仓库 ≠ site,独立 canonical
  'fin_cash_accounts',
  'fin_bank_accounts',
  'shr_shareholders',
  'sys_dict',
];

// ── 旧 canonical / 高危 alias 漂移源 ────────────────────────────────────────
// 命中 = 该模块仍在直接写读旧表;治理欠债指示
const LEGACY_SOURCES = [
  { table: 'brd_farms',     reason: '养殖场旧主表;新写入应走 sys_organizations(SITE, FARM)',  ignoreModules: ['farm'] },
  { table: 'sys_store',     reason: '门店 V2 老表;CLAUDE.md MDM-1 §3 已规划退役',              ignoreModules: [] },
  { table: 'prc2_projects', reason: '项目旧主表;CLAUDE.md G86 已切 biz_projects',              ignoreModules: ['procurement-v2', 'workflow'] },
  { table: 'shr_projects',  reason: '股东项目;canonical 是 biz_projects(M2 待落 attrs 退化)', ignoreModules: ['shareholder', 'master-data'] },
];

// ════════════════════════════════════════════════════════════════════════════
function walkTs(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    if (f === 'node_modules' || f.startsWith('.')) continue;
    const p = join(dir, f);
    const st = statSync(p);
    if (st.isDirectory()) walkTs(p, out);
    else if (f.endsWith('.ts') && !f.endsWith('.d.ts') && !f.endsWith('.spec.ts') && !f.endsWith('.fixture.ts')) out.push(p);
  }
  return out;
}

function moduleOf(filePath) {
  const rel = relative(SRC_DIR, filePath);
  const seg = rel.split('/')[0];
  return seg || '<root>';
}

function grepTable(files, tableName) {
  // 词边界匹配,避免 brd_farms 命中 brd_farms_legacy 等
  const re = new RegExp(`\\b${tableName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b`);
  const hits = []; // { file, line, snippet, module }
  for (const f of files) {
    let content;
    try { content = readFileSync(f, 'utf8'); } catch { continue; }
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        hits.push({
          file: relative(ROOT, f),
          line: i + 1,
          snippet: lines[i].trim().slice(0, 200),
          module: moduleOf(f),
        });
      }
    }
  }
  return hits;
}

function summarize(hits) {
  const byModule = new Map();
  for (const h of hits) byModule.set(h.module, (byModule.get(h.module) ?? 0) + 1);
  return {
    total: hits.length,
    moduleCount: byModule.size,
    byModule: Object.fromEntries([...byModule.entries()].sort((a, b) => b[1] - a[1])),
  };
}

// ════════════════════════════════════════════════════════════════════════════
async function checkDb() {
  if (!WITH_DB) return null;
  const url = process.env.DATABASE_URL;
  if (!url) {
    return { error: 'DATABASE_URL not set; pass --with-db with env var to enable DB checks.' };
  }
  let pg;
  try {
    pg = await import('pg');
  } catch {
    return { error: 'node-postgres (pg) not installed in workspace; skip DB check.' };
  }
  const client = new pg.default.Client({ connectionString: url });
  try {
    await client.connect();

    // sys_organization_type_rules 行数
    const ruleRows = await client.query(
      `SELECT COUNT(*)::int AS c FROM sys_organization_type_rules`,
    ).catch(() => ({ rows: [{ c: -1 }] }));

    // biz_site_aliases 行数与 type 分布
    const aliasTotal = await client.query(
      `SELECT COUNT(*)::int AS c FROM biz_site_aliases`,
    ).catch(() => ({ rows: [{ c: -1 }] }));
    const aliasByType = await client.query(
      `SELECT alias_type, COUNT(*)::int AS c FROM biz_site_aliases GROUP BY alias_type ORDER BY 1`,
    ).catch(() => ({ rows: [] }));
    const aliasMinMax = await client.query(
      `SELECT MIN(created_at) AS first, MAX(created_at) AS last FROM biz_site_aliases`,
    ).catch(() => ({ rows: [{ first: null, last: null }] }));

    return {
      orgTypeRules: ruleRows.rows[0]?.c ?? -1,
      bizSiteAliases: {
        total: aliasTotal.rows[0]?.c ?? -1,
        byType: aliasByType.rows.reduce((acc, r) => { acc[r.alias_type] = r.c; return acc; }, {}),
        first: aliasMinMax.rows[0]?.first ?? null,
        last:  aliasMinMax.rows[0]?.last  ?? null,
      },
    };
  } catch (e) {
    return { error: String(e?.message ?? e) };
  } finally {
    await client.end().catch(() => {});
  }
}

// ════════════════════════════════════════════════════════════════════════════
async function main() {
  const files = walkTs(SRC_DIR);

  const canonical = CANONICAL_TABLES.map((t) => ({
    table: t,
    ...summarize(grepTable(files, t)),
  }));

  const legacy = LEGACY_SOURCES.map((l) => {
    const hits = grepTable(files, l.table)
      .filter((h) => !l.ignoreModules.includes(h.module));
    return {
      table: l.table,
      reason: l.reason,
      whitelistedModules: l.ignoreModules,
      ...summarize(hits),
      hits: hits.slice(0, 20), // 最多展示 20 行
    };
  });

  const db = await checkDb();

  const report = {
    generatedAt: new Date().toISOString(),
    rootDir: ROOT,
    scannedFiles: files.length,
    canonical,
    legacyDrift: legacy,
    db,
  };

  if (JSON_OUT) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return 0;
  }

  // 人类可读输出
  console.log('═'.repeat(78));
  console.log('  W4 主数据引用一致性体检');
  console.log('  ' + report.generatedAt);
  console.log(`  扫描 ${files.length} 个 .ts 文件`);
  console.log('═'.repeat(78));

  console.log('\n🟢 Canonical 表使用情况(按 module 聚合)');
  console.log('─'.repeat(78));
  for (const c of canonical) {
    const status = c.total === 0 ? '  ⚠ 0 hit' : `  ${c.total} hit (${c.moduleCount} module)`;
    console.log(`  ${c.table.padEnd(32)} ${status}`);
    if (c.total > 0) {
      const tops = Object.entries(c.byModule).slice(0, 5);
      console.log('      → ' + tops.map(([m, n]) => `${m}(${n})`).join(', '));
    }
  }

  console.log('\n🔴 旧 canonical / 高危 alias 漂移(白名单外命中)');
  console.log('─'.repeat(78));
  for (const l of legacy) {
    if (l.total === 0) {
      console.log(`  ${l.table.padEnd(32)}  ✅ 无白名单外引用`);
      continue;
    }
    console.log(`  ${l.table.padEnd(32)}  ⚠ ${l.total} hit (${l.moduleCount} module 之外: ${l.whitelistedModules.join(', ') || '无'})`);
    console.log(`      reason: ${l.reason}`);
    const tops = Object.entries(l.byModule).slice(0, 5);
    console.log('      modules: ' + tops.map(([m, n]) => `${m}(${n})`).join(', '));
    for (const h of l.hits.slice(0, 5)) {
      console.log(`      ${h.file}:${h.line}  ${h.snippet.slice(0, 110)}`);
    }
  }

  console.log('\n🟡 DB 状态(可选,需 --with-db)');
  console.log('─'.repeat(78));
  if (!db) {
    console.log('  (跳过;若需 DB 校验请加 --with-db + DATABASE_URL)');
  } else if (db.error) {
    console.log(`  ⚠ ${db.error}`);
  } else {
    console.log(`  sys_organization_type_rules     ${db.orgTypeRules} 行   ${db.orgTypeRules === 9 ? '✅' : '⚠ 期望 9 行(GROUP/BU/COMPANY/SITE/DEPARTMENT/PROJECT/WAREHOUSE/STORE/FACTORY)'}`);
    console.log(`  biz_site_aliases                ${db.bizSiteAliases.total} 行`);
    if (db.bizSiteAliases.total > 0) {
      for (const [t, n] of Object.entries(db.bizSiteAliases.byType)) {
        console.log(`      ${String(t).padEnd(24)} ${n} 行`);
      }
      console.log(`      首行 ${db.bizSiteAliases.first} → 末行 ${db.bizSiteAliases.last}`);
    }
  }

  console.log('\n' + '═'.repeat(78));
  console.log('  W4 阶段:信息性输出。后续 wave 可决定挂为 CI red-line。');
  console.log('═'.repeat(78) + '\n');

  return 0;
}

main()
  .then((code) => process.exit(code ?? 0))
  .catch((e) => { console.error('check-master-data-references.mjs failed:', e); process.exit(2); });
