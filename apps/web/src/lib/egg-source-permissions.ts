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
