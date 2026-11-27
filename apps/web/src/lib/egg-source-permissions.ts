export const EGG_SOURCE_MENU = 'MENU_MD_EGG_SOURCE';

export function menuActionLabel(
  menuCode: string, action: string, fallback: string, t: (key: string, fallback: string) => string,
) {
  if (menuCode !== EGG_SOURCE_MENU) return fallback;
  switch (action) {
    case 'V': return t('eggSources.permission.V', '查看档案');
    case 'E': return t('eggSources.permission.E', '申请与提交');
    case 'A': return t('eggSources.permission.A', '审核与驳回');
    default: return fallback;
  }
}

export function legacyEggMenuChange(
  current: ReadonlySet<string> | undefined, warehouse:string, originalWarehouse:string,
  original:{codes:string; digest?:string},
) {
  const codes=[...(current??[])].sort().join(',');
  const changedWarehouse=Boolean(codes&&warehouse&&warehouse!==originalWarehouse);
  if (codes===original.codes&&!changedWarehouse) return null;
  return {menu_code:EGG_SOURCE_MENU,perm_codes:codes,
    egg_warehouse_code:changedWarehouse?warehouse:undefined,egg_legacy_digest:original.digest};
}

export function legacyEggMenuBaseline(grant?:{perm_codes:string;egg_legacy_digest?:string}) {
  return {codes:(grant?.perm_codes??'').split(',').filter(Boolean).sort().join(','),digest:grant?.egg_legacy_digest};
}
