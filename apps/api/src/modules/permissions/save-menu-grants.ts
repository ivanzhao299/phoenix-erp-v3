import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { EGG_SOURCE_MENU } from '../../auth/egg-source-permissions';

export type Grant = { menu_code: string; perm_codes: string; egg_warehouse_code?: string; egg_legacy_digest?: string };
type StoredGrant = { menu_id:string; perm_codes:string };
type GrantSubject = 'role' | 'set';
const subjects = {
  role: {table:'sys_role_menu_permission', key:'role_id'},
  set: {table:'sys_permission_set_item', key:'set_id'},
} as const;

export function menuConfigurationRevision(value:unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function legacyEggGrantDigest(row?:{perm_codes:string;scope_type?:string|null;scope_value?:string|null}) {
  if (!row) return 'none';
  return menuConfigurationRevision([row.perm_codes,row.scope_type??null,row.scope_value??null]);
}

export async function resolveMenuGrants(manager: EntityManager, grants: Grant[]) {
  if (!Array.isArray(grants)) throw new BadRequestException('权限明细须为数组');
  const submitted = new Map<string, string>();
  for (const grant of grants) {
    const menu=grant?.menu_code;
    if (menu===EGG_SOURCE_MENU) {
      throw new ConflictException({code:'LEGACY_GRANT_READ_ONLY',message:'请在蛋品来源专用入口配置新版动作或撤回旧版授权'});
    }
    const codes=typeof grant?.perm_codes==='string' ? grant.perm_codes.split(',').map(code=>code.trim()) : [];
    if (typeof menu!=='string'||!menu||submitted.has(menu)||!codes.length||codes.some(code=>!['V','C','E','D','A','X','*'].includes(code))) {
      throw new BadRequestException('存在重复菜单、无效菜单或该菜单不支持的操作');
    }
    if (grant.egg_warehouse_code!==undefined||grant.egg_legacy_digest!==undefined) {
      throw new BadRequestException('普通菜单权限不能携带蛋品来源授权字段');
    }
    submitted.set(menu,[...new Set(codes)].join(','));
  }
  const menus: {menu_code:string;menu_id:string}[]=await manager.query(
    'SELECT menu_code,menu_id FROM sys_menu WHERE menu_code=ANY($1::text[]) FOR SHARE', [[...submitted.keys()]]);
  if (menus.length!==submitted.size) throw new BadRequestException('存在未登记菜单，请刷新权限目录后再保存');
  return menus.map(menu=>({menu_id:menu.menu_id,perm_codes:submitted.get(menu.menu_code)!}));
}

export async function readMenuGrants(manager:EntityManager,kind:GrantSubject,id:string|number) {
  const {table,key}=subjects[kind];
  return manager.query(`SELECT m.menu_code,m.menu_name_zh,p.perm_codes,p.deny_codes,p.scope_type,p.scope_value
    ${kind==='set'?',p.item_id':''} FROM ${table} p
    JOIN sys_menu m USING(menu_id) WHERE p.${key}=$1 ORDER BY m.menu_code`,[id]);
}

/** Omitted V1 rows and the deny/scope of ordinary menu rows belong to their respective editors. */
export async function saveMenuGrants(manager: EntityManager, kind: GrantSubject, id: string | number, grants: StoredGrant[]) {
  const {table,key}=subjects[kind];
  const [menu] = await manager.query('SELECT menu_id FROM sys_menu WHERE menu_code=$1',[EGG_SOURCE_MENU]);
  const ids=grants.map(grant=>grant.menu_id);
  await manager.query(`DELETE FROM ${table} WHERE ${key}=$1 AND NOT (menu_id=ANY($2::bigint[]))
    AND menu_id IS DISTINCT FROM $3::bigint AND NULLIF(deny_codes,'') IS NULL AND NULLIF(scope_type,'') IS NULL AND NULLIF(scope_value,'') IS NULL`,[id,ids,menu?.menu_id??null]);
  await manager.query(`UPDATE ${table} SET perm_codes='' WHERE ${key}=$1 AND NOT (menu_id=ANY($2::bigint[]))
    AND menu_id IS DISTINCT FROM $3::bigint AND perm_codes IS DISTINCT FROM ''`,[id,ids,menu?.menu_id??null]);
  const written=await manager.query(`INSERT INTO ${table} (${key},menu_id,perm_codes)
    SELECT $1,item.menu_id,item.perm_codes FROM jsonb_to_recordset($2::jsonb) item(menu_id bigint,perm_codes text)
    ON CONFLICT (${key},menu_id) DO UPDATE SET perm_codes=EXCLUDED.perm_codes RETURNING menu_id`,[id,JSON.stringify(grants)]);
  return written.length;
}
