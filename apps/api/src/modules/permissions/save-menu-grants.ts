import { createHash } from 'node:crypto';
import { BadRequestException,ConflictException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { auditEggSourcePermissionChange,requireEggSourceAdministrator,type EggSourceGrantActor } from '../../auth/egg-source-organization-grants';
import { EGG_SOURCE_ACTIONS, EGG_SOURCE_MENU } from '../../auth/egg-source-permissions';

export type Grant = { menu_code: string; perm_codes: string; egg_warehouse_code?: string; egg_legacy_digest?: string };
type StoredGrant = { menu_id:string; perm_codes:string; warehouse_code?:string; legacy_digest?:string };

export function legacyEggGrantDigest(row?:{perm_codes:string;scope_type?:string|null;scope_value?:string|null}) {
  if (!row) return 'none';
  return createHash('sha256').update(JSON.stringify([row.perm_codes,row.scope_type??null,row.scope_value??null])).digest('hex');
}

export async function resolveMenuGrants(manager: EntityManager, grants: Grant[]) {
  if (!Array.isArray(grants)) throw new BadRequestException('权限明细须为数组');
  const submitted = new Map<string, Omit<StoredGrant,'menu_id'>>();
  for (const grant of grants) {
    const menu = grant?.menu_code;
    const clearLegacy = menu===EGG_SOURCE_MENU && grant?.perm_codes==='' && grant.egg_warehouse_code===undefined;
    const codes = typeof grant?.perm_codes === 'string' && !clearLegacy ? grant.perm_codes.split(',').map(code => code.trim()) : [];
    const allowed = menu === EGG_SOURCE_MENU ? EGG_SOURCE_ACTIONS as readonly string[] : ['V','C','E','D','A','X','*'];
    if (typeof menu !== 'string' || !menu || submitted.has(menu) || (!codes.length && !clearLegacy) || codes.some(code => !allowed.includes(code))) {
      throw new BadRequestException('存在重复菜单、无效菜单或该菜单不支持的操作');
    }
    const warehouse = grant.egg_warehouse_code;
    if (warehouse !== undefined && (menu!==EGG_SOURCE_MENU || typeof warehouse!=='string' ||
        !warehouse.trim() || warehouse!==warehouse.trim() || warehouse.length>64)) {
      throw new BadRequestException('目标仓编码无效');
    }
    if (warehouse!==undefined && !(await manager.query(`SELECT 1 FROM wms_warehouses WHERE warehouse_code=$1
      AND status='ACTIVE' AND domain='OPERATIONAL' FOR SHARE`,[warehouse])).length) {
      throw new BadRequestException('请选择启用的操作仓');
    }
    if (grant.egg_legacy_digest!==undefined &&
      (menu!==EGG_SOURCE_MENU || !/^(?:none|[a-f0-9]{64})$/.test(grant.egg_legacy_digest))) {
      throw new BadRequestException('旧授权读取版本无效');
    }
    submitted.set(menu, {perm_codes:[...new Set(codes)].join(','),warehouse_code:warehouse,legacy_digest:grant.egg_legacy_digest});
  }
  const menus: { menu_code: string; menu_id: string }[] = await manager.query(
    'SELECT menu_code,menu_id FROM sys_menu WHERE menu_code=ANY($1::text[]) FOR SHARE', [[...submitted.keys()]]);
  if (menus.length !== submitted.size) throw new BadRequestException('存在未登记菜单，请刷新权限目录后再保存');
  return menus.map(menu => ({ menu_id: menu.menu_id, ...submitted.get(menu.menu_code)! }));
}

/** The editor owns grant codes. A row may still carry a deny or a scope when all grants are cleared. */
export async function saveMenuGrants(manager: EntityManager, kind: 'role' | 'set', id: string | number,
  grants: StoredGrant[], actor?:EggSourceGrantActor) {
  const table = kind === 'role' ? 'sys_role_menu_permission' : 'sys_permission_set_item';
  const key = kind === 'role' ? 'role_id' : 'set_id';
  const [menu] = await manager.query('SELECT menu_id FROM sys_menu WHERE menu_code=$1',[EGG_SOURCE_MENU]);
  const legacy = grants.find(grant=>grant.menu_id===menu?.menu_id);
  const [before] = menu ? await manager.query(`SELECT perm_codes,scope_type,scope_value FROM ${table}
    WHERE ${key}=$1 AND menu_id=$2`,[id,menu.menu_id]) : [];
  const codes = (value:string) => value.split(',').sort().join(',');
  const changed = !!legacy && (codes(legacy.perm_codes)!==codes(before?.perm_codes??'')
    || legacy.warehouse_code!==undefined && (before?.scope_type!=='WAREHOUSE' || before.scope_value!==legacy.warehouse_code));
  if (changed && before && legacy?.legacy_digest!==legacyEggGrantDigest(before)) {
    throw new ConflictException('旧单授权已变化，请重新读取');
  }
  const admin = changed ? await requireEggSourceAdministrator(manager,actor) : undefined;
  if (legacy && !legacy.perm_codes && !before) grants=grants.filter(grant=>grant!==legacy);
  const ids = grants.map(grant => grant.menu_id);
  if (kind === 'role') await manager.query("SELECT set_config('phoenix.egg_source_role_editor', '1', true)");
  await manager.query(`DELETE FROM ${table} WHERE ${key}=$1 AND NOT (menu_id=ANY($2::bigint[]))
    AND menu_id IS DISTINCT FROM $3::bigint AND NULLIF(deny_codes,'') IS NULL AND NULLIF(scope_type,'') IS NULL AND NULLIF(scope_value,'') IS NULL`, [id, ids, menu?.menu_id??null]);
  await manager.query(`UPDATE ${table} SET perm_codes='' WHERE ${key}=$1 AND NOT (menu_id=ANY($2::bigint[]))
    AND menu_id IS DISTINCT FROM $3::bigint AND perm_codes IS DISTINCT FROM ''`, [id, ids, menu?.menu_id??null]);
  const written: { menu_id: string }[] = await manager.query(`
    INSERT INTO ${table} (${key},menu_id,perm_codes,scope_type,scope_value)
    SELECT $1,item.menu_id,item.perm_codes,CASE WHEN warehouse_code IS NOT NULL THEN 'WAREHOUSE' END,warehouse_code
    FROM jsonb_to_recordset($2::jsonb) item(menu_id bigint,perm_codes text,warehouse_code text)
    ON CONFLICT (${key},menu_id) DO UPDATE SET perm_codes=EXCLUDED.perm_codes,
      scope_type=COALESCE(EXCLUDED.scope_type,${table}.scope_type),scope_value=COALESCE(EXCLUDED.scope_value,${table}.scope_value)
    RETURNING menu_id`, [id, JSON.stringify(grants)]);
  const invalid = await manager.query(`SELECT 1 FROM ${table} p JOIN sys_menu m USING(menu_id)
    WHERE p.${key}=$1 AND m.menu_code=$2 AND string_to_array(p.perm_codes,',') && ARRAY['E','A']
      AND (p.scope_type IS NULL OR p.scope_type NOT IN ('WAREHOUSE','FARM') OR NULLIF(p.scope_value,'') IS NULL)`,[id,EGG_SOURCE_MENU]);
  if (invalid.length) throw new BadRequestException('配置蛋品来源申请或审核时，须指定目标仓范围');
  if (admin) await auditEggSourcePermissionChange(manager,admin,'EGG_SOURCE_LEGACY_GRANT',id,{kind,before,legacy});
  return written.length;
}
