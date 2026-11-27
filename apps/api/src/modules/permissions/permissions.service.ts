import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { SysRoleEntity } from './entities/sys-role.entity';
import { SysMenuEntity } from './entities/sys-menu.entity';
import { SysUserRoleEntity } from './entities/sys-user-role.entity';
import { SysRoleMenuPermissionEntity } from './entities/sys-role-menu-permission.entity';
import { SysRoleConflictEntity } from './entities/sys-role-conflict.entity';
import { addEggSourceHouseSessionPermissions,loadEggSourceOrganizationGrants,lockEggSourceGrantEditor,authorizeEggSourceRoleMutation,auditEggSourcePermissionChange,type EggSourceGrantActor } from '../../auth/egg-source-organization-grants';
import { resolvePermissions, PermSource } from '../../auth/permissions-resolver';

import { EGG_SOURCE_ACTIONS, EGG_SOURCE_MENU } from '../../auth/egg-source-permissions';
import { legacyEggGrantDigest,menuConfigurationRevision,readMenuGrants,resolveMenuGrants,saveMenuGrants } from './save-menu-grants';
import { assertNoNewRoleConflicts,writeMenusForRoles } from './role-write-conflicts';

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
    actions?: readonly string[];
  }>;
}

export interface RoleMenuPermDto {
  menu_code: string;
  perm_codes: string;          // 例 "V,C,E"
  egg_warehouse_code?: string;
  egg_legacy_digest?: string;
}

export { newlyIntroducedBlockingConflicts } from './role-write-conflicts';

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
  MASTER:     { label_zh: '主数据中心',         color: '#475569' },
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
        actions: m.menu_code === EGG_SOURCE_MENU ? EGG_SOURCE_ACTIONS : undefined,
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

    const configuredSource: Array<{role_id:string;actions:string[]}> = await this.dataSource.query(`SELECT access.role_id,ARRAY_AGG(DISTINCT act) AS actions
      FROM (SELECT role_id,actions FROM md_egg_source_effective_grants WHERE role_id IS NOT NULL
        UNION ALL SELECT rs.role_id,g.actions FROM sys_role_permission_set rs
          JOIN md_egg_source_effective_grants g ON rs.set_id=g.set_id) access
      CROSS JOIN LATERAL unnest(access.actions) act GROUP BY access.role_id`);
    const sourceByRole = new Map(configuredSource.map(row=>[String(row.role_id),row.actions]));
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
          const legacy = permMap.get(`${r.role_id}:${m.menu_id}`) || '';
          const configured = m.menu_code===EGG_SOURCE_MENU ? sourceByRole.get(String(r.role_id)) : undefined;
          const codes = isAdmin ? '*' : configured ? [...new Set([...legacy.split(',').filter(Boolean),...configured])].join(',') : legacy;
          return {
            menu_code: m.menu_code,
            perm_codes: codes,
            ...(m.menu_code===EGG_SOURCE_MENU ? {configured_only:true,version1_configured:legacy,version2_configured:configured??[]} : {}),
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
      `SELECT m.menu_code,rmp.perm_codes,rmp.scope_type,rmp.scope_value,
         CASE WHEN m.menu_code='MENU_MD_EGG_SOURCE' AND rmp.scope_type='WAREHOUSE' THEN rmp.scope_value END AS egg_warehouse_code
       FROM sys_role_menu_permission rmp
       JOIN sys_menu m ON m.menu_id = rmp.menu_id
       WHERE rmp.role_id = $1 AND (NULLIF(rmp.perm_codes,'') IS NOT NULL OR m.menu_code='MENU_MD_EGG_SOURCE')
       ORDER BY m.sort_order`,
      [role.role_id],
    );
    return rows.map((r: any) => ({ menu_code: r.menu_code, perm_codes: r.perm_codes, egg_warehouse_code:r.egg_warehouse_code??undefined,
      egg_legacy_digest:r.menu_code===EGG_SOURCE_MENU?legacyEggGrantDigest(r):undefined }));
  }

  async getRoleConfiguration(roleCode:string) {
    return this.dataSource.transaction('REPEATABLE READ', async manager=>{
      const [role]=await manager.query('SELECT * FROM sys_role WHERE role_code=$1',[roleCode]);
      if (!role) throw new NotFoundException('角色不存在');
      return this.roleConfiguration(manager,role);
    });
  }

  private async roleConfiguration(manager:EntityManager,role:SysRoleEntity) {
    const grants=await readMenuGrants(manager,'role',role.role_id);
    return {role,revision:menuConfigurationRevision({role,grants}),
      perms:grants.map((grant:{menu_code:string;perm_codes:string;scope_type:string|null;scope_value:string|null})=>({
        menu_code:grant.menu_code,perm_codes:grant.perm_codes,
        ...(grant.menu_code===EGG_SOURCE_MENU ? {egg_warehouse_code:grant.scope_type==='WAREHOUSE'?grant.scope_value:null} : {}),
      }))};
  }

  async saveRoleConfiguration(roleCode:string, raw:{
    role_name_zh:string; role_name_lo?:string|null; role_type:string; approval_level:number; description?:string|null;
    perms:RoleMenuPermDto[]; expectedRevision?:string;
  }, create:boolean, actor:EggSourceGrantActor & {username?:string}) {
    const name=typeof raw?.role_name_zh==='string' ? raw.role_name_zh.trim() : '';
    if (!/^ROLE_[A-Z0-9_]{1,59}$/.test(roleCode)||roleCode==='ROLE_ADMIN'||!name||name.length>128||
        typeof raw.role_type!=='string'||!raw.role_type.trim()||raw.role_type.length>32||
        !Number.isInteger(raw.approval_level)||raw.approval_level<0||raw.approval_level>99||
        (raw.role_name_lo!=null&&(typeof raw.role_name_lo!=='string'||raw.role_name_lo.length>128))||
        (raw.description!=null&&typeof raw.description!=='string')) {
      throw new BadRequestException('角色编码、名称、类型或审批级别无效');
    }
    return this.dataSource.transaction(async manager=>{
      await lockEggSourceGrantEditor(manager);
      const [role]=await manager.query('SELECT * FROM sys_role WHERE role_code=$1 FOR UPDATE',[roleCode]);
      if (create===!!role) throw new ConflictException('角色已存在或已删除，请重新读取');
      const before=role ? await this.roleConfiguration(manager,role) : null;
      if (before&&raw.expectedRevision!==before.revision) throw new ConflictException('角色或权限明细已变化，请重新读取');
      const values=[roleCode,name,raw.role_name_lo??null,raw.role_type.trim(),raw.approval_level,raw.description??null];
      const [saved]=await manager.query(create ?
        `INSERT INTO sys_role(role_code,role_name_zh,role_name_lo,role_type,approval_level,description)
          VALUES($1,$2,$3,$4,$5,$6) RETURNING *` :
        `WITH changed AS (UPDATE sys_role SET role_name_zh=$2,role_name_lo=$3,role_type=$4,approval_level=$5,description=$6
          WHERE role_code=$1 RETURNING *) SELECT * FROM changed`,values);
      const result=await this.writeRolePermissions(manager,saved.role_id,roleCode,raw.perms);
      const after=await this.roleConfiguration(manager,saved);
      await manager.query(`INSERT INTO sys_audit_log(user_id,user_name,action,entity_type,entity_id,before_value,after_value)
        VALUES($1,$2,'ROLE_CONFIGURATION','SYS_ROLE',$3,$4::jsonb,$5::jsonb)`,
      [actor.userId,actor.username??String(actor.userId),roleCode,JSON.stringify(before),JSON.stringify(after)]);
      return {...result,revision:after.revision};
    });
  }

  async setRolePermissions(roleCode:string,perms:RoleMenuPermDto[]) {
    return this.dataSource.transaction(async manager=>{
      await lockEggSourceGrantEditor(manager);
      const [role]=await manager.query('SELECT role_id FROM sys_role WHERE role_code=$1 FOR UPDATE',[roleCode]);
      if (!role) throw new BadRequestException(`角色不存在: ${roleCode}`);
      return this.writeRolePermissions(manager,role.role_id,roleCode,perms);
    });
  }

  private async writeRolePermissions(manager:EntityManager,roleId:string,roleCode:string,perms:RoleMenuPermDto[]) {
    const rows=await resolveMenuGrants(manager,perms);
    const before=await writeMenusForRoles(manager,[roleId]);
    const written=await saveMenuGrants(manager,'role',roleId,rows);
    await assertNoNewRoleConflicts(manager,[roleId],before);
    const affected=await manager.query(`WITH changed AS (UPDATE sys_user u
      SET perms_version = COALESCE(u.perms_version, 0) + 1, updated_at=NOW()
      WHERE EXISTS (SELECT 1 FROM sys_user_role ur WHERE ur.user_id=u.user_id AND ur.role_id=$1 AND COALESCE(ur.is_visible,true))
      RETURNING u.user_id) SELECT user_id FROM changed`,[roleId]);
    return {role_code:roleCode,written,invalidated_users:affected.length};
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
    if (menuCode===EGG_SOURCE_MENU) {
      const scopedRoles=await this.dataSource.query(`SELECT r.role_code,r.role_name_zh,string_agg(DISTINCT g.source,',') AS via FROM sys_role r
        JOIN (SELECT role_id,actions,'source_organization_direct' AS source FROM md_egg_source_effective_grants WHERE role_id IS NOT NULL
          UNION ALL SELECT rs.role_id,g.actions,'source_organization_set' FROM sys_role_permission_set rs
            JOIN md_egg_source_effective_grants g USING(set_id)) g USING(role_id)
        WHERE r.status='ACTIVE' AND $1=ANY(g.actions) GROUP BY r.role_code,r.role_name_zh`,[p]);
      const scopedUsers=await this.dataSource.query(`SELECT DISTINCT u.user_id,u.username,u.real_name AS real_name_zh
        FROM sys_user u WHERE u.status=1 AND (
          EXISTS (SELECT 1 FROM sys_user_role ur JOIN sys_role r USING(role_id)
            JOIN md_egg_source_effective_grants g ON g.role_id=ur.role_id OR g.set_id IN (
              SELECT rs.set_id FROM sys_role_permission_set rs WHERE rs.role_id=ur.role_id)
            WHERE ur.user_id=u.user_id AND COALESCE(ur.is_visible,true) AND r.status='ACTIVE' AND $1=ANY(g.actions))
          OR EXISTS (SELECT 1 FROM sys_user_permission_set us JOIN md_egg_source_effective_grants g USING(set_id)
            WHERE us.user_id=u.user_id AND $1=ANY(g.actions)))`,[p]);
      const byRole=new Map<string,{role_code:string;role_name_zh:string;via:string}>();
      for (const role of [...roles,...scopedRoles]) {
        const prior=byRole.get(role.role_code);
        byRole.set(role.role_code,prior ? {...role,via:prior.via+','+role.via} : role);
      }
      return {menu_code:menuCode,perm:p,roles:[...byRole.values()],configuration_only:true,
        users:[...new Map([...users,...scopedUsers].map(user=>[String(user.user_id),user])).values()]};
    }
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
       WHERE r.role_code = ANY($1) AND (psi.perm_codes = '*' OR psi.perm_codes ~ '[CEDA]')
      UNION
      SELECT r.role_code,$2 AS menu_code FROM sys_role r
      JOIN md_egg_source_effective_grants g ON g.role_id=r.role_id OR g.set_id IN (
        SELECT set_id FROM sys_role_permission_set WHERE role_id=r.role_id)
      WHERE r.role_code=ANY($1) AND r.status='ACTIVE' AND g.actions && ARRAY['C','E','A']::text[]`, [roleCodes,EGG_SOURCE_MENU]);
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
  async setRoleStatus(roleCode: string, status: string, actor:EggSourceGrantActor={}) {
    const st = (status || '').toUpperCase();
    if (!['ACTIVE', 'DEPRECATED'].includes(st)) {
      throw new Error('status 必须是 ACTIVE 或 DEPRECATED');
    }
    if (roleCode === 'ROLE_ADMIN' && st === 'DEPRECATED') {
      throw new Error('超管角色不可停用');
    }
    await this.dataSource.transaction(async manager=>{
      const admin=await authorizeEggSourceRoleMutation(manager,actor,[roleCode]);
      const exists = await manager.query(
        `SELECT 1 FROM sys_role WHERE role_code = $1`, [roleCode]);
      if (!exists.length) throw new Error(`角色 ${roleCode} 不存在`);
      // 停用前拦截：仍有在岗用户持有则拒绝（避免误停用导致掉权）
      if (st === 'DEPRECATED') {
        const held = await manager.query(
          `SELECT COUNT(*)::int AS n
             FROM sys_user_role ur
             JOIN sys_role r ON r.role_id = ur.role_id
             JOIN sys_user u ON u.user_id = ur.user_id
            WHERE r.role_code = $1 AND u.status = 1`, [roleCode]);
        if (held[0]?.n > 0) {
          throw new Error(`该角色仍有 ${held[0].n} 个在岗用户持有，请先转移后再停用`);
        }
      }
      await manager.query(
        `UPDATE sys_role
            SET status = $1,
                deprecated_at = CASE WHEN $1 = 'DEPRECATED' THEN NOW() ELSE NULL END
          WHERE role_code = $2`, [st, roleCode]);
      await manager.query(`UPDATE sys_user u SET perms_version=COALESCE(u.perms_version,0)+1
        FROM sys_user_role ur JOIN sys_role r USING(role_id) WHERE u.user_id=ur.user_id AND r.role_code=$1`,[roleCode]);
      if (admin) await auditEggSourcePermissionChange(manager,admin,'EGG_SOURCE_ROLE_STATUS',roleCode,{status:st});
    });
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
      WHERE ur.user_id = $1 AND (m.menu_code<>$2 OR (COALESCE(ur.is_visible,true) AND r.status='ACTIVE'))
      UNION ALL
      SELECT m.menu_code, psi.perm_codes, psi.deny_codes, psi.scope_type, psi.scope_value,
             COALESCE(r.approval_level, 0) AS approval_level, 'role_set'::text AS source
      FROM sys_user_role ur
      JOIN sys_role r ON r.role_id = ur.role_id
      JOIN sys_role_permission_set rps ON rps.role_id = r.role_id
      JOIN sys_permission_set_item psi ON psi.set_id = rps.set_id
      JOIN sys_menu m ON m.menu_id = psi.menu_id
      WHERE ur.user_id = $1 AND (m.menu_code<>$2 OR (COALESCE(ur.is_visible,true) AND r.status='ACTIVE'))
      UNION ALL
      SELECT m.menu_code, psi.perm_codes, psi.deny_codes, psi.scope_type, psi.scope_value,
             0 AS approval_level, 'user_set'::text AS source
      FROM sys_user_permission_set ups
      JOIN sys_permission_set_item psi ON psi.set_id = ups.set_id
      JOIN sys_menu m ON m.menu_id = psi.menu_id
      WHERE ups.user_id = $1
      `,
      [userId, EGG_SOURCE_MENU],
    );

    const houseGrants = await loadEggSourceOrganizationGrants(this.dataSource,userId);
    const merged = addEggSourceHouseSessionPermissions(resolvePermissions(sources),sources,houseGrants);

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
        egg_source_organization_grants: houseGrants,
        sources_raw: sources,           // 三路原始记录，方便审计排错
        conflicts_triggered: conflicts, // 命中的红线（仅 BLOCK/WARN 级别的展示）
      },
    };
  }
}
