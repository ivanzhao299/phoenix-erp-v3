export type HomeNavigationPermissionChecker = (menuCode?: string | null, permCode?: string) => boolean;
export type HomeNavigationGroupPathResolver = (groupId: string) => string | undefined;

export const PROCUREMENT_DASHBOARD_PATH = "/procurement2/dashboard";
export const PROCUREMENT_DASHBOARD_PERMISSION = "MENU_PRC2_DASHBOARD";

export function resolveProcurementCenterHref(
  hasPermission: HomeNavigationPermissionChecker,
  resolveGroupPath: HomeNavigationGroupPathResolver,
): string | undefined {
  if (hasPermission(PROCUREMENT_DASHBOARD_PERMISSION, "V")) return PROCUREMENT_DASHBOARD_PATH;
  return resolveGroupPath("procurement");
}
