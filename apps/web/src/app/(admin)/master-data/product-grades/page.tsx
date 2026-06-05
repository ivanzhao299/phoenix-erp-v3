"use client";
import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel } from "@/components/master-data/MasterDataRuntimePanel";
import { MasterDataCenterStrip } from "@/components/master-data/MasterDataCenterStrip";
import { MasterDataDetailDrawer } from "@/components/master-data/MasterDataDetailDrawer";
import { gradeConfig } from "@/components/master-data/detail-configs";

/**
 * UIX-9A — 等级中心（接入 MasterDataDetailDrawer）
 */
export default function ProductGradeRuntimePage() {
  const [detailCode, setDetailCode] = useState<string | null>(null);
  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px", maxWidth: 1200 }}>
      <PageHeader title="等级中心" subtitle="蛋品/物料等级 · SKU 关联 · 业务策略 · 点击编码查看等级全景" breadcrumb={["主数据中心", "等级中心"]} />
      <MasterDataCenterStrip type="grade" />
      <MasterDataRuntimePanel
        type="grade"
        title="等级"
        codeKey="grade_code"
        nameKey="grade_name"
        onCodeClick={(code) => setDetailCode(code)}
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
      <MasterDataDetailDrawer
        open={detailCode !== null}
        code={detailCode}
        config={gradeConfig}
        onClose={() => setDetailCode(null)}
      />
    </div>
  );
}
