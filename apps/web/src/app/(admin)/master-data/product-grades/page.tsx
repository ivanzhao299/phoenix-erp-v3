"use client";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel } from "@/components/master-data/MasterDataRuntimePanel";

/**
 * G5.5-C — 产品等级（Runtime 化）
 * 原 216 行自建页 → Panel 委托；统一编码 GRD-XXX + 5 态生命周期 + Workflow
 */
export default function ProductGradeRuntimePage() {
  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px", maxWidth: 1200 }}>
      <PageHeader title="产品等级" subtitle="蛋品/物料等级主档 · 编码自动生成 · SKU 三键之一" breadcrumb={["主数据中心", "产品等级"]} />
      <MasterDataRuntimePanel
        type="grade"
        title="等级"
        codeKey="grade_code"
        nameKey="grade_name"
        fields={[
          { key: "grade_name", label: "等级名称", required: true },
          { key: "sort_order", label: "排序", type: "number" },
          { key: "effective_date", label: "生效日期", type: "date" },
          { key: "expire_date", label: "失效日期", type: "date" },
          { key: "remark", label: "备注" },
        ]}
        columns={[
          { key: "grade_name", label: "等级名称" },
          { key: "sort_order", label: "排序" },
        ]}
      />
    </div>
  );
}
