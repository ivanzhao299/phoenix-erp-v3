import { describe, expect, it } from "vitest";
import {
  formatWarehouseZoneStatus,
  formatWarehouseZoneType,
  formatWarehouseZoneWarehouse,
} from "./warehouse-zone-display";

describe("warehouse zone display helpers", () => {
  it("shows the warehouse Chinese name with its code when a lookup label exists", () => {
    expect(
      formatWarehouseZoneWarehouse(
        "LPH_MS_EGG_FARM",
        {},
        { LPH_MS_EGG_FARM: "孟赛农场鸡蛋暂存仓" }
      )
    ).toBe("孟赛农场鸡蛋暂存仓（LPH_MS_EGG_FARM）");
  });

  it("prefers row warehouse names and falls back to the raw code", () => {
    expect(
      formatWarehouseZoneWarehouse("WH-01", { warehouse_name_zh: "一号仓" }, { "WH-01": "旧仓名" })
    ).toBe("一号仓（WH-01）");
    expect(formatWarehouseZoneWarehouse("WH-UNKNOWN", {}, {})).toBe("WH-UNKNOWN");
    expect(formatWarehouseZoneWarehouse("", {}, {})).toBe("—");
  });

  it("localizes zone type from dictionary labels before static fallbacks", () => {
    expect(formatWarehouseZoneType("NORMAL", { NORMAL: "常温库区" })).toBe("常温库区");
    expect(formatWarehouseZoneType("STAGING")).toBe("暂存区");
    expect(formatWarehouseZoneType("CUSTOM_TYPE")).toBe("CUSTOM_TYPE");
    expect(formatWarehouseZoneType("")).toBe("—");
  });

  it("localizes active and inactive status codes without hiding unknown values", () => {
    expect(formatWarehouseZoneStatus("ACTIVE")).toBe("启用");
    expect(formatWarehouseZoneStatus("INACTIVE")).toBe("停用");
    expect(formatWarehouseZoneStatus(1)).toBe("启用");
    expect(formatWarehouseZoneStatus(0)).toBe("停用");
    expect(formatWarehouseZoneStatus("ARCHIVED")).toBe("ARCHIVED");
  });
});
