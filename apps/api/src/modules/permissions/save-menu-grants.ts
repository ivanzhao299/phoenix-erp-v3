import { BadRequestException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { EGG_SOURCE_ACTIONS, EGG_SOURCE_MENU } from '../../auth/egg-source-permissions';

export type Grant = { menu_code: string; perm_codes: string; egg_warehouse_code?: string };
type StoredGrant = { menu_id:string; perm_codes:string; warehouse_code?:string };

export async function resolveMenuGrants(manager: EntityManager, grants: Grant[]) {
  if (!Array.isArray(grants)) throw new BadRequestException('权限明细须为数组');
  const submitted = new Map<string, Omit<StoredGrant,'menu_id'>>();
  for (const grant of grants) {
    const menu = grant?.menu_code;
    const codes = typeof grant?.perm_codes === 'string' ? grant.perm_codes.split(',').map(code => code.trim()) : [];
    const allowed = menu === EGG_SOURCE_MENU ? EGG_SOURCE_ACTIONS as readonly string[] : ['V','C','E','D','A','X','*'];
    if (typeof menu !== 'string' || !menu || submitted.has(menu) || !codes.length || codes.some(code => !allowed.includes(code))) {
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
    submitted.set(menu, {perm_codes:[...new Set(codes)].join(','),warehouse_code:warehouse});
  }
  const menus: { menu_code: string; menu_id: string }[] = await manager.query(
    'SELECT menu_code,menu_id FROM sys_menu WHERE menu_code=ANY($1::text[]) FOR SHARE', [[...submitted.keys()]]);
  if (menus.length !== submitted.size) throw new BadRequestException('存在未登记菜单，请刷新权限目录后再保存');
  return menus.map(menu => ({ menu_id: menu.menu_id, ...submitted.get(menu.menu_code)! }));
}

/** The editor owns grant codes. A row may still carry a deny or a scope when all grants are cleared. */
export async function saveMenuGrants(manager: EntityManager, kind: 'role' | 'set', id: string | number,
  grants: StoredGrant[]) {
  const table = kind === 'role' ? 'sys_role_menu_permission' : 'sys_permission_set_item';
  const key = kind === 'role' ? 'role_id' : 'set_id';
  const ids = grants.map(grant => grant.menu_id);
  await manager.query(`DELETE FROM ${table} WHERE ${key}=$1 AND NOT (menu_id=ANY($2::bigint[]))
    AND NULLIF(deny_codes,'') IS NULL AND NULLIF(scope_type,'') IS NULL AND NULLIF(scope_value,'') IS NULL`, [id, ids]);
  await manager.query(`UPDATE ${table} SET perm_codes='' WHERE ${key}=$1 AND NOT (menu_id=ANY($2::bigint[]))
    AND perm_codes IS DISTINCT FROM ''`, [id, ids]);
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
  return written.length;
}
