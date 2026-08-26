import { describe, expect, it } from "vitest";
import { mappedPickValue } from "./selector-pick";

describe("mappedPickValue", () => {
  it("keeps a non-applicable SKU material code empty instead of copying the label", () => {
    const sku = {
      label: "1号蛋 36枚/托（SKU-1-TRAY36 · 产成品 · 枚）",
      raw: { itemType: "SKU", materialCode: null, skuCode: "SKU-1-TRAY36" },
    };

    expect(mappedPickValue(sku, "materialCode")).toBe("");
    expect(mappedPickValue(sku, "skuCode")).toBe("SKU-1-TRAY36");
  });
});
