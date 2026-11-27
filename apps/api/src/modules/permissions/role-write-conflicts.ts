import { BadRequestException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { EGG_SOURCE_MENU } from '../../auth/egg-source-permissions';
import type { SysRoleConflictEntity } from './entities/sys-role-conflict.entity';

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


export async function writeMenusForRoles(manager: EntityManager, roleIds: readonly (string|number)[]) {
  if (!roleIds.length) return new Map<string, string[]>();
  const rows: {role_id:string;menu_code:string}[] = await manager.query(`
    SELECT p.role_id::text,m.menu_code FROM sys_role_menu_permission p JOIN sys_menu m USING(menu_id)
    WHERE p.role_id=ANY($1::bigint[]) AND regexp_split_to_array(upper(btrim(p.perm_codes)), '[[:space:]]*,[[:space:]]*') && ARRAY['*','C','E','D','A']
    UNION
    SELECT rs.role_id::text,m.menu_code FROM sys_role_permission_set rs JOIN sys_permission_set_item p USING(set_id)
      JOIN sys_menu m USING(menu_id)
    WHERE rs.role_id=ANY($1::bigint[]) AND regexp_split_to_array(upper(btrim(p.perm_codes)), '[[:space:]]*,[[:space:]]*') && ARRAY['*','C','E','D','A']
    UNION
    SELECT r.role_id::text,$2 FROM sys_role r JOIN md_egg_source_effective_grants g
      ON g.role_id=r.role_id OR g.set_id IN (SELECT set_id FROM sys_role_permission_set WHERE role_id=r.role_id)
    WHERE r.role_id=ANY($1::bigint[]) AND g.actions && ARRAY['C','E','A']::text[]
    ORDER BY 1,2`, [roleIds, EGG_SOURCE_MENU]);
  const result = new Map<string, string[]>();
  for (const {role_id,menu_code} of rows) {
    const menus=result.get(role_id)??[];
    menus.push(menu_code);
    result.set(role_id,menus);
  }
  return result;
}

export async function assertNoNewRoleConflicts(manager: EntityManager, roleIds: readonly (string|number)[], before: Map<string,string[]>) {
  if (!roleIds.length) return;
  const after=await writeMenusForRoles(manager,roleIds);
  const rules: SodRule[]=await manager.query('SELECT menu_a,menu_b,severity FROM sys_role_conflict');
  for (const id of roleIds) {
    const added=newlyIntroducedBlockingConflicts(before.get(String(id))??[],after.get(String(id))??[],rules);
    if (added.length) throw new BadRequestException(
      `新增 BLOCK 岗位分离冲突，无法保存：${added.map(rule=>`${rule.menu_a}↔${rule.menu_b}`).join('、')}`,
    );
  }
}
