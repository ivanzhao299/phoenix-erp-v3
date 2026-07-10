import { describe, expect, it } from 'vitest';
import { getHomeFarmKpiRequestPlan, type HomePermissionChecker } from './home-request-plan';

function checker(grants: string[]): HomePermissionChecker {
  return (menuCode, permCode = 'V') => grants.includes(`${menuCode}:${permCode}`);
}

describe('getHomeFarmKpiRequestPlan', () => {
  it('does not plan the optional IoT summary request for dashboard-only finance users', () => {
    expect(getHomeFarmKpiRequestPlan(checker(['MENU_DASHBOARD:V', 'MENU_FIN2_REPORT:V']))).toEqual({
      shouldLoadFarmKpi: false,
      shouldLoadIotSummary: false,
    });
  });

  it('keeps farm KPI loading while skipping IoT summary without device-monitor permission', () => {
    expect(getHomeFarmKpiRequestPlan(checker(['MENU_DASHBOARD:V', 'MENU_FARM_DATA:V']))).toEqual({
      shouldLoadFarmKpi: true,
      shouldLoadIotSummary: false,
    });
  });

  it('plans IoT summary only when farm KPI and device-monitor permissions are both present', () => {
    expect(getHomeFarmKpiRequestPlan(checker(['MENU_FARM_DATA:V', 'MENU_DEVICE_MONITOR:V']))).toEqual({
      shouldLoadFarmKpi: true,
      shouldLoadIotSummary: true,
    });
  });
});
