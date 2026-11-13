import { describe, expect, it } from "vitest";
import { mappedPickValue, omitEmptyIdentityFields } from "./selector-pick";

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

describe("omitEmptyIdentityFields", () => {
  it("strips empty/whitespace identity keys so material lines reach the backend legacy path", () => {
    const payload = omitEmptyIdentityFields({
      item: "MAT-VET-NDV", item_type: "MATERIAL", sku_code: "", material_code: "  ", product_code: "MAT-VET-NDV", qty: 10,
    });
    expect(payload).toEqual({ item: "MAT-VET-NDV", item_type: "MATERIAL", product_code: "MAT-VET-NDV", qty: 10 });
    expect(JSON.parse(JSON.stringify(payload))).not.toHaveProperty("sku_code");
  });

  it("keeps real SKU codes and non-identity fields untouched", () => {
    const payload = omitEmptyIdentityFields({ sku_code: "SKU-EGG-A-30", remark: "", qty: 2 });
    expect(payload).toEqual({ sku_code: "SKU-EGG-A-30", remark: "", qty: 2 });
  });
});
