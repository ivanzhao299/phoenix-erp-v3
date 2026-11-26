import { ForbiddenException } from '@nestjs/common';
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

export async function loadEggSourceOrganizationGrants(manager:Pick<EntityManager,'query'>, userId:string|number):
  Promise<EggSourceOrganizationGrant[]> {
  return manager.query(`
    WITH roles AS (
      SELECT ur.role_id FROM sys_user_role ur JOIN sys_role r USING(role_id)
      WHERE ur.user_id=$1 AND COALESCE(ur.is_visible,true) AND r.status='ACTIVE'
    ), sets AS (
      SELECT rs.set_id FROM sys_role_permission_set rs JOIN roles USING(role_id)
      UNION SELECT us.set_id FROM sys_user_permission_set us WHERE us.user_id=$1
    )
    SELECT scope_type,scope_code,company_code,actions FROM md_egg_source_organization_grants
    WHERE role_id IN (SELECT role_id FROM roles) OR set_id IN (SELECT set_id FROM sets)
    ORDER BY id`,[userId]);
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
  grants:readonly EggSourceOrganizationGrant[]): string[] {
  const denials = eggSourceHouseDenials(rows);
  const house = new Set(grants.flatMap(row => row.actions).filter(code => !denials.has(code)));
  if (!house.has('V')) return permissions;
  const legacy = permissions.find(item=>item.startsWith(EGG_SOURCE_MENU+':'));
  const combined = new Set([...parseCodes(legacy?.split(':')[1]), ...house]);
  return [...permissions.filter(item=>!item.startsWith(EGG_SOURCE_MENU+':')),EGG_SOURCE_MENU+':'+[...combined].join(',')];
}

export type EggSourceGrantActor = { userId?:number|string; impersonatedBy?:unknown; perms_version?:number };

export async function requireEggSourceAdministrator(manager: EntityManager, user:EggSourceGrantActor = {}) {
    const id = String(user.userId??'');
    if (!/^[1-9][0-9]{0,18}$/.test(id) || user.impersonatedBy) throw new ForbiddenException('须由实名系统管理员操作');
    const [account] = await manager.query(`SELECT u.perms_version FROM sys_user u JOIN sys_user_role ur USING (user_id)
      JOIN sys_role r USING (role_id) WHERE u.user_id=$1 AND u.status=1 AND COALESCE(ur.is_visible,true)
      AND r.role_code='ROLE_ADMIN' AND r.status='ACTIVE' FOR SHARE OF u,ur,r`, [id]);
    if (!account || !Number.isSafeInteger(user.perms_version) || user.perms_version!==Number(account.perms_version)) {
      throw new ForbiddenException('须由重新登录的有效系统管理员操作');
    }
    return id;
  }

export function lockEggSourceGrantEditor(manager:EntityManager) {
  return manager.query("SELECT pg_advisory_xact_lock(hashtext('phoenix:egg-source-grant-editor'))");
}
