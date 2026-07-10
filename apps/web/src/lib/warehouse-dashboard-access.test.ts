import { describe, expect, it } from "vitest";
import { getWarehouseDashboardAccess } from "./warehouse-dashboard-access";

function checker(entries: string[]) {
  return (menuCode?: string | null, permCode?: string) => {
    if (!menuCode) return true;
    if (entries.includes("*")) return true;
    const entry = entries.find(p => p.startsWith(`${menuCode}:`));
    if (!entry) return false;
    if (!permCode) return true;
    const granted = new Set(entry.split(":")[1]?.split(",").map(s => s.trim()) ?? []);
    return permCode.split(",").map(s => s.trim()).filter(Boolean).every(code => granted.has(code));
  };
}

describe("getWarehouseDashboardAccess", () => {
  it("loads all read-only dashboard data for MENU_WMS_VIEW-only users", () => {
    expect(getWarehouseDashboardAccess(checker(["MENU_WMS_VIEW:V"]))).toEqual({
      canViewWarehouse: true,
      canViewInout: false,
      canLoadZones: true,
      canLoadInbounds: true,
      canLoadOutbounds: true,
      canLoadBatches: true,
    });
  });

  it("does not load dashboard data when the warehouse overview itself is not visible", () => {
    expect(getWarehouseDashboardAccess(checker(["MENU_WMS_INOUT:V"]))).toEqual({
      canViewWarehouse: false,
      canViewInout: true,
      canLoadZones: false,
      canLoadInbounds: false,
      canLoadOutbounds: false,
      canLoadBatches: false,
    });
  });

  it("loads all dashboard datasets for users with both WMS view and inout view", () => {
    expect(getWarehouseDashboardAccess(checker(["MENU_WMS_VIEW:V", "MENU_WMS_INOUT:V"]))).toEqual({
      canViewWarehouse: true,
      canViewInout: true,
      canLoadZones: true,
      canLoadInbounds: true,
      canLoadOutbounds: true,
      canLoadBatches: true,
    });
  });
});
