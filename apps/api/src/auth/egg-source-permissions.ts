export const EGG_SOURCE_MENU = 'MENU_MD_EGG_SOURCE';
export const EGG_SOURCE_ACTIONS = ['V', 'E', 'A'] as const;
export type EggSourcePermission = typeof EGG_SOURCE_ACTIONS[number];
