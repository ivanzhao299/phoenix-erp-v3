"use client";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel } from "@/components/master-data/MasterDataRuntimePanel";

/**
 * G5.5-C — 仓库档案（Runtime 化）
 * 原 138 行自建页 → Panel 委托；统一编码 WH-XXXX + 5 态生命周期 + Workflow
 */
export default function WarehouseRuntimePage() {
  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px", maxWidth: 1200 }}>
      <PageHeader title="仓库档案" subtitle="WMS 仓库主档 · 编码自动生成 · 生命周期管控 · WarehouseScope 数据源" breadcrumb={["主数据中心", "仓库档案"]} />
      <MasterDataRuntimePanel
        type="warehouse"
        title="仓库"
        codeKey="warehouse_code"
        nameKey="warehouse_name"
        fields={[
          { key: "warehouse_name", label: "仓库名称（英）", required: true },
          { key: "warehouse_name_zh", label: "仓库名称（中文）" },
          { key: "type", label: "仓库类型", type: "select", options: [
            { value: "FACTORY", label: "工厂仓" }, { value: "DISTRIBUTION", label: "配送仓" },
            { value: "RETAIL", label: "门店仓" }, { value: "TRANSIT", label: "中转仓" },
            { value: "COLD", label: "冷库" }, { value: "QUARANTINE", label: "隔离仓" },
          ] },
          { key: "company_code", label: "所属公司编码" },
          { key: "manager", label: "仓库经理（用户名）" },
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
    </div>
  );
}
