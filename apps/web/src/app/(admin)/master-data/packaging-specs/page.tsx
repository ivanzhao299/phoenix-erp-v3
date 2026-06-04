"use client";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel } from "@/components/master-data/MasterDataRuntimePanel";

/**
 * G5.5-C — 包装规格（Runtime 化）
 * 原 214 行自建页 → Panel 委托；统一编码 SPEC-XXXX + 5 态生命周期 + Workflow
 */
export default function PackagingSpecRuntimePage() {
  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px", maxWidth: 1200 }}>
      <PageHeader title="包装规格" subtitle="包装规格主档 · 编码自动生成 · SKU 三键之一" breadcrumb={["主数据中心", "包装规格"]} />
      <MasterDataRuntimePanel
        type="spec"
        title="规格"
        codeKey="spec_code"
        nameKey="spec_name"
        fields={[
          { key: "spec_name", label: "规格名称", required: true },
          { key: "unit_count", label: "单位数量（如 30 枚/盒）", type: "number" },
          { key: "pack_type", label: "包装类型", type: "select", options: [
            { value: "BOX", label: "纸盒" }, { value: "PLASTIC", label: "塑料盒" },
            { value: "TRAY", label: "托盘" }, { value: "BAG", label: "袋装" }, { value: "BULK", label: "散装" },
          ] },
          { key: "effective_date", label: "生效日期", type: "date" },
          { key: "expire_date", label: "失效日期", type: "date" },
          { key: "remark", label: "备注" },
        ]}
        columns={[
          { key: "spec_name", label: "规格名称" },
          { key: "unit_count", label: "单位数" },
          { key: "pack_type", label: "包装类型" },
        ]}
      />
    </div>
  );
}
