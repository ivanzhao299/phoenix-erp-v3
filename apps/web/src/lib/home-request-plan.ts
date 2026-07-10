export type HomePermissionChecker = (menuCode?: string | null, permCode?: string) => boolean;

export interface HomeFarmKpiRequestPlan {
  shouldLoadFarmKpi: boolean;
  shouldLoadIotSummary: boolean;
}

export function getHomeFarmKpiRequestPlan(hasPermission: HomePermissionChecker): HomeFarmKpiRequestPlan {
  const shouldLoadFarmKpi = hasPermission('MENU_FARM_DATA', 'V');
  return {
    shouldLoadFarmKpi,
    shouldLoadIotSummary: shouldLoadFarmKpi && hasPermission('MENU_DEVICE_MONITOR', 'V'),
  };
}
