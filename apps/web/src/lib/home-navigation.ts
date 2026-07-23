export type HomeNavigationPermissionChecker = (menuCode?: string | null, permCode?: string) => boolean;
export type HomeNavigationGroupPathResolver = (groupId: string) => string | undefined;

export const PROCUREMENT_DASHBOARD_PATH = "/procurement2/dashboard";
export const PROCUREMENT_DASHBOARD_PERMISSION = "MENU_PRC2_DASHBOARD";
export const HOME_TODO_PATH = "/workflow/todos";
export const HOME_QUALITY_PATH = "/data-quality";

export type HomeHeroMetric = "todo" | "overdue" | "highAlert";

export function resolveHomeHeroMetricHref(
  metric: HomeHeroMetric,
  hasPermission: HomeNavigationPermissionChecker,
): string | undefined {
  if (metric === "highAlert") {
    return hasPermission("MENU_MD_QUALITY", "V") ? HOME_QUALITY_PATH : undefined;
  }
  return hasPermission("MENU_WORKFLOW_TODO", "V") ? HOME_TODO_PATH : undefined;
}

export function resolveProcurementCenterHref(
  hasPermission: HomeNavigationPermissionChecker,
  resolveGroupPath: HomeNavigationGroupPathResolver,
): string | undefined {
  if (hasPermission(PROCUREMENT_DASHBOARD_PERMISSION, "V")) return PROCUREMENT_DASHBOARD_PATH;
  return resolveGroupPath("procurement");
}
