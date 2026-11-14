#!/usr/bin/env node
/**
 * check-retired-grade-codes — 8 档制终态金丝雀门禁（业务裁定 2026-11-14）。
 *
 * 等级体系 = GRADE_0..5 + DIRTY + BROKEN（8 档）。CRACKED/DAMAGED 已由迁移
 * FreezeRetiredEggGrades1794500000000 永久退役（DB 触发器拒绝任何复活写法）。
 * 本门禁防"代码层复发"：
 *   1) 金丝雀断言：四个权威等级枚举源必须恰为 8 档制，且不含退役码；
 *   2) diff 扫描：新增行不得引入 'CRACKED' 字面量（CRACKED 无双关语义；
 *      'DAMAGED' 同时是库存状态值，为避免误报只走金丝雀断言覆盖）。
 *
 * 白名单（合法出现 CRACKED 的位置）：测试/规格 fixture（历史数据仿真）、
 * 数据库迁移文件（冻结清单与处置表 CHECK）、legacy 降级映射、本门禁自身。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const RETIRED_CODES = ['CRACKED', 'DAMAGED'];
export const LIVE_GRADES = ['GRADE_0', 'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'DIRTY', 'BROKEN'];
export const LIVE_DEFECT_GRADES = ['DIRTY', 'BROKEN'];

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).href.replace('file://', '')), '..', '..');

function readRepoFile(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

/** 从 TS 源里的常量数组段提取 grade_code 字面量（web 侧文件不可 import，只能解析）。
 *  数组边界用括号配平确定（嵌套对象里的 `code:` 也计），不依赖 `];` 收尾形态。 */
export function extractGradeCodesFromTsArray(source, anchor) {
  const start = source.indexOf(anchor);
  if (start < 0) throw new Error(`ANCHOR_MISSING: ${anchor.slice(0, 40)}`);
  let open = source.indexOf('[', start);
  // 跳过类型标注的空括号（如 `ProductGrade[] = [` 中的 `[]`）
  while (open >= 0 && source[open + 1] === ']') open = source.indexOf('[', open + 1);
  if (open < 0) throw new Error('ARRAY_OPEN_MISSING');
  let depth = 0;
  let end = -1;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) throw new Error('ARRAY_NOT_TERMINATED');
  const body = source.slice(start, end);
  const codes = [];
  const re = /(?:grade_code\s*:\s*|code\s*:\s*)'([A-Z0-9_]+)'/g;
  let match;
  while ((match = re.exec(body))) codes.push(match[1]);
  return codes;
}

export function canarySources(policyModule, matrixModule) {
  const useProductGrades = readRepoFile('apps/web/src/hooks/useProductGrades.ts');
  const usePackagingDicts = readRepoFile('apps/web/src/hooks/usePackagingDicts.ts');
  return [
    { name: 'seed-grade-inventory-policy GRADE_POLICY', codes: policyModule.GRADE_POLICY.map(row => row.grade_code) },
    { name: 'seed-defect-sku-matrix DEFECT_GRADES', codes: matrixModule.DEFECT_GRADES.map(row => row.grade_code) },
    { name: 'useProductGrades FALLBACK', codes: extractGradeCodesFromTsArray(useProductGrades, 'const FALLBACK: ProductGrade[] = [') },
    { name: 'usePackagingDicts PKG_EGG_DEFECT', codes: extractGradeCodesFromTsArray(usePackagingDicts, 'PKG_EGG_DEFECT: [') },
  ];
}

/** 合法出现 CRACKED 的文件（历史 fixture / 迁移冻结清单 / legacy 映射 / 本门禁）。 */
export function isAllowlistedForRetiredCode(file) {
  return /\.(spec|test)\.[cm]?[jt]sx?$/.test(file)
    || /(^|\/)(migrations|database\/migrations)\//.test(file)
    || file === 'apps/api/src/modules/sales-v2/services/egg-inventory.service.ts' // legacy degradeGrade 历史映射
    || file === 'scripts/ci/check-retired-grade-codes.mjs'
    || file === 'scripts/ci/check-retired-grade-codes.test.mjs'
    || file === 'scripts/seed-defect-sku-matrix.mjs' // RETIRED_DEFECT_GRADES 审计清单
    || file === 'scripts/seed-grade-inventory-policy.mjs'; // RETIRED_GRADES 审计清单
}

function changedAddedLines(baseRef) {
  const candidates = [
    [`origin/${baseRef}...HEAD`], [`${baseRef}...HEAD`], ['HEAD~1...HEAD'],
  ];
  let diff = null;
  for (const [range] of candidates) {
    try { diff = execFileSync('git', ['diff', '--unified=0', range], { encoding: 'utf8', cwd: ROOT }); break; } catch { /* try next */ }
  }
  if (diff === null) return [];
  const violations = [];
  let currentFile = '';
  for (const line of diff.split('\n')) {
    const header = /^\+\+\+ b\/(.+)$/.exec(line);
    if (header) { currentFile = header[1]; continue; }
    if (line.startsWith('+++') || !line.startsWith('+')) continue;
    if (/'CRACKED'/.test(line) && !isAllowlistedForRetiredCode(currentFile)) {
      violations.push({ file: currentFile, line: line.slice(1, 160) });
    }
  }
  return violations;
}

export async function runCheck({ baseRef = process.env.RETIRED_GRADE_BASE_REF || process.env.GITHUB_BASE_REF || 'main', loadModules } = {}) {
  const errors = [];
  const loader = loadModules ?? (async () => ({
    policy: await import('../seed-grade-inventory-policy.mjs'),
    matrix: await import('../seed-defect-sku-matrix.mjs'),
  }));
  const { policy, matrix } = await loader();

  for (const source of canarySources(policy, matrix)) {
    if (source.name.includes('DEFECT') || source.name.includes('PKG_EGG_DEFECT')) {
      const sorted = [...source.codes].sort();
      const expected = [...LIVE_DEFECT_GRADES].sort();
      if (JSON.stringify(sorted) !== JSON.stringify(expected)) {
        errors.push(`CANARY_DEFECT_ENUM: ${source.name} = [${source.codes.join(',')}]，期望恰为 [${LIVE_DEFECT_GRADES.join(',')}]`);
      }
      continue;
    }
    for (const code of RETIRED_CODES) {
      if (source.codes.includes(code)) errors.push(`CANARY_RETIRED_CODE: ${source.name} 含退役码 ${code}`);
    }
    if (source.name.startsWith('seed-grade-inventory-policy')) {
      const sorted = [...source.codes].sort();
      const expected = [...LIVE_GRADES].sort();
      if (JSON.stringify(sorted) !== JSON.stringify(expected)) {
        errors.push(`CANARY_POLICY_ENUM: ${source.name} = [${source.codes.join(',')}]，期望 8 档 [${LIVE_GRADES.join(',')}]`);
      }
    }
  }

  for (const violation of changedAddedLines(baseRef)) {
    errors.push(`RETIRED_CODE_ADDED: ${violation.file} 新增行引入 'CRACKED'：${violation.line.trim()}`);
  }
  return { ok: errors.length === 0, errors };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  runCheck().then(result => {
    for (const error of result.errors) console.error(`check-retired-grade-codes: ${error}`);
    console.log(`check-retired-grade-codes: ${result.ok ? 'PASS: 八档制终态枚举未被破坏' : `FAIL: ${result.errors.length} 处违规`}`);
    process.exitCode = result.ok ? 0 : 1;
  }).catch(error => { console.error(`check-retired-grade-codes: ERROR ${error.message}`); process.exitCode = 1; });
}
