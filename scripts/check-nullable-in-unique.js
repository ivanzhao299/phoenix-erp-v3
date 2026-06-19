#!/usr/bin/env node
/**
 * g198 — CI 门禁:唯一约束含 nullable 列检测
 *
 * 扫描 apps/api/src/**\/*.entity.ts:
 *   1. 找 @Unique('name', ['colA', 'colB', ...]) 多列约束
 *   2. 找 @Column({ ..., unique: true, ..., nullable: true }) 单列约束
 *   3. 对约束涉及列,核对 entity 的 @Column 选项是否含 nullable: true
 *   4. 命中 → 报错,在 .github/null-in-unique-allowlist.txt 例外列表中可白名单
 *
 * Why: PG NULL ≠ NULL,nullable 列在唯一约束里让 ON CONFLICT 失效,造成多版本副本残留。
 *      2026-06-19 chanjet_ar_snapshot 残留 32×2 事故根因。
 *
 * Exit 1 = 有违规;Exit 0 = 全部合规或在白名单。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'apps', 'api', 'src');
const ALLOWLIST = path.join(__dirname, '..', '.github', 'null-in-unique-allowlist.txt');

function walk(dir, files = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, files);
    else if (e.name.endsWith('.entity.ts')) files.push(p);
  }
  return files;
}

function parseEntity(file) {
  const text = fs.readFileSync(file, 'utf8');

  // 1) 多列 @Unique('name', ['a', 'b'])
  const multiUniqs = [];
  const uRe = /@Unique\(\s*['"]([^'"]+)['"]\s*,\s*\[([^\]]+)\]/g;
  let m;
  while ((m = uRe.exec(text))) {
    multiUniqs.push({
      name: m[1],
      cols: m[2].split(',').map(s => s.trim().replace(/['"]/g, '')),
    });
  }

  // 2) @Column({...}) → 紧邻下一个属性名
  //    抓 @Column 选项块 + 跳过中间装饰器(@ManyToOne / @JoinColumn 等) + 属性名
  //    [^}@]*? 让选项内容不跨过 @ 或 } 边界,避免错配下一个字段
  const props = {};
  const cRe = /@Column\(\s*\{([^}@]*?)\}\s*\)\s*(?:@\w+(?:\([^)]*\))?\s*)*([a-zA-Z_]\w*)\s*[!?]?\s*:/g;
  while ((m = cRe.exec(text))) {
    props[m[2]] = m[1];
  }

  // 3) 单列 @Column({ unique: true, nullable: true })
  const singleViolations = [];
  for (const [propName, opts] of Object.entries(props)) {
    const isUnique = /unique:\s*true/.test(opts);
    const isNullable = /nullable:\s*true/.test(opts);
    if (isUnique && isNullable) {
      singleViolations.push({ propName, opts });
    }
  }

  // 4) 多列约束里检查每列
  const multiViolations = [];
  for (const u of multiUniqs) {
    for (const col of u.cols) {
      const opts = props[col];
      if (opts && /nullable:\s*true/.test(opts)) {
        multiViolations.push({ name: u.name, col });
      }
    }
  }

  return { multiViolations, singleViolations };
}

function loadAllowlist() {
  if (!fs.existsSync(ALLOWLIST)) return [];
  return fs.readFileSync(ALLOWLIST, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));
}

function main() {
  const files = walk(ROOT);
  const allow = loadAllowlist();
  const all = [];

  for (const f of files) {
    const rel = path.relative(path.join(__dirname, '..'), f);
    const { multiViolations, singleViolations } = parseEntity(f);
    for (const v of multiViolations) {
      all.push({
        file: rel,
        kind: 'multi',
        msg: `@Unique('${v.name}') 含 nullable 列 '${v.col}'`,
        key: `${rel}::${v.name}::${v.col}`,
      });
    }
    for (const v of singleViolations) {
      all.push({
        file: rel,
        kind: 'single',
        msg: `@Column({ unique: true, nullable: true }) on '${v.propName}'`,
        key: `${rel}::single::${v.propName}`,
      });
    }
  }

  const real = all.filter(v => !allow.some(a => v.key.includes(a)));
  const allowed = all.length - real.length;

  if (real.length === 0) {
    console.log(`✅ check-nullable-in-unique: 0 处违规${allowed ? `(${allowed} 处在白名单)` : ''}`);
    process.exit(0);
  }

  console.error('');
  console.error('❌ g198 铁律违规:唯一约束含 nullable 列');
  console.error('');
  console.error('Why: PG NULL ≠ NULL 让唯一约束对 NULL 行失效,upsert 永不去重 → 多版本残留');
  console.error('Fix: NOT NULL DEFAULT \'\' 占位 / 或 partial unique index WHERE col IS NOT NULL');
  console.error('');
  for (const v of real) console.error(`  - ${v.file}: ${v.msg}`);
  console.error('');
  console.error(`共 ${real.length} 处违规${allowed ? `,${allowed} 处在 .github/null-in-unique-allowlist.txt 白名单` : ''}`);
  process.exit(1);
}

main();
