import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { isEggSourceManagedSubject,auditEggSourcePermissionChange,lockEggSourceGrantEditor,requireEggSourceAdministrator,type EggSourceGrantActor } from '../../auth/egg-source-organization-grants';
import { legacyEggGrantDigest,menuConfigurationRevision,readMenuGrants,resolveMenuGrants,saveMenuGrants,type Grant } from '../permissions/save-menu-grants';
import { assertNoNewRoleConflicts,writeMenusForRoles } from '../permissions/role-write-conflicts';

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
             COALESCE(g.cnt,0)::int AS source_organization_count,
             COALESCE(rs.cnt,0)::int AS role_count,
             COALESCE(us.cnt,0)::int AS user_count
        FROM sys_permission_set s
        LEFT JOIN (SELECT set_id,COUNT(*) cnt FROM sys_permission_set_item WHERE NULLIF(perm_codes,'') IS NOT NULL GROUP BY set_id) i  ON i.set_id=s.set_id
        LEFT JOIN (SELECT set_id,COUNT(*) cnt FROM md_egg_source_effective_grants WHERE cardinality(actions)>0 GROUP BY set_id) g ON g.set_id=s.set_id
        LEFT JOIN (SELECT set_id,COUNT(*) cnt FROM sys_role_permission_set GROUP BY set_id) rs ON rs.set_id=s.set_id
        LEFT JOIN (SELECT set_id,COUNT(*) cnt FROM sys_user_permission_set GROUP BY set_id) us ON us.set_id=s.set_id
       ORDER BY s.set_code`);
  }

  /** 详情：能力集 + 明细（含菜单名）+ 绑定角色 + 绑定用户 */
  async detail(setCode:string) {
    return this.ds.transaction('REPEATABLE READ',manager=>this.configuration(manager,setCode));
  }

  private async configuration(manager:EntityManager,setCode:string) {
    const [set]=await manager.query('SELECT * FROM sys_permission_set WHERE set_code=$1',[setCode]);
    if (!set) throw new BadRequestException(`能力集 ${setCode} 不存在`);
    const grants=await readMenuGrants(manager,'set',set.set_id);
    const roles=await manager.query(`SELECT r.role_code,r.role_name_zh
      FROM sys_role_permission_set rs JOIN sys_role r USING(role_id) WHERE rs.set_id=$1 ORDER BY r.role_code`,[set.set_id]);
    const users=await manager.query(`SELECT u.user_id,u.username,u.real_name AS real_name_zh
      FROM sys_user_permission_set us JOIN sys_user u USING(user_id) WHERE us.set_id=$1 ORDER BY u.username`,[set.set_id]);
    const [source]=await manager.query(`SELECT count(*)::int AS count FROM md_egg_source_effective_grants
      WHERE set_id=$1 AND cardinality(actions)>0`,[set.set_id]);
    return {...set,roles,users,source_organization_count:source.count,revision:menuConfigurationRevision({set,grants}),
      items:grants.map((grant:{item_id:string;menu_code:string;menu_name_zh:string;perm_codes:string;deny_codes?:string;scope_type:string|null;scope_value:string|null})=>({
        item_id:grant.item_id,menu_code:grant.menu_code,menu_name_zh:grant.menu_name_zh,perm_codes:grant.perm_codes,deny_codes:grant.deny_codes,
        ...(grant.menu_code==='MENU_MD_EGG_SOURCE' ? {
          egg_warehouse_code:grant.scope_type==='WAREHOUSE'?grant.scope_value:null,
          egg_legacy_digest:legacyEggGrantDigest(grant),
        } : {}),
      })),
    };
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
      const legacy=await manager.query(`SELECT 1 FROM sys_permission_set_item p JOIN sys_menu m USING(menu_id)
        WHERE p.set_id=$1 AND m.menu_code='MENU_MD_EGG_SOURCE' AND NULLIF(p.perm_codes,'') IS NOT NULL`,[setId]);
      if (legacy.length) throw new ConflictException('请先通过旧版清理入口撤回蛋品来源办理权限');
      await manager.query('DELETE FROM sys_permission_set_item WHERE set_id=$1',[setId]);
      await manager.query('DELETE FROM sys_permission_set WHERE set_id=$1',[setId]);
      await this.bumpPerms(manager,affected.map((row:{user_id:number})=>row.user_id));
    },{action:'remove'},true);
  }

  async saveConfiguration(setCode:string, raw:{
    set_name_zh:string;set_name_lo?:string|null;description?:string|null;items:Grant[];expectedRevision?:string;
  }, create:boolean, actor:EggSourceGrantActor & {username?:string}) {
    const name=typeof raw?.set_name_zh==='string' ? raw.set_name_zh.trim() : '';
    if (!/^PSET_[A-Z][A-Z0-9_]{0,58}$/.test(setCode)||!name||name.length>128||
        (raw.set_name_lo!=null&&(typeof raw.set_name_lo!=='string'||raw.set_name_lo.length>128))||
        (raw.description!=null&&typeof raw.description!=='string')) {
      throw new BadRequestException('能力集编码或名称无效');
    }
    return this.ds.transaction(async manager=>{
      await lockEggSourceGrantEditor(manager);
      const [existing]=await manager.query('SELECT set_id FROM sys_permission_set WHERE set_code=$1 FOR UPDATE',[setCode]);
      if (create===!!existing) throw new ConflictException('能力集已存在或已删除，请重新读取');
      const before=existing ? await this.configuration(manager,setCode) : null;
      if (before&&raw.expectedRevision!==before.revision) throw new ConflictException('能力集或权限明细已变化，请重新读取');
      const values=[setCode,name,raw.set_name_lo??null,raw.description??null];
      const [head]=await manager.query(create ?
        `INSERT INTO sys_permission_set(set_code,set_name_zh,set_name_lo,description) VALUES($1,$2,$3,$4) RETURNING set_id` :
        `WITH changed AS (UPDATE sys_permission_set SET set_name_zh=$2,set_name_lo=CASE WHEN $5 THEN $3 ELSE set_name_lo END,description=$4,updated_at=NOW()
          WHERE set_code=$1 RETURNING set_id) SELECT set_id FROM changed`,create ? values : [...values,raw.set_name_lo!==undefined]);
      const result=await this.writeItems(manager,head.set_id,raw.items);
      const after=await this.configuration(manager,setCode);
      await manager.query(`INSERT INTO sys_audit_log(user_id,user_name,action,entity_type,entity_id,before_value,after_value)
        VALUES($1,$2,'PERMISSION_SET_CONFIGURATION','SYS_PERMISSION_SET',$3,$4::jsonb,$5::jsonb)`,
      [actor.userId,actor.username??String(actor.userId),setCode,JSON.stringify(before),JSON.stringify(after)]);
      return {...result,set_code:setCode,revision:after.revision};
    });
  }

  async setItems(setCode:string,items:Grant[]) {
    return this.ds.transaction(async manager=>{
      await lockEggSourceGrantEditor(manager);
      const [head]=await manager.query('SELECT set_id FROM sys_permission_set WHERE set_code=$1 FOR UPDATE',[setCode]);
      if (!head) throw new BadRequestException(`能力集 ${setCode} 不存在`);
      return this.writeItems(manager,head.set_id,items);
    });
  }

  private async writeItems(manager:EntityManager,setId:string,items:Grant[]) {
    const roles:{role_id:string}[]=await manager.query('SELECT role_id FROM sys_role_permission_set WHERE set_id=$1',[setId]);
    const roleIds=roles.map(row=>row.role_id);
    const before=await writeMenusForRoles(manager,roleIds);
    const grants=await resolveMenuGrants(manager,items);
    const written=await saveMenuGrants(manager,'set',setId,grants);
    await assertNoNewRoleConflicts(manager,roleIds,before);
    await manager.query(`UPDATE sys_user SET perms_version=COALESCE(perms_version,0)+1,updated_at=NOW()
      WHERE user_id IN (SELECT user_id FROM sys_user_permission_set WHERE set_id=$1
        UNION SELECT ur.user_id FROM sys_user_role ur JOIN sys_role_permission_set rs USING(role_id)
        WHERE rs.set_id=$1 AND COALESCE(ur.is_visible,true))`,[setId]);
    return {ok:true,written};
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
      const before=await writeMenusForRoles(manager,[role.role_id]);
      await manager.query(enabled
        ? 'INSERT INTO sys_role_permission_set(role_id,set_id) VALUES($1,$2) ON CONFLICT DO NOTHING'
        : 'DELETE FROM sys_role_permission_set WHERE role_id=$1 AND set_id=$2',[role.role_id,setId]);
      await assertNoNewRoleConflicts(manager,[role.role_id],before);
      const users = await manager.query('SELECT user_id FROM sys_user_role WHERE role_id=$1',[role.role_id]);
      await this.bumpPerms(manager,users.map((row:{user_id:number})=>row.user_id));
    },{action:enabled?'assign':'unassign',target:'role',roleCode});
  }

  private changeUserBinding(setCode:string,userId:number,actor:EggSourceGrantActor|undefined,enabled:boolean) {
    return this.changeBindings(setCode,actor,async (manager,setId)=>{
      await manager.query(enabled
        ? 'INSERT INTO sys_user_permission_set(user_id,set_id,granted_at) VALUES($1,$2,NOW()) ON CONFLICT DO NOTHING'
        : 'DELETE FROM sys_user_permission_set WHERE user_id=$1 AND set_id=$2',[userId,setId]);
      await this.bumpPerms(manager,[userId]);
    },{action:enabled?'assign':'unassign',target:'user',userId});
  }

  private changeBindings(setCode:string,actor:EggSourceGrantActor|undefined,
    change:(manager:EntityManager,setId:number)=>Promise<void>,details:Record<string,unknown>,allowMissing=false) {
    return this.ds.transaction(async manager=>{
      await lockEggSourceGrantEditor(manager);
      const [set] = await manager.query('SELECT set_id FROM sys_permission_set WHERE set_code=$1 FOR UPDATE',[setCode]);
      if (!set && !allowMissing) throw new BadRequestException(`能力集 ${setCode} 不存在`);
      if (set) {
        const managed=await isEggSourceManagedSubject(manager,'set',set.set_id);
        const admin=managed ? await requireEggSourceAdministrator(manager,actor) : undefined;
        await change(manager,set.set_id);
        if (admin) await auditEggSourcePermissionChange(manager,admin,'EGG_SOURCE_PERMISSION_SET_BINDING',setCode,details);
      }
      return {ok:true};
    });
  }

  private async bumpPerms(manager:EntityManager,userIds:number[]) {
    if (!userIds.length) return;
    await manager.query('UPDATE sys_user SET perms_version=COALESCE(perms_version,0)+1,updated_at=NOW() WHERE user_id=ANY($1)',[userIds]);
  }
}
