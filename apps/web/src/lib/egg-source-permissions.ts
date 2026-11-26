export const EGG_SOURCE_MENU = 'MENU_MD_EGG_SOURCE';

const labels: Record<string, string> = { V: '查看档案', E: '申请与提交', A: '审核与驳回' };

export function menuActionLabel(
  menuCode: string, action: string, fallback: string, t: (key: string, fallback: string) => string,
) {
  const label = menuCode === EGG_SOURCE_MENU ? labels[action] : undefined;
  return label ? t('eggSources.permission.' + action, label) : fallback;
}
