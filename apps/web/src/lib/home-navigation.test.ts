import { describe, expect, it } from "vitest";
import {
  HOME_QUALITY_PATH,
  HOME_TODO_PATH,
  PROCUREMENT_DASHBOARD_PATH,
  resolveHomeHeroMetricHref,
  resolveProcurementCenterHref,
  type HomeNavigationPermissionChecker,
} from "./home-navigation";

function checker(entries: string[]): HomeNavigationPermissionChecker {
  return (menuCode, permCode = "V") => !menuCode || entries.includes("*") || entries.includes(`${menuCode}:${permCode}`);
}

describe("resolveProcurementCenterHref", () => {
  it("uses the procurement dashboard when its permission exists", () => {
    expect(resolveProcurementCenterHref(checker(["MENU_PRC2_DASHBOARD:V"]), () => "/procurement2/payments"))
      .toBe(PROCUREMENT_DASHBOARD_PATH);
  });

  it("falls back to the first visible child without dashboard permission", () => {
    expect(resolveProcurementCenterHref(checker(["MENU_PRC2_PAYMENT:V"]), () => "/procurement2/payments"))
      .toBe("/procurement2/payments");
  });

  it("does not expose an inaccessible procurement route", () => {
    expect(resolveProcurementCenterHref(checker([]), () => undefined)).toBeUndefined();
  });
});

describe("resolveHomeHeroMetricHref", () => {
  it.each(["todo", "overdue"] as const)("routes an accessible %s metric to the workflow queue", metric => {
    expect(resolveHomeHeroMetricHref(metric, checker(["MENU_WORKFLOW_TODO:V"]))).toBe(HOME_TODO_PATH);
  });

  it("routes an accessible high-risk metric to data quality", () => {
    expect(resolveHomeHeroMetricHref("highAlert", checker(["MENU_MD_QUALITY:V"]))).toBe(HOME_QUALITY_PATH);
  });

  it.each(["todo", "overdue", "highAlert"] as const)("does not expose %s without its view permission", metric => {
    expect(resolveHomeHeroMetricHref(metric, checker([]))).toBeUndefined();
  });
});
