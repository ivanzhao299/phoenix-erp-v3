import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { lockEggSourceGrantEditor,requireEggSourceAdministrator,type EggSourceGrantActor } from '../../auth/egg-source-organization-grants';
import { resolveMenuGrants, saveMenuGrants } from '../permissions/save-menu-grants';

/**
 * G118 权限集（PBAC 两层模型）服务。
 *   能力集 = 可复用的 菜单×操作 捆绑；角色/用户由能力集组合。
 *   运行时解析已在 auth.service 三路并集（role / role_set / user_set），本服务只管 CRUD。
 *   表：sys_permission_set / _item / sys_role_permission_set / sys_user_permission_set
 */
@Injectable()
export class PermissionSetsService {
  constructor(@InjectDataSource() private ds: DataSource) {}

  /** 列表：能力集 + 明细数 / 角色数 / 用户数 */
  async list() {
    return this.ds.query(`
      SELECT s.set_id, s.set_code, s.set_name_zh, s.set_name_lo, s.description,
             COALESCE(i.cnt,0)::int AS item_count,
             COALESCE(rs.cnt,0)::int AS role_count,
             COALESCE(us.cnt,0)::int AS user_count
        FROM sys_permission_set s
        LEFT JOIN (SELECT set_id,COUNT(*) cnt FROM sys_permission_set_item GROUP BY set_id) i  ON i.set_id=s.set_id
        LEFT JOIN (SELECT set_id,COUNT(*) cnt FROM sys_role_permission_set GROUP BY set_id) rs ON rs.set_id=s.set_id
        LEFT JOIN (SELECT set_id,COUNT(*) cnt FROM sys_user_permission_set GROUP BY set_id) us ON us.set_id=s.set_id
       ORDER BY s.set_code`);
  }

  /** 详情：能力集 + 明细（含菜单名）+ 绑定角色 + 绑定用户 */
  async detail(setCode: string) {
    const head = await this.ds.query(`SELECT * FROM sys_permission_set WHERE set_code=$1`, [setCode]);
    if (!head.length) throw new BadRequestException(`能力集 ${setCode} 不存在`);
    const set = head[0];
    const items = await this.ds.query(`
      SELECT i.item_id, m.menu_code, m.menu_name_zh, i.perm_codes,i.deny_codes,
        CASE WHEN m.menu_code='MENU_MD_EGG_SOURCE' AND i.scope_type='WAREHOUSE' THEN i.scope_value END AS egg_warehouse_code
        FROM sys_permission_set_item i JOIN sys_menu m ON m.menu_id=i.menu_id
       WHERE i.set_id=$1 ORDER BY m.menu_code`, [set.set_id]);
    const roles = await this.ds.query(`
      SELECT r.role_code, r.role_name_zh
        FROM sys_role_permission_set rps JOIN sys_role r ON r.role_id=rps.role_id
       WHERE rps.set_id=$1 ORDER BY r.role_code`, [set.set_id]);
    const users = await this.ds.query(`
      SELECT u.user_id, u.username, u.real_name AS real_name_zh
        FROM sys_user_permission_set ups JOIN sys_user u ON u.user_id=ups.user_id
       WHERE ups.set_id=$1 ORDER BY u.username`, [set.set_id]);
    return { ...set, items, roles, users };
  }

  async create(dto: any) {
    const code = (dto.set_code || '').trim();
    const name = (dto.set_name_zh || '').trim();
    if (!/^PSET_[A-Z][A-Z0-9_]*$/.test(code)) throw new BadRequestException('能力集编码格式：PSET_ + 大写字母/数字/下划线');
    if (!name) throw new BadRequestException('能力集名称必填');
    const dup = await this.ds.query(`SELECT 1 FROM sys_permission_set WHERE set_code=$1`, [code]);
    if (dup.length) throw new BadRequestException(`能力集编码「${code}」已存在`);
    await this.ds.query(
      `INSERT INTO sys_permission_set (set_code, set_name_zh, set_name_lo, description, created_at, updated_at)
       VALUES ($1,$2,$3,$4,NOW(),NOW())`,
      [code, name, dto.set_name_lo ?? null, dto.description ?? null]);
    return { ok: true, set_code: code };
  }

  async update(setCode: string, dto: any) {
    const sets: string[] = []; const params: any[] = [];
    for (const [k, col] of [['set_name_zh','set_name_zh'],['set_name_lo','set_name_lo'],['description','description']] as const) {
      if (dto[k] !== undefined) { params.push(dto[k]); sets.push(`${col}=$${params.length}`); }
    }
    if (!sets.length) return { ok: true };
    params.push(setCode);
    await this.ds.query(`UPDATE sys_permission_set SET ${sets.join(', ')}, updated_at=NOW() WHERE set_code=$${params.length}`, params);
    return { ok: true };
  }

  async remove(setCode: string, actor?:EggSourceGrantActor) {
    return this.changeBindings(setCode,actor,async (manager,setId)=>{
      const affected = await manager.query(`SELECT user_id FROM sys_user_permission_set WHERE set_id=$1
        UNION SELECT ur.user_id FROM sys_role_permission_set rps JOIN sys_user_role ur USING(role_id) WHERE rps.set_id=$1`,[setId]);
      await manager.query('DELETE FROM sys_user_permission_set WHERE set_id=$1',[setId]);
      await manager.query('DELETE FROM sys_role_permission_set WHERE set_id=$1',[setId]);
      await manager.query('DELETE FROM sys_permission_set_item WHERE set_id=$1',[setId]);
      await manager.query('DELETE FROM sys_permission_set WHERE set_id=$1',[setId]);
      await this.bumpPerms(manager,affected.map((row:{user_id:number})=>row.user_id));
    },true);
  }

  async setItems(setCode: string, items: Array<{ menu_code: string; perm_codes: string; egg_warehouse_code?: string }>) {
    return this.ds.transaction(async manager => {
      await lockEggSourceGrantEditor(manager);
      const [head] = await manager.query('SELECT set_id FROM sys_permission_set WHERE set_code=$1 FOR UPDATE', [setCode]);
      if (!head) throw new BadRequestException(`能力集 ${setCode} 不存在`);
      const grants = await resolveMenuGrants(manager, items);
      const written = await saveMenuGrants(manager, 'set', head.set_id, grants);
      await manager.query(`UPDATE sys_user SET perms_version=COALESCE(perms_version,0)+1, updated_at=NOW()
        WHERE user_id IN (
          SELECT user_id FROM sys_user_permission_set WHERE set_id=$1
          UNION
          SELECT ur.user_id FROM sys_role_permission_set rps JOIN sys_user_role ur ON ur.role_id=rps.role_id
          WHERE rps.set_id=$1 AND COALESCE(ur.is_visible,true)
        )`, [head.set_id]);
      return { ok:true, written };
    });
  }

  assignRole(setCode:string,roleCode:string,actor?:EggSourceGrantActor) {
    return this.changeRoleBinding(setCode,roleCode,actor,true);
  }

  unassignRole(setCode:string,roleCode:string,actor?:EggSourceGrantActor) {
    return this.changeRoleBinding(setCode,roleCode,actor,false);
  }

  assignUser(setCode:string,userId:number,actor?:EggSourceGrantActor) {
    return this.changeUserBinding(setCode,userId,actor,true);
  }

  unassignUser(setCode:string,userId:number,actor?:EggSourceGrantActor) {
    return this.changeUserBinding(setCode,userId,actor,false);
  }

  private changeRoleBinding(setCode:string,roleCode:string,actor:EggSourceGrantActor|undefined,enabled:boolean) {
    return this.changeBindings(setCode,actor,async (manager,setId)=>{
      const [role] = await manager.query('SELECT role_id FROM sys_role WHERE role_code=$1',[roleCode]);
      if (!role) throw new BadRequestException(`角色 ${roleCode} 不存在`);
      await manager.query(enabled
        ? 'INSERT INTO sys_role_permission_set(role_id,set_id) VALUES($1,$2) ON CONFLICT DO NOTHING'
        : 'DELETE FROM sys_role_permission_set WHERE role_id=$1 AND set_id=$2',[role.role_id,setId]);
      const users = await manager.query('SELECT user_id FROM sys_user_role WHERE role_id=$1',[role.role_id]);
      await this.bumpPerms(manager,users.map((row:{user_id:number})=>row.user_id));
    });
  }

  private changeUserBinding(setCode:string,userId:number,actor:EggSourceGrantActor|undefined,enabled:boolean) {
    return this.changeBindings(setCode,actor,async (manager,setId)=>{
      await manager.query(enabled
        ? 'INSERT INTO sys_user_permission_set(user_id,set_id,granted_at) VALUES($1,$2,NOW()) ON CONFLICT DO NOTHING'
        : 'DELETE FROM sys_user_permission_set WHERE user_id=$1 AND set_id=$2',[userId,setId]);
      await this.bumpPerms(manager,[userId]);
    });
  }

  private changeBindings(setCode:string,actor:EggSourceGrantActor|undefined,
    change:(manager:EntityManager,setId:number)=>Promise<void>,allowMissing=false) {
    return this.ds.transaction(async manager=>{
      await lockEggSourceGrantEditor(manager);
      const [set] = await manager.query('SELECT set_id FROM sys_permission_set WHERE set_code=$1 FOR UPDATE',[setCode]);
      if (!set && !allowMissing) throw new BadRequestException(`能力集 ${setCode} 不存在`);
      if (set) {
        const [managed] = await manager.query('SELECT 1 FROM md_egg_source_organization_grants WHERE set_id=$1 LIMIT 1',[set.set_id]);
        // Ordinary sets retain the existing role/permission-set administration policy.
        if (managed) await requireEggSourceAdministrator(manager,actor);
        await change(manager,set.set_id);
      }
      return {ok:true};
    });
  }

  private async bumpPerms(manager:EntityManager,userIds:number[]) {
    if (!userIds.length) return;
    await manager.query('UPDATE sys_user SET perms_version=COALESCE(perms_version,0)+1,updated_at=NOW() WHERE user_id=ANY($1)',[userIds]);
  }
}
