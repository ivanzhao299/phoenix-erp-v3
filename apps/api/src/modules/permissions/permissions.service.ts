import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { SysRoleEntity } from './entities/sys-role.entity';
import { SysMenuEntity } from './entities/sys-menu.entity';
import { SysUserRoleEntity } from './entities/sys-user-role.entity';
import { SysRoleMenuPermissionEntity } from './entities/sys-role-menu-permission.entity';
import { SysRoleConflictEntity } from './entities/sys-role-conflict.entity';
import { resolvePermissions, PermSource } from '../../auth/permissions-resolver';

export interface MenuGroupNode {
  domain: string;
  domain_label_zh: string;
  domain_color: string;
  menus: Array<{
    menu_code: string;
    menu_name_zh: string;
    menu_name_lo: string | null;
    route: string | null;
    icon: string | null;
    sort_order: number;
    /** UI 提示：该菜单是否敏感（建议二次确认） */
    sensitive: boolean;
  }>;
}

export interface RoleMenuPermDto {
  menu_code: string;
  perm_codes: string;          // 例 "V,C,E"
}

type SodRule = Pick<SysRoleConflictEntity, 'menu_a' | 'menu_b' | 'severity'>;

export function newlyIntroducedBlockingConflicts(
  currentWriteMenus: Iterable<string>,
  proposedWriteMenus: Iterable<string>,
  rules: SodRule[],
): SodRule[] {
  const current = new Set(currentWriteMenus);
  const proposed = new Set(proposedWriteMenus);
  const triggered = (menus: Set<string>, rule: SodRule) =>
    rule.severity === 'BLOCK' && menus.has(rule.menu_a) && menus.has(rule.menu_b);
  return rules.filter(rule => triggered(proposed, rule) && !triggered(current, rule));
}

export interface MatrixCell {
  menu_code: string;
  perm_codes: string;          // 空串=无权限
  granted: boolean;            // perm_codes 至少含 V 即视为 granted
}

export interface MatrixRoleRow {
  role_code: string;
  role_name_zh: string;
  role_type: string;
  is_admin: boolean;           // ROLE_ADMIN 视为全部权限
  cells: MatrixCell[];
}

// ── 业务域分组元数据（按 sys_menu.domain 字段聚合）─────────────────────
const DOMAIN_META: Record<string, { label_zh: string; color: string }> = {
  COMMON:     { label_zh: '🏛️ 通用与决策',    color: '#6366f1' },
  FINANCE:    { label_zh: '💰 财务',           color: '#ec4899' },
  ORDER:      { label_zh: '📦 订单',           color: '#06b6d4' },
  STORE:      { label_zh: '🏪 门店与 POS',     color: '#3b82f6' },
  FARM:       { label_zh: '🐔 养殖生产',       color: '#10b981' },
  QA:         { label_zh: '🧪 质检追溯',       color: '#84cc16' },
  PKG:        { label_zh: '📦 包装作业',       color: '#14b8a6' },
  WMS:        { label_zh: '🏭 仓储',           color: '#f59e0b' },
  LOG:        { label_zh: '🚚 物流',           color: '#f97316' },
  PRC:        { label_zh: '🛒 采购',           color: '#8b5cf6' },
  SALES:      { label_zh: '📊 销售 B2B',       color: '#0ea5e9' },
  MOBILE:     { label_zh: '📱 移动端功能',     color: '#0891b2' },
};

// ── 敏感菜单白名单（CRUD 写操作受限）────────────────────────────────────
const SENSITIVE_MENUS = new Set([
  'MENU_FIN_AUDIT',
  'MENU_FIN_CLOSE',
  'MENU_APPROVAL',
  'MENU_WMS_OP',
  'MENU_QA_PRODUCT',
  'MENU_PRC_MGR',
]);

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(SysRoleEntity)             private readonly roleRepo: Repository<SysRoleEntity>,
    @InjectRepository(SysMenuEntity)             private readonly menuRepo: Repository<SysMenuEntity>,
    @InjectRepository(SysUserRoleEntity)         private readonly userRoleRepo: Repository<SysUserRoleEntity>,
    @InjectRepository(SysRoleMenuPermissionEntity) private readonly rmpRepo: Repository<SysRoleMenuPermissionEntity>,
    @InjectRepository(SysRoleConflictEntity)     private readonly conflictRepo: Repository<SysRoleConflictEntity>,
    private readonly dataSource: DataSource,
  ) {}

  // ── GET /api/permissions/menus  按 domain 分组 ────────────────────────
  async getMenusGrouped(): Promise<MenuGroupNode[]> {
    const menus = await this.menuRepo.find({ order: { sort_order: 'ASC', menu_id: 'ASC' } });
    const byDomain = new Map<string, MenuGroupNode>();
    for (const m of menus) {
      const dom = m.domain || 'COMMON';
      if (!byDomain.has(dom)) {
        const meta = DOMAIN_META[dom] || { label_zh: dom, color: '#94a3b8' };
        byDomain.set(dom, {
          domain: dom,
          domain_label_zh: meta.label_zh,
          domain_color: meta.color,
          menus: [],
        });
      }
      byDomain.get(dom)!.menus.push({
        menu_code: m.menu_code,
        menu_name_zh: m.menu_name_zh,
        menu_name_lo: m.menu_name_lo,
        route: m.route,
        icon: m.icon,
        sort_order: m.sort_order,
        sensitive: SENSITIVE_MENUS.has(m.menu_code),
      });
    }
    return Array.from(byDomain.values());
  }

  // ── GET /api/permissions/conflicts ─────────────────────────────────────
  async getConflicts(): Promise<SysRoleConflictEntity[]> {
    return this.conflictRepo.find({ order: { id: 'ASC' } });
  }

  // ── POST /api/permissions/check-conflicts ─────────────────────────────
  // 入参：menu_codes 字符串数组；返回触发的冲突规则列表
  async checkConflicts(menuCodes: string[]): Promise<SysRoleConflictEntity[]> {
    if (!Array.isArray(menuCodes) || menuCodes.length === 0) return [];
    const set = new Set(menuCodes);
    const all = await this.conflictRepo.find();
    return all.filter(c => set.has(c.menu_a) && set.has(c.menu_b));
  }

  // ── GET /api/permissions/matrix  31 角色 × N 菜单 全景 ────────────────
  async getMatrix() {
    const roles = await this.roleRepo.find({ order: { approval_level: 'DESC', role_code: 'ASC' } });
    const menus = await this.menuRepo.find({ order: { sort_order: 'ASC', menu_id: 'ASC' } });
    const allPerms = await this.rmpRepo.find();

    // 用 (role_id, menu_id) 做索引方便查
    const permMap = new Map<string, string>();
    for (const p of allPerms) {
      permMap.set(`${p.role_id}:${p.menu_id}`, p.perm_codes);
    }

    const matrix: MatrixRoleRow[] = roles.map(r => {
      const isAdmin = r.role_code === 'ROLE_ADMIN';
      return {
        role_code: r.role_code,
        role_name_zh: r.role_name_zh,
        role_type: r.role_type,
        is_admin: isAdmin,
        cells: menus.map(m => {
          const codes = isAdmin ? '*' : (permMap.get(`${r.role_id}:${m.menu_id}`) || '');
          return {
            menu_code: m.menu_code,
            perm_codes: codes,
            granted: codes === '*' || codes.split(',').map(s => s.trim()).filter(Boolean).length > 0,
          };
        }),
      };
    });

    return {
      menus: menus.map(m => ({
        menu_code: m.menu_code,
        menu_name_zh: m.menu_name_zh,
        domain: m.domain,
        sensitive: SENSITIVE_MENUS.has(m.menu_code),
      })),
      matrix,
    };
  }

  // ── GET /api/permissions/role/:code/users  该角色下的用户 ───────────────
  async getRoleUsers(roleCode: string) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(roleCode)) {
      throw new Error('role_code 仅允许大写字母/数字/下划线');
    }
    const role = await this.roleRepo.findOne({ where: { role_code: roleCode } });
    if (!role) return { count: 0, users: [] };
    const users = await this.dataSource.query(
      `SELECT u.user_id, u.username, u.real_name, u.store_code, u.status,
              ur.is_primary
       FROM sys_user_role ur
       JOIN sys_user u ON u.user_id = ur.user_id
       WHERE ur.role_id = $1
       ORDER BY u.user_id`,
      [role.role_id],
    );
    return { count: users.length, users };
  }

  // ── GET /api/permissions/role/:code/perms  该角色的菜单×CRUD 三元组列表 ─
  async getRolePermissions(roleCode: string): Promise<RoleMenuPermDto[]> {
    const role = await this.roleRepo.findOne({ where: { role_code: roleCode } });
    if (!role) return [];
    const rows = await this.dataSource.query(
      `SELECT m.menu_code, rmp.perm_codes
       FROM sys_role_menu_permission rmp
       JOIN sys_menu m ON m.menu_id = rmp.menu_id
       WHERE rmp.role_id = $1
       ORDER BY m.sort_order`,
      [role.role_id],
    );
    return rows.map((r: any) => ({ menu_code: r.menu_code, perm_codes: r.perm_codes }));
  }

  // ── PUT /api/permissions/role/:code/perms  批量替换该角色的三元组 ──────
  // 入参：[{menu_code, perm_codes}, ...]  以全量覆盖方式写入（删旧+插新，在事务内）
  async setRolePermissions(roleCode: string, perms: RoleMenuPermDto[]) {
    const role = await this.roleRepo.findOne({ where: { role_code: roleCode } });
    if (!role) throw new Error(`角色不存在: ${roleCode}`);

    if (!Array.isArray(perms)) throw new Error('perms 必须是数组');

    // 校验 perm_codes 合法性
    const VALID_CODES = new Set(['V', 'C', 'E', 'D', 'A', 'X', '*']);
    for (const p of perms) {
      if (!p.menu_code || !p.perm_codes) {
        throw new Error(`无效项: ${JSON.stringify(p)}`);
      }
      const codes = p.perm_codes.split(',').map(s => s.trim()).filter(Boolean);
      for (const c of codes) {
        if (!VALID_CODES.has(c)) throw new Error(`perm_codes 非法字符: ${c}（合法: V,C,E,D,A,X,*）`);
      }
    }

    const isWrite = (codes: string) => codes === '*' || codes.split(',').some(c => ['C', 'E', 'D', 'A'].includes(c.trim()));
    const currentPerms = await this.getRolePermissions(roleCode);
    const rules = await this.conflictRepo.find();
    const addedBlocks = newlyIntroducedBlockingConflicts(
      currentPerms.filter(p => isWrite(p.perm_codes)).map(p => p.menu_code),
      perms.filter(p => isWrite(p.perm_codes)).map(p => p.menu_code),
      rules,
    );
    if (addedBlocks.length > 0) {
      throw new Error(`新增 BLOCK 岗位分离冲突，无法保存：${addedBlocks.map(c => `${c.menu_a}↔${c.menu_b}`).join('、')}`);
    }

    // 将 menu_code 转 menu_id（一次查询）
    const allMenus = await this.menuRepo.find();
    const menuCodeToId = new Map(allMenus.map(m => [m.menu_code, m.menu_id]));

    // 事务：全量替换
    return this.dataSource.transaction(async (mgr) => {
      await mgr.delete(SysRoleMenuPermissionEntity, { role_id: role.role_id });
      const rows: Partial<SysRoleMenuPermissionEntity>[] = [];
      for (const p of perms) {
        const menuId = menuCodeToId.get(p.menu_code);
        if (!menuId) continue; // 静默跳过未知菜单
        rows.push({
          role_id: role.role_id,
          menu_id: menuId,
          perm_codes: p.perm_codes,
        });
      }
      if (rows.length > 0) {
        await mgr.insert(SysRoleMenuPermissionEntity, rows);
      }
      // 角色权限属于 JWT 快照。每次替换后必须使该角色所有有效用户的旧 token
      // 失效，否则数据库矩阵已更新但浏览器仍携带旧动作位，表现为按钮与接口不一致。
      const affected = await mgr.query(
        `UPDATE sys_user u
            SET perms_version = COALESCE(u.perms_version, 0) + 1,
                updated_at = NOW()
          WHERE EXISTS (
            SELECT 1
              FROM sys_user_role ur
             WHERE ur.user_id = u.user_id
               AND ur.role_id = $1
               AND COALESCE(ur.is_visible, true) = true
          )
          RETURNING u.user_id`,
        [role.role_id],
      );
      return {
        role_code: roleCode,
        written: rows.length,
        invalidated_users: affected.length,
      };
    });
  }

  // ── G119 治理面板：反查 + 角色组合 SoD 校验 ────────────────────────────
  /** 「谁能干 X」反查：给定菜单 + 操作码，列出有该权的角色（直绑/经权限集）+ 在岗用户。 */
  async whoCan(menuCode: string, perm: string) {
    const p = (perm || 'V').trim().toUpperCase().slice(0, 1);
    if (!menuCode) throw new Error('menu 必填');
    const like = `%${p}%`;
    const roles = await this.dataSource.query(`
      SELECT role_code, role_name_zh, string_agg(DISTINCT src, ',') AS via FROM (
        SELECT r.role_code, r.role_name_zh, 'direct'::text src
          FROM sys_role r
          JOIN sys_role_menu_permission rmp ON rmp.role_id = r.role_id
          JOIN sys_menu m ON m.menu_id = rmp.menu_id
         WHERE m.menu_code = $1 AND (rmp.perm_codes = '*' OR rmp.perm_codes LIKE $2)
        UNION ALL
        SELECT r.role_code, r.role_name_zh, 'set'::text src
          FROM sys_role r
          JOIN sys_role_permission_set rps ON rps.role_id = r.role_id
          JOIN sys_permission_set_item psi ON psi.set_id = rps.set_id
          JOIN sys_menu m ON m.menu_id = psi.menu_id
         WHERE m.menu_code = $1 AND (psi.perm_codes = '*' OR psi.perm_codes LIKE $2)
      ) t GROUP BY role_code, role_name_zh ORDER BY role_code`, [menuCode, like]);
    const users = await this.dataSource.query(`
      SELECT DISTINCT u.user_id, u.username, u.real_name AS real_name_zh
        FROM sys_user u
       WHERE u.status = 1 AND u.user_id IN (
         SELECT ur.user_id FROM sys_user_role ur
           JOIN sys_role_menu_permission rmp ON rmp.role_id = ur.role_id
           JOIN sys_menu m ON m.menu_id = rmp.menu_id
          WHERE m.menu_code = $1 AND (rmp.perm_codes = '*' OR rmp.perm_codes LIKE $2)
         UNION
         SELECT ur.user_id FROM sys_user_role ur
           JOIN sys_role_permission_set rps ON rps.role_id = ur.role_id
           JOIN sys_permission_set_item psi ON psi.set_id = rps.set_id
           JOIN sys_menu m ON m.menu_id = psi.menu_id
          WHERE m.menu_code = $1 AND (psi.perm_codes = '*' OR psi.perm_codes LIKE $2)
         UNION
         SELECT ups.user_id FROM sys_user_permission_set ups
           JOIN sys_permission_set_item psi ON psi.set_id = ups.set_id
           JOIN sys_menu m ON m.menu_id = psi.menu_id
          WHERE m.menu_code = $1 AND (psi.perm_codes = '*' OR psi.perm_codes LIKE $2)
       ) ORDER BY u.username`, [menuCode, like]);
    return { menu_code: menuCode, perm: p, roles, users };
  }

  /**
   * 角色组合 SoD 校验：给定一组角色，若它们的「写权限菜单」并集触发岗位分离红线则返回冲突。
   * 用于给用户分配多角色时的授权前拦截（区别于编辑单角色权限时的检测）。
   */
  async checkRoleComboConflicts(roleCodes: string[]) {
    if (!Array.isArray(roleCodes) || roleCodes.length === 0) return { conflicts: [] };
    const rows = await this.dataSource.query(`
      SELECT r.role_code, m.menu_code FROM sys_role r
        JOIN sys_role_menu_permission rmp ON rmp.role_id = r.role_id
        JOIN sys_menu m ON m.menu_id = rmp.menu_id
       WHERE r.role_code = ANY($1) AND (rmp.perm_codes = '*' OR rmp.perm_codes ~ '[CEDA]')
      UNION
      SELECT r.role_code, m.menu_code FROM sys_role r
        JOIN sys_role_permission_set rps ON rps.role_id = r.role_id
        JOIN sys_permission_set_item psi ON psi.set_id = rps.set_id
        JOIN sys_menu m ON m.menu_id = psi.menu_id
       WHERE r.role_code = ANY($1) AND (psi.perm_codes = '*' OR psi.perm_codes ~ '[CEDA]')`, [roleCodes]);
    const menuToRoles: Record<string, Set<string>> = {};
    const writeMenus = new Set<string>();
    for (const r of rows) {
      writeMenus.add(r.menu_code);
      (menuToRoles[r.menu_code] ??= new Set()).add(r.role_code);
    }
    const all = await this.conflictRepo.find();
    const conflicts = all
      .filter((c) => writeMenus.has(c.menu_a) && writeMenus.has(c.menu_b))
      .map((c) => ({
        menu_a: c.menu_a, menu_b: c.menu_b, reason_zh: c.reason_zh, severity: c.severity,
        roles_a: Array.from(menuToRoles[c.menu_a] ?? []),
        roles_b: Array.from(menuToRoles[c.menu_b] ?? []),
      }));
    return { conflicts };
  }

  // ── PATCH /api/permissions/role/:code/status  角色生命周期 ─────────────
  /** 软停用 / 恢复角色。DEPRECATED 从编辑页隐藏但保留数据，可恢复。 */
  async setRoleStatus(roleCode: string, status: string) {
    const st = (status || '').toUpperCase();
    if (!['ACTIVE', 'DEPRECATED'].includes(st)) {
      throw new Error('status 必须是 ACTIVE 或 DEPRECATED');
    }
    if (roleCode === 'ROLE_ADMIN' && st === 'DEPRECATED') {
      throw new Error('超管角色不可停用');
    }
    const exists = await this.dataSource.query(
      `SELECT 1 FROM sys_role WHERE role_code = $1`, [roleCode]);
    if (!exists.length) throw new Error(`角色 ${roleCode} 不存在`);
    // 停用前拦截：仍有在岗用户持有则拒绝（避免误停用导致掉权）
    if (st === 'DEPRECATED') {
      const held = await this.dataSource.query(
        `SELECT COUNT(*)::int AS n
           FROM sys_user_role ur
           JOIN sys_role r ON r.role_id = ur.role_id
           JOIN sys_user u ON u.user_id = ur.user_id
          WHERE r.role_code = $1 AND u.status = 1`, [roleCode]);
      if (held[0]?.n > 0) {
        throw new Error(`该角色仍有 ${held[0].n} 个在岗用户持有，请先转移后再停用`);
      }
    }
    await this.dataSource.query(
      `UPDATE sys_role
          SET status = $1,
              deprecated_at = CASE WHEN $1 = 'DEPRECATED' THEN NOW() ELSE NULL END
        WHERE role_code = $2`, [st, roleCode]);
    return { role_code: roleCode, status: st };
  }

  // ── GET /api/permissions/stats  顶部统计 ──────────────────────────────
  async getStats() {
    const roleCount = await this.roleRepo.count();
    const menuCount = await this.menuRepo.count();
    const sensitiveCount = SENSITIVE_MENUS.size;
    const conflictCount = await this.conflictRepo.count();
    // 统计每个角色的用户数
    const userRoleStats: Array<{ role_code: string; user_count: number }> = await this.dataSource.query(
      `SELECT r.role_code, COUNT(ur.user_id)::int AS user_count
       FROM sys_role r
       LEFT JOIN sys_user_role ur ON ur.role_id = r.role_id
       GROUP BY r.role_code`,
    );
    return {
      role_count: roleCount,
      menu_count: menuCount,
      sensitive_count: sensitiveCount,
      conflict_count: conflictCount,
      user_count_by_role: Object.fromEntries(userRoleStats.map((s: any) => [s.role_code, s.user_count])),
    };
  }

  /**
   * 调试/预览端点：查询某用户的有效权限（应用 3 路源 + 优先级合并后的最终结果）
   * 同时返回 raw 三路源 + 触发的 RACI 冲突，方便排错与 UI 解释
   */
  async getEffectiveUserPerms(userId: string | number) {
    const userRows = await this.dataSource.query(
      `SELECT u.user_id, u.username, u.real_name, u.perms_version,
              COALESCE(
                (SELECT json_agg(json_build_object('role_code', r.role_code, 'role_name_zh', r.role_name_zh, 'approval_level', r.approval_level))
                 FROM sys_user_role ur
                 JOIN sys_role r ON r.role_id = ur.role_id
                 WHERE ur.user_id = u.user_id),
                '[]'::json
              ) AS roles
       FROM sys_user u
       WHERE u.user_id = $1
       LIMIT 1`,
      [userId],
    );
    if (!userRows[0]) return { code: 404, msg: 'user not found' };

    const sources: PermSource[] = await this.dataSource.query(
      `
      SELECT m.menu_code, rmp.perm_codes, rmp.deny_codes, rmp.scope_type, rmp.scope_value,
             COALESCE(r.approval_level, 0) AS approval_level, 'role'::text AS source
      FROM sys_user_role ur
      JOIN sys_role r ON r.role_id = ur.role_id
      JOIN sys_role_menu_permission rmp ON rmp.role_id = r.role_id
      JOIN sys_menu m ON m.menu_id = rmp.menu_id
      WHERE ur.user_id = $1
      UNION ALL
      SELECT m.menu_code, psi.perm_codes, psi.deny_codes, psi.scope_type, psi.scope_value,
             COALESCE(r.approval_level, 0) AS approval_level, 'role_set'::text AS source
      FROM sys_user_role ur
      JOIN sys_role r ON r.role_id = ur.role_id
      JOIN sys_role_permission_set rps ON rps.role_id = r.role_id
      JOIN sys_permission_set_item psi ON psi.set_id = rps.set_id
      JOIN sys_menu m ON m.menu_id = psi.menu_id
      WHERE ur.user_id = $1
      UNION ALL
      SELECT m.menu_code, psi.perm_codes, psi.deny_codes, psi.scope_type, psi.scope_value,
             0 AS approval_level, 'user_set'::text AS source
      FROM sys_user_permission_set ups
      JOIN sys_permission_set_item psi ON psi.set_id = ups.set_id
      JOIN sys_menu m ON m.menu_id = psi.menu_id
      WHERE ups.user_id = $1
      `,
      [userId],
    );

    const merged = resolvePermissions(sources);

    // 触发的 RACI 冲突（基于最终持有的 menu_codes 集合）
    const heldMenus = merged.map((p) => p.split(':')[0]);
    const conflicts = heldMenus.length === 0 ? [] : await this.dataSource.query(
      `SELECT menu_a, menu_b, reason_zh, severity
       FROM sys_role_conflict
       WHERE menu_a = ANY($1) AND menu_b = ANY($1)`,
      [heldMenus],
    );

    return {
      code: 200,
      data: {
        user: userRows[0],
        permissions: merged,            // 与 JWT 中一致的 ["MENU_CODE:V,C,E", ...] 数组
        sources_raw: sources,           // 三路原始记录，方便审计排错
        conflicts_triggered: conflicts, // 命中的红线（仅 BLOCK/WARN 级别的展示）
      },
    };
  }
}
