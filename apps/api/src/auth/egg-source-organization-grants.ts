import { BadRequestException,ConflictException,ForbiddenException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { EGG_SOURCE_MENU } from './egg-source-permissions';
import { parseCodes, type PermSource } from './permissions-resolver';
import type { PermCode } from './permissions.util';

export const EGG_SOURCE_HOUSE_ACTIONS = ['V','C','E','A'] as const;
export type EggSourceHouseAction = typeof EGG_SOURCE_HOUSE_ACTIONS[number];

export type EggSourceOrganizationGrant = {
  scope_type:'COMPANY'|'FARM'|'SITE'|'HOUSE';
  scope_code:string;
  company_code:string;
  actions:EggSourceHouseAction[];
};

export type EggSourceEffectiveGrant = EggSourceOrganizationGrant | {
  scope_type:'OWNER';
  scope_code:null;
  company_code:null;
  actions:EggSourceHouseAction[];
};

export type EggSourceGrantOrigin = {
  subject:'role'|'set'; code:string; retained:boolean;
  scopeType:EggSourceEffectiveGrant['scope_type']; scopeCode:string|null;
};

export type EggSourceGrantProposal = {
  subject:'role'|'set';
  id:string;
  prior:readonly EggSourceOrganizationGrant[];
  actions:readonly EggSourceHouseAction[];
};

function projectStandardScope(prior:readonly EggSourceOrganizationGrant[], actions:readonly EggSourceHouseAction[]):EggSourceEffectiveGrant[] {
  if (!prior.length) return actions.length ? [{scope_type:'OWNER',scope_code:null,company_code:null,actions:[...actions]}] : [];
  const known=prior.flatMap(row=>row.actions);
  return prior.map(row=>({...row,actions:actions.filter(action=>row.actions.includes(action)||!known.includes(action))}))
    .filter(row=>row.actions.length);
}

export async function loadEggSourceOrganizationGrants(manager:Pick<EntityManager,'query'>, userId:string|number,
  proposal?:EggSourceGrantProposal):Promise<(EggSourceEffectiveGrant & {origin:EggSourceGrantOrigin})[]> {
  type SubjectGrant = {
    subject:'role'|'set'; id:string; code:string; standardActions:EggSourceHouseAction[]|null; prior:EggSourceOrganizationGrant[];
  };
  // Start from the account's subjects so login and live checks never expand every converted grant.
  const subjects:SubjectGrant[] = await manager.query(`
    WITH roles AS (
      SELECT ur.role_id,r.role_code FROM sys_user_role ur JOIN sys_role r USING(role_id)
      WHERE ur.user_id=$1 AND COALESCE(ur.is_visible,true) AND r.status='ACTIVE'
    ), sets AS (
      SELECT rs.set_id FROM sys_role_permission_set rs JOIN roles USING(role_id)
      UNION SELECT us.set_id FROM sys_user_permission_set us WHERE us.user_id=$1
    )
    SELECT 'role' AS subject,r.role_id::text AS id,r.role_code AS code,s.actions AS "standardActions",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('scope_type',g.scope_type,'scope_code',g.scope_code,
        'company_code',g.company_code,'actions',g.actions) ORDER BY g.scope_type,g.scope_code)
        FROM md_egg_source_organization_grants g WHERE g.role_id=r.role_id),'[]'::jsonb) AS prior
    FROM roles r LEFT JOIN md_egg_source_standard_grants s USING(role_id)
    UNION ALL
    SELECT 'set',p.set_id::text,ps.set_code,s.actions,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('scope_type',g.scope_type,'scope_code',g.scope_code,
        'company_code',g.company_code,'actions',g.actions) ORDER BY g.scope_type,g.scope_code)
        FROM md_egg_source_organization_grants g WHERE g.set_id=p.set_id),'[]'::jsonb)
    FROM sets p JOIN sys_permission_set ps USING(set_id) LEFT JOIN md_egg_source_standard_grants s USING(set_id)`,[userId]);
  return subjects.flatMap(row=>{
    const proposed=proposal?.subject===row.subject && proposal.id===row.id;
    const grants=proposed ? projectStandardScope(proposal.prior,proposal.actions)
      : row.standardActions===null ? row.prior : projectStandardScope(row.prior,row.standardActions);
    return grants.map(grant=>({...grant,origin:{subject:row.subject,code:row.code,
      retained:grant.scope_type!=='OWNER',scopeType:grant.scope_type,scopeCode:grant.scope_code}}));
  });
}

export function eggSourceHouseDenials(sources:readonly PermSource[]): Set<PermCode> {
  const denials = new Set<PermCode>();
  for (const row of sources) {
    if (row.menu_code!==EGG_SOURCE_MENU) continue;
    for (const action of parseCodes(row.deny_codes)) denials.add(action);
  }
  if (denials.has('E')) denials.add('C');
  return denials;
}

/** Session entries only open navigation. Application actions always check the persisted contract and scope. */
export function addEggSourceHouseSessionPermissions(permissions:string[], rows:readonly PermSource[],
  grants:readonly EggSourceEffectiveGrant[]): string[] {
  const denials = eggSourceHouseDenials(rows);
  const house = new Set(grants.flatMap(row => row.actions).filter(code => !denials.has(code)));
  if (!house.has('V')) return permissions;
  const legacy = permissions.find(item=>item.startsWith(EGG_SOURCE_MENU+':'));
  const combined = new Set([...parseCodes(legacy?.split(':')[1]), ...house]);
  return [...permissions.filter(item=>!item.startsWith(EGG_SOURCE_MENU+':')),EGG_SOURCE_MENU+':'+[...combined].join(',')];
}

export type EggSourceGrantActor = { userId?:number|string; impersonatedBy?:unknown; perms_version?:number };

export async function requireEggSourceAdministrator(manager: EntityManager, user:EggSourceGrantActor = {}, lockAccount = true) {
    const id = String(user.userId??'');
    if (!/^[1-9][0-9]{0,18}$/.test(id) || user.impersonatedBy) throw new ForbiddenException('须由实名系统管理员操作');
    const [account] = await manager.query(`SELECT u.perms_version FROM sys_user u JOIN sys_user_role ur USING (user_id)
      JOIN sys_role r USING (role_id) WHERE u.user_id=$1 AND u.status=1 AND COALESCE(ur.is_visible,true)
      AND r.role_code='ROLE_ADMIN' AND r.status='ACTIVE'${lockAccount?' FOR SHARE OF u,ur,r':''}`, [id]);
    if (!account || !Number.isSafeInteger(user.perms_version) || user.perms_version!==Number(account.perms_version)) {
      throw new ForbiddenException('须由重新登录的有效系统管理员操作');
    }
    return id;
  }

export function lockEggSourceGrantEditor(manager:EntityManager) {
  return manager.query("SELECT pg_advisory_xact_lock(hashtext('phoenix:egg-source-grant-editor'))");
}

/** Take the same IAM lock before the transaction pins its serializable snapshot. */
export async function withEggSourceGrantEditorSnapshot<T>(manager:EntityManager,operation:(em:EntityManager)=>Promise<T>) {
  const runner=manager.connection.createQueryRunner();
  await runner.connect();
  try {
    await runner.query("SELECT pg_advisory_lock(hashtext('phoenix:egg-source-grant-editor'))");
    try {
      return await runner.manager.transaction('SERIALIZABLE',operation);
    } finally {
      await runner.query("SELECT pg_advisory_unlock(hashtext('phoenix:egg-source-grant-editor'))");
    }
  } finally {
    await runner.release();
  }
}

export async function isEggSourceManagedSubject(manager:EntityManager, type:'role'|'set', id:string|number) {
  const sql = type==='role' ? `SELECT 1 FROM sys_role r WHERE r.role_id=$1 AND (
    r.role_code='ROLE_ADMIN'
    OR EXISTS (SELECT 1 FROM md_egg_source_organization_grants g WHERE g.role_id=r.role_id)
    OR EXISTS (SELECT 1 FROM md_egg_source_standard_grants g WHERE g.role_id=r.role_id)
    OR EXISTS (SELECT 1 FROM sys_role_menu_permission p JOIN sys_menu m USING(menu_id)
      WHERE p.role_id=r.role_id AND m.menu_code=$2)
    OR EXISTS (SELECT 1 FROM sys_role_permission_set rs WHERE rs.role_id=r.role_id AND (
      EXISTS (SELECT 1 FROM md_egg_source_organization_grants g WHERE g.set_id=rs.set_id)
      OR EXISTS (SELECT 1 FROM md_egg_source_standard_grants g WHERE g.set_id=rs.set_id)
      OR EXISTS (SELECT 1 FROM sys_permission_set_item p JOIN sys_menu m USING(menu_id)
        WHERE p.set_id=rs.set_id AND m.menu_code=$2))))`
    : `SELECT 1 WHERE EXISTS (SELECT 1 FROM md_egg_source_organization_grants g WHERE g.set_id=$1)
      OR EXISTS (SELECT 1 FROM md_egg_source_standard_grants g WHERE g.set_id=$1)
      OR EXISTS (SELECT 1 FROM sys_permission_set_item p JOIN sys_menu m USING(menu_id)
        WHERE p.set_id=$1 AND m.menu_code=$2)`;
  return (await manager.query(sql,[id,EGG_SOURCE_MENU])).length>0;
}

export async function auditEggSourcePermissionChange(manager:EntityManager,actor:string,operation:string,id:string|number,change:unknown) {
  await manager.query(`INSERT INTO sys_audit_log(user_id,user_name,action,entity_type,entity_id,after_value)
    VALUES ($1,$2,$3,'EGG_SOURCE_HOUSE',$4,$5::jsonb)`,[actor,actor,operation,String(id),JSON.stringify(change)]);
}

export async function authorizeEggSourceRoleMutation(manager:EntityManager, actor:EggSourceGrantActor,
  roleCodes:readonly string[], userId?:string|number, includeAssigned=false) {
  await lockEggSourceGrantEditor(manager);
  const roles:{role_id:string}[] = await manager.query(`SELECT DISTINCT r.role_id FROM sys_role r
    WHERE r.role_code=ANY($1::text[]) OR ($2::bigint IS NOT NULL AND EXISTS (
      SELECT 1 FROM sys_user_role ur WHERE ur.user_id=$2 AND ur.role_id=r.role_id))`,
  [roleCodes,includeAssigned ? userId??null : null]);
  let admin:string|undefined;
  for (const {role_id} of roles) {
    if (await isEggSourceManagedSubject(manager,'role',role_id)) {
      admin=await requireEggSourceAdministrator(manager,actor);
      break;
    }
  }
  if (userId!==undefined) await manager.query('SELECT user_id FROM sys_user WHERE user_id=$1 FOR UPDATE',[userId]);
  return admin;
}

export async function authorizeEggSourceUserScopeMutation(manager:EntityManager, actor:EggSourceGrantActor, userId:string|number) {
  const admin=await authorizeEggSourceRoleMutation(manager,actor,[],userId,true);
  if (admin) return admin;
  const sets:{set_id:string}[] = await manager.query('SELECT set_id FROM sys_user_permission_set WHERE user_id=$1',[userId]);
  for (const {set_id} of sets) {
    if (await isEggSourceManagedSubject(manager,'set',set_id)) return requireEggSourceAdministrator(manager,actor);
  }
  return undefined;
}

export async function authorizeEggSourceWarehouseScopeMutation(manager:EntityManager,actor:EggSourceGrantActor,userId:number) {
  await lockEggSourceGrantEditor(manager);
  const rows=await loadEligibleWarehouseRoles(manager,userId);
  const admin=rows.length ? await requireEggSourceAdministrator(manager,actor) : undefined;
  await manager.query('SELECT user_id FROM sys_user WHERE user_id=$1 FOR UPDATE',[userId]);
  return admin;
}

function loadEligibleWarehouseRoles(manager:EntityManager,userId:number) {
  return manager.query(`WITH roles AS (SELECT role_id FROM sys_user_role WHERE user_id=$1),
    sets AS (SELECT set_id FROM sys_user_permission_set WHERE user_id=$1
      UNION SELECT rs.set_id FROM sys_role_permission_set rs JOIN roles USING(role_id))
    SELECT 1 FROM sys_menu m WHERE m.menu_code=$2 AND (
      EXISTS (SELECT 1 FROM sys_role_menu_permission p JOIN roles USING(role_id) WHERE p.menu_id=m.menu_id)
      OR EXISTS (SELECT 1 FROM sys_permission_set_item p JOIN sets USING(set_id) WHERE p.menu_id=m.menu_id))`,
    [userId,EGG_SOURCE_MENU]);
}

export function resetEggSourceAccountPassword(manager:EntityManager,actor:EggSourceGrantActor,userId:string,passwordHash:string) {
  return manager.transaction(async transaction=>{
    const admin=await authorizeEggSourceUserScopeMutation(transaction,actor,userId);
    const rows=await transaction.query(`UPDATE sys_user SET password_hash=$1,
      perms_version=COALESCE(perms_version,0)+1,updated_at=now() WHERE user_id=$2 RETURNING user_id`,[passwordHash,userId]);
    if (admin&&rows.length) await auditEggSourcePermissionChange(transaction,admin,'EGG_SOURCE_ACCOUNT_PASSWORD_RESET',userId,{});
    return rows;
  });
}

export async function removeEggSourceManagedRole(entityManager:EntityManager,column:string,id:string,actor:EggSourceGrantActor) {
  if (column!=='role_id' && column!=='role_code') throw new BadRequestException('无效的角色标识');
  return entityManager.transaction(async manager=>{
    await lockEggSourceGrantEditor(manager);
    const [role] = await manager.query(`SELECT role_id,role_code FROM sys_role WHERE ${column}=$1 FOR UPDATE`,[id]);
    if (!role) throw new BadRequestException('角色不存在');
    if (role.role_code==='ROLE_ADMIN') throw new ForbiddenException('系统管理员角色不可删除');
    const admin=await authorizeEggSourceRoleMutation(manager,actor,[role.role_code]);
    const legacy=await manager.query(`SELECT 1 FROM sys_role_menu_permission p JOIN sys_menu m USING(menu_id)
      WHERE p.role_id=$1 AND m.menu_code=$2 AND NULLIF(p.perm_codes,'') IS NOT NULL`,[role.role_id,EGG_SOURCE_MENU]);
    if (legacy.length) throw new ConflictException('请先通过旧版清理入口撤回蛋品来源办理权限');
    const users=await manager.query('SELECT user_id FROM sys_user_role WHERE role_id=$1',[role.role_id]);
    await manager.query('DELETE FROM sys_role WHERE role_id=$1',[role.role_id]);
    if (users.length) await manager.query('UPDATE sys_user SET perms_version=COALESCE(perms_version,0)+1 WHERE user_id=ANY($1)',
      [users.map((row:{user_id:string})=>row.user_id)]);
    if (admin) await auditEggSourcePermissionChange(manager,admin,'EGG_SOURCE_ROLE_STATUS',role.role_code,{status:'REMOVED'});
    return '已删除';
  });
}
