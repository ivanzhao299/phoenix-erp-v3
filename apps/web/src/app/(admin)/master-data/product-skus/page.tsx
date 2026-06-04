"use client";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel } from "@/components/master-data/MasterDataRuntimePanel";

/**
 * G5.5-C — SKU 档案（Runtime 化）
 * 原 273 行自建页 → Panel 委托；统一编码 SKU-XXXXXX + 5 态生命周期 + Workflow
 * SKU = product_code + grade_code + spec_code 的唯一组合（业务引用 10 处）
 */
export default function SkuRuntimePage() {
  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px", maxWidth: 1200 }}>
      <PageHeader title="SKU 档案" subtitle="物料 SKU 主档 · 编码自动生成 · 生命周期管控 · 全链路单据物料统一引用源" breadcrumb={["主数据中心", "SKU 档案"]} />
      <MasterDataRuntimePanel
        type="sku"
        title="SKU"
        codeKey="sku_code"
        nameKey="sku_name"
        fields={[
          { key: "sku_name", label: "SKU 名称", required: true },
          { key: "product_code", label: "产品编码", required: true },
          { key: "product_name", label: "产品名称" },
          { key: "grade_code", label: "等级编码", required: true },
          { key: "spec_code", label: "规格编码", required: true },
          { key: "barcode", label: "条码" },
          { key: "effective_date", label: "生效日期", type: "date" },
          { key: "expire_date", label: "失效日期", type: "date" },
          { key: "remark", label: "备注" },
        ]}
        columns={[
          { key: "sku_name", label: "SKU 名称" },
          { key: "product_code", label: "产品" },
          { key: "grade_code", label: "等级" },
          { key: "spec_code", label: "规格" },
          { key: "barcode", label: "条码" },
        ]}
      />
    </div>
  );
}
