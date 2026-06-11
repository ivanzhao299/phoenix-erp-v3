"use client";
import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel } from "@/components/master-data/MasterDataRuntimePanel";
import { MasterDataCenterStrip } from "@/components/master-data/MasterDataCenterStrip";
import { MasterDataDetailDrawer } from "@/components/master-data/MasterDataDetailDrawer";
import { warehouseConfig } from "@/components/master-data/detail-configs";

/**
 * 仓库档案 + UIX-8 仓库中心 detail（库存/批次/可用率聚合）
 */
export default function WarehouseRuntimePage() {
  const [detailCode, setDetailCode] = useState<string | null>(null);
  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px" }}>
      <PageHeader title="仓库中心" subtitle="仓储节点 · 在库批次 · 可用率 · 点击编码查看仓库全景" breadcrumb={["主数据中心", "仓库中心"]} />
      <MasterDataCenterStrip type="warehouse" />
      <MasterDataRuntimePanel
        type="warehouse"
        title="仓库"
        codeKey="warehouse_code"
        nameKey="warehouse_name"
        onCodeClick={(code) => setDetailCode(code)}
        fields={[
          { key: "warehouse_name", label: "仓库名称（英）", required: true },
          { key: "warehouse_name_zh", label: "仓库名称（中文）" },
          { key: "type", label: "仓库类型", type: "select", options: [
            { value: "FACTORY", label: "工厂仓" }, { value: "DISTRIBUTION", label: "配送仓" },
            { value: "RETAIL", label: "门店仓" }, { value: "TRANSIT", label: "中转仓" },
            { value: "COLD", label: "冷库" }, { value: "QUARANTINE", label: "隔离仓" },
          ] },
          { key: "company_code", label: "所属公司", type: "company", onPickKeys: { company_name: "org_name" } },
          { key: "manager", label: "仓库经理", type: "user" },
          { key: "effective_date", label: "生效日期", type: "date" },
          { key: "expire_date", label: "失效日期", type: "date" },
          { key: "remark", label: "备注" },
        ]}
        columns={[
          { key: "warehouse_name", label: "仓库名称（英）" },
          { key: "warehouse_name_zh", label: "中文名" },
          { key: "type", label: "类型" },
          { key: "company_code", label: "公司" },
        ]}
      />
      <MasterDataDetailDrawer
        open={detailCode !== null}
        code={detailCode}
        config={warehouseConfig}
        onClose={() => setDetailCode(null)}
      />
    </div>
  );
}
