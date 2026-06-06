#!/usr/bin/env node
/**
 * G5-A RBAC 双轨审计
 * ════════════════════════════════════════════════════════════════════════
 * Diff rbac.matrix.ts (静态编译时) 与 sys_role_menu_permission (DB 运行时)。
 *
 * 输入：
 *   - apps/api/src/common/guards/rbac.matrix.ts （regex parse）
 *   - /tmp/g5a_db_perms.psv（ssh erp 已 dump）
 *
 * 输出：docs/g5-a-rbac-audit.md
 *   1. 静态矩阵 only（需 seed 进 DB）
 *   2. DB only（自定义角色、新加菜单）
 *   3. perm 冲突（双方都有但 codes 不同）
 *   4. 数据规模与建议
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/Users/mac/phoenix-erp';
const MATRIX_FILE = path.join(ROOT, 'apps/api/src/common/guards/rbac.matrix.ts');
const DB_DUMP     = '/tmp/g5a_db_perms.psv';
const OUT         = path.join(ROOT, 'docs/g5-a-rbac-audit.md');

// ── 1. parse static matrix ──────────────────────────────────────────────────
function parseMatrix(src) {
  // 提取 ROLE_MENU_MATRIX = { ... } 区块
  const start = src.indexOf('export const ROLE_MENU_MATRIX');
  if (start < 0) throw new Error('ROLE_MENU_MATRIX export not found');
  const body = src.slice(start);
  // 一行一行扫描，识别 MENU_XXX: {  与  ROLE_XXX: ['V','C',...]
  const lines = body.split('\n');
  const matrix = {}; // role -> menu -> perms[]
  let currentMenu = null;
  const menuRe = /^\s{2}([A-Z][A-Z0-9_]+):\s*\{/;
  const roleRe = /^\s{4,}(ROLE_[A-Z0-9_]+):\s*\[([^\]]*)\]/;
  for (const ln of lines) {
    const m = ln.match(menuRe);
    if (m) { currentMenu = m[1]; continue; }
    if (/^\s{2}\},?\s*$/.test(ln)) currentMenu = null;
    if (!currentMenu) continue;
    const r = ln.match(roleRe);
    if (r) {
      const role  = r[1];
      const perms = r[2].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
      if (!matrix[role]) matrix[role] = {};
      matrix[role][currentMenu] = perms.sort();
    }
  }
  return matrix;
}

// ── 2. parse DB dump ────────────────────────────────────────────────────────
function parseDb(text) {
  const m = {}; // role -> menu -> perms[]
  for (const ln of text.split('\n')) {
    if (!ln.trim()) continue;
    const [role, menu, perms /*, denies */] = ln.split('|');
    if (!role || !menu) continue;
    if (!m[role]) m[role] = {};
    m[role][menu] = (perms || '').split(',').map(s => s.trim()).filter(Boolean).sort();
  }
  return m;
}

// ── 3. diff ─────────────────────────────────────────────────────────────────
function diff(matrix, db) {
  const allRoles = new Set([...Object.keys(matrix), ...Object.keys(db)]);
  const matrixOnly = {}; // 矩阵有 DB 无（需 seed）
  const dbOnly     = {}; // DB 有 矩阵无（动态新增）
  const conflict   = []; // 双方都有但 perms 不同
  for (const role of allRoles) {
    const ms = matrix[role] || {};
    const ds = db[role]     || {};
    const allMenus = new Set([...Object.keys(ms), ...Object.keys(ds)]);
    for (const menu of allMenus) {
      const mp = ms[menu];
      const dp = ds[menu];
      if (mp && !dp) {
        (matrixOnly[role] ||= {})[menu] = mp;
      } else if (!mp && dp) {
        (dbOnly[role] ||= {})[menu] = dp;
      } else if (mp && dp) {
        if (mp.join(',') !== dp.join(',')) {
          conflict.push({ role, menu, matrix: mp, db: dp });
        }
      }
    }
  }
  return { matrixOnly, dbOnly, conflict };
}

// ── 4. report markdown ──────────────────────────────────────────────────────
function fmtPerms(p) { return p?.length ? p.join(',') : '∅'; }

function countCells(byRole) {
  let n = 0;
  for (const r of Object.values(byRole)) n += Object.keys(r).length;
  return n;
}

function report(matrix, db, d) {
  const roleCount = (obj) => Object.keys(obj).length;
  const totalCells = (obj) => Object.values(obj).reduce((s, m) => s + Object.keys(m).length, 0);
  const out = [];
  out.push('# G5-A · RBAC 双轨审计报告');
  out.push('');
  out.push(`生成时间：${new Date().toISOString()}`);
  out.push('');
  out.push('## 1. 规模总览');
  out.push('');
  out.push('| 维度 | 静态矩阵 (rbac.matrix.ts) | 动态 DB (sys_role_menu_permission) |');
  out.push('|---|---|---|');
  out.push(`| 角色数 | ${roleCount(matrix)} | ${roleCount(db)} |`);
  out.push(`| (role × menu) 权限单元 | ${totalCells(matrix)} | ${totalCells(db)} |`);
  out.push('');

  // 2. matrix only
  const moCells = countCells(d.matrixOnly);
  out.push('## 2. 仅静态矩阵有（需 seed 进 DB）');
  out.push('');
  out.push(`共 ${Object.keys(d.matrixOnly).length} 个角色、${moCells} 个权限单元在静态矩阵但不在 DB。`);
  out.push('迁移后这些权限必须通过 seed migration 物化到 sys_role_menu_permission，');
  out.push('否则切断静态矩阵后老角色（ROLE_FARM_MGR 等）会全面 403。');
  out.push('');
  out.push('| 角色 | 缺失 menu 数 |');
  out.push('|---|---|');
  for (const role of Object.keys(d.matrixOnly).sort()) {
    out.push(`| \`${role}\` | ${Object.keys(d.matrixOnly[role]).length} |`);
  }
  out.push('');

  // 3. db only
  const doCells = countCells(d.dbOnly);
  out.push('## 3. 仅 DB 有（动态新增 / 自定义角色）');
  out.push('');
  out.push(`共 ${Object.keys(d.dbOnly).length} 个角色、${doCells} 个权限单元在 DB 但不在静态矩阵。`);
  out.push('这是 MenuGuard 静态查询拒绝它们的原因（如 ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR）。');
  out.push('迁 DB 后这些角色将自动得到正确响应。');
  out.push('');
  out.push('| 角色 | menu 数 | 类型推断 |');
  out.push('|---|---|---|');
  for (const role of Object.keys(d.dbOnly).sort()) {
    const kind = /MENGSAI|MASTER_DATA|TEST/i.test(role) ? '自定义/扩展' : '未知';
    out.push(`| \`${role}\` | ${Object.keys(d.dbOnly[role]).length} | ${kind} |`);
  }
  out.push('');

  // 4. conflict
  out.push('## 4. 权限冲突（双方都有但 codes 不同）');
  out.push('');
  out.push(`共 ${d.conflict.length} 处冲突。`);
  if (d.conflict.length === 0) {
    out.push('✅ 两边一致，无冲突。');
  } else {
    out.push('**关键发现**：冲突项大部分是 DB 比矩阵更精细（业务方实际治理痕迹）。');
    out.push('例 `ROLE_HQ_FINANCE MENU_FIN2_CASH`：矩阵 V,X / DB C,E,V,X — DB 加了 C,E 赋权。');
    out.push('又如 `ROLE_FARM_MGR MENU_BREEDING`：矩阵 A,C,D,E,V,X / DB C,E,V — DB 收紧了。');
    out.push('');
    out.push('**修正策略**：以 **DB 为权威**，冲突保留 DB；矩阵 only 部分 INSERT 补齐缺口。');
    out.push('（之前我以为矩阵是真相 → 错。DB 才是业务方手动治理过的真相）');
    out.push('');
    out.push('| 角色 | menu | 静态矩阵 | DB |');
    out.push('|---|---|---|---|');
    for (const c of d.conflict.slice(0, 200)) {
      out.push(`| \`${c.role}\` | \`${c.menu}\` | ${fmtPerms(c.matrix)} | ${fmtPerms(c.db)} |`);
    }
    if (d.conflict.length > 200) {
      out.push(`| ... | ... | ... | ... |`);
      out.push('');
      out.push(`> 仅显示前 200 条，剩余 ${d.conflict.length - 200} 条见生成的 conflict.json`);
      fs.writeFileSync('/tmp/g5a_conflicts.json', JSON.stringify(d.conflict, null, 2));
    }
  }
  out.push('');

  // 5. 详细 matrix only 清单
  out.push('## 5. 详细缺失清单（仅静态矩阵有）');
  out.push('');
  out.push('seed migration 将照此清单 INSERT 进 sys_role_menu_permission。');
  out.push('');
  for (const role of Object.keys(d.matrixOnly).sort()) {
    out.push(`### \`${role}\``);
    out.push('');
    out.push('| menu_code | perm_codes |');
    out.push('|---|---|');
    const menus = d.matrixOnly[role];
    for (const menu of Object.keys(menus).sort()) {
      out.push(`| \`${menu}\` | ${fmtPerms(menus[menu])} |`);
    }
    out.push('');
  }

  // 6. 决策建议
  out.push('## 6. 决策建议');
  out.push('');
  out.push('### 6.1 迁移策略（修正后 — DB 优先）');
  out.push('');
  out.push('1. **DB 为权威，矩阵补缺**：');
  out.push('   - 第 2 节 matrix only → INSERT 进 DB（NOT EXISTS 兜底）');
  out.push('   - 第 3 节 DB only → 保留不动（自定义角色 + 业务方加的菜单）');
  out.push('   - 第 4 节冲突项 → **保留 DB 值**（业务方实际治理痕迹比矩阵更可信）');
  out.push('3. **改造 MenuGuard**：');
  out.push('   - 删除 `hasMenuPermission(userRoles, ...)` 调用');
  out.push('   - 只保留 JWT.permissions 字符串检查（今天已加的 fallback 升级为主路径）');
  out.push('   - `isMenuRegistered` 改成查启动期缓存的 sys_menu 表');
  out.push('4. **`rbac.matrix.ts` 标 deprecated**');
  out.push('   - 文件保留作为初始化 seed 源头（开发者本地新建环境用）');
  out.push('   - 不再被 MenuGuard 引用');
  out.push('');
  out.push('### 6.2 风险与回滚');
  out.push('');
  out.push('- **风险**：seed migration 跑错会让所有用户失去权限。');
  out.push('  - 缓解：先在本地 / staging DB 跑一遍，跑通 scripts 再上生产。');
  out.push('  - 回滚 SQL：先 SELECT ... INTO backup_sys_role_menu_permission 备份。');
  out.push('- **风险**：MenuGuard 改造后老角色登录的旧 JWT 仍然有效但 perms_version 已变。');
  out.push('  - 缓解：seed migration 触发 perms_version+1，老 JWT 自动失效，用户被迫重登。');
  out.push('');
  out.push('### 6.3 后续');
  out.push('');
  out.push('- 完成 G5-A 后，G5-B（lookup endpoint 范式化）才能稳定改 selectors（不用担心 MENU 守卫错配）');
  out.push('- G5-C 自动化巡检需要全量 sys_role_menu_permission 作为真相基线');
  out.push('- G5-D Scope 类型化与 RBAC 解耦，可独立推进');
  out.push('');
  out.push('---');
  out.push('');
  out.push('生成自 `scripts/g5a-rbac-audit.mjs`；数据源 `rbac.matrix.ts` + `/tmp/g5a_db_perms.psv`。');
  return out.join('\n');
}

// ── main ─────────────────────────────────────────────────────────────────────
const matrixSrc = fs.readFileSync(MATRIX_FILE, 'utf8');
const dbDump    = fs.readFileSync(DB_DUMP, 'utf8');
const matrix    = parseMatrix(matrixSrc);
const db        = parseDb(dbDump);
const d         = diff(matrix, db);
const md        = report(matrix, db, d);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, md);
console.log(`Static matrix: ${Object.keys(matrix).length} roles × ${Object.values(matrix).reduce((s, m) => s + Object.keys(m).length, 0)} (role,menu) cells`);
console.log(`DB:            ${Object.keys(db).length} roles × ${Object.values(db).reduce((s, m) => s + Object.keys(m).length, 0)} (role,menu) cells`);
console.log(`Matrix only:   ${Object.keys(d.matrixOnly).length} roles, ${countCells(d.matrixOnly)} cells`);
console.log(`DB only:       ${Object.keys(d.dbOnly).length} roles, ${countCells(d.dbOnly)} cells`);
console.log(`Conflicts:     ${d.conflict.length}`);
console.log(`Report:        ${OUT}`);
