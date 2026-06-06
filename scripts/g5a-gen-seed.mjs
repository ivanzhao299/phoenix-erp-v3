#!/usr/bin/env node
/**
 * G5-A seed migration 生成器
 * ════════════════════════════════════════════════════════════════════════
 * 读 rbac.matrix.ts + /tmp/g5a_db_perms.psv，生成 SQL migration：
 *   - matrix only 337 单元 → INSERT NOT EXISTS（DB 缺什么补什么）
 *   - 冲突 54 处 → 保留 DB（不动）
 *   - DB only → 保留（不动）
 *
 * 输出：apps/api/migrations/20260606_g5a_rbac_matrix_backfill.sql
 *
 * 设计：
 *   - 包裹 DO $body$ + IF EXISTS 兜底（CI 测试库无 sys_role/sys_menu 时跳过）
 *   - 每条 INSERT 用 WHERE NOT EXISTS（按 role_code + menu_code 联查 sys_role/sys_menu）
 *   - 末尾 RAISE NOTICE 总结写入条数
 *   - 不 perms_version+1（业务方手动登出登录即可，避免误伤在线 session 的其它角色用户）
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/Users/mac/phoenix-erp';
const MATRIX_FILE = path.join(ROOT, 'apps/api/src/common/guards/rbac.matrix.ts');
const DB_DUMP     = '/tmp/g5a_db_perms.psv';
const OUT_SQL     = path.join(ROOT, 'apps/api/migrations/20260606_g5a_rbac_matrix_backfill.sql');

// 复用 audit 脚本的 parser
function parseMatrix(src) {
  const start = src.indexOf('export const ROLE_MENU_MATRIX');
  const body = src.slice(start);
  const lines = body.split('\n');
  const matrix = {};
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
function parseDb(text) {
  const m = {};
  for (const ln of text.split('\n')) {
    if (!ln.trim()) continue;
    const [role, menu, perms] = ln.split('|');
    if (!role || !menu) continue;
    if (!m[role]) m[role] = {};
    m[role][menu] = (perms || '').split(',').map(s => s.trim()).filter(Boolean).sort();
  }
  return m;
}

const matrix = parseMatrix(fs.readFileSync(MATRIX_FILE, 'utf8'));
const db     = parseDb(fs.readFileSync(DB_DUMP, 'utf8'));

// 找 matrix only：在 matrix 有但 DB 没有的 (role, menu, perms)
const inserts = [];
for (const role of Object.keys(matrix).sort()) {
  for (const menu of Object.keys(matrix[role]).sort()) {
    if (db[role]?.[menu]) continue;            // 双方都有 → 冲突或一致，本 mig 不动
    const perms = matrix[role][menu].join(',');
    if (!perms) continue;
    inserts.push({ role, menu, perms });
  }
}

const sql = [];
sql.push('-- ═════════════════════════════════════════════════════════════════════════════');
sql.push('-- G5-A · rbac.matrix.ts → sys_role_menu_permission 增量回填');
sql.push('-- ═════════════════════════════════════════════════════════════════════════════');
sql.push('-- 审计：docs/g5-a-rbac-audit.md');
sql.push(`-- 数据：matrix only ${inserts.length} 个权限单元（DB 已有的不动，冲突保留 DB 值）`);
sql.push('-- 目的：MenuGuard 改造为纯动态读 DB 后，老角色仍持有原有权限');
sql.push('--');
sql.push('-- 策略：');
sql.push('--   1) DB 为权威，本 mig 仅补缺（INSERT NOT EXISTS）');
sql.push('--   2) 冲突项保留 DB 值（业务方治理痕迹比矩阵更可信）');
sql.push('--   3) DB only 不动（自定义角色继续有效）');
sql.push('--   4) 不 bump perms_version — 用户重登才换 JWT，不强制踢人');
sql.push('-- ═════════════════════════════════════════════════════════════════════════════');
sql.push('');
sql.push('BEGIN;');
sql.push('');
sql.push('DO $body$');
sql.push('DECLARE');
sql.push('  inserted_count INT := 0;');
sql.push('  rid BIGINT;');
sql.push('  mid BIGINT;');
sql.push('BEGIN');
sql.push("  IF NOT EXISTS (SELECT 1 FROM information_schema.tables");
sql.push("                  WHERE table_schema='public' AND table_name='sys_role_menu_permission') THEN");
sql.push("    RAISE NOTICE '[g5a_rbac_backfill] sys_role_menu_permission 不存在（CI），跳过';");
sql.push("    RETURN;");
sql.push('  END IF;');
sql.push('');

// 输出 inserts。每条用查 role_id + menu_id 然后 INSERT NOT EXISTS。
// 用一条 multi-row pattern 减少 SQL 行数。
sql.push('  -- 一次性 INSERT 全部 matrix only 单元');
sql.push('  -- 用 WHERE NOT EXISTS 兜底防重复（生产已跑过则 0 行写入）');
sql.push('  WITH src(role_code, menu_code, perm_codes) AS (');
sql.push('    VALUES');
const valueRows = inserts.map(
  (e, i) => `      ('${e.role}'::varchar, '${e.menu}'::varchar, '${e.perms}'::varchar)${i === inserts.length - 1 ? '' : ','}`
);
sql.push(valueRows.join('\n'));
sql.push('  )');
sql.push('  INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)');
sql.push('  SELECT r.role_id, m.menu_id, s.perm_codes');
sql.push('  FROM src s');
sql.push('  JOIN sys_role r ON r.role_code = s.role_code');
sql.push('  JOIN sys_menu m ON m.menu_code = s.menu_code');
sql.push('  WHERE NOT EXISTS (');
sql.push('    SELECT 1 FROM sys_role_menu_permission p');
sql.push('    WHERE p.role_id = r.role_id AND p.menu_id = m.menu_id');
sql.push('  );');
sql.push('');
sql.push('  GET DIAGNOSTICS inserted_count = ROW_COUNT;');
sql.push("  RAISE NOTICE '[g5a_rbac_backfill] INSERT % 行（matrix only 单元）', inserted_count;");
sql.push('END $body$;');
sql.push('');
sql.push('COMMIT;');
sql.push('');
sql.push('-- ─── 回滚（仅用于回滚本 mig 的影响）─────────────────────────────────');
sql.push('-- 备份: CREATE TABLE _backup_sys_role_menu_permission_pre_g5a AS SELECT * FROM sys_role_menu_permission;');
sql.push('-- 然后：DELETE FROM sys_role_menu_permission p USING sys_role r, sys_menu m');
sql.push('--       WHERE p.role_id=r.role_id AND p.menu_id=m.menu_id AND (r.role_code, m.menu_code) IN (...)');

fs.writeFileSync(OUT_SQL, sql.join('\n'));
console.log(`Generated ${inserts.length} INSERT rows`);
console.log(`Output: ${OUT_SQL}`);
console.log('');
console.log('Sample (first 10):');
for (const e of inserts.slice(0, 10)) console.log(`  ${e.role} × ${e.menu} = ${e.perms}`);
