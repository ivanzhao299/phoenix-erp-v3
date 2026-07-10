export type WarehousePermissionChecker = (menuCode?: string | null, permCode?: string) => boolean;

export type WarehouseDashboardAccess = {
  canViewWarehouse: boolean;
  canViewInout: boolean;
  canLoadZones: boolean;
  canLoadInbounds: boolean;
  canLoadOutbounds: boolean;
  canLoadBatches: boolean;
};

export function getWarehouseDashboardAccess(hasPermission: WarehousePermissionChecker): WarehouseDashboardAccess {
  const canViewWarehouse = hasPermission("MENU_WMS_VIEW", "V");
  const canViewInout = hasPermission("MENU_WMS_INOUT", "V");

  return {
    canViewWarehouse,
    canViewInout,
    canLoadZones: canViewWarehouse,
    canLoadInbounds: canViewWarehouse,
    canLoadOutbounds: canViewWarehouse,
    canLoadBatches: canViewWarehouse,
  };
}
