"use client";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel } from "@/components/master-data/MasterDataRuntimePanel";

/**
 * G5.5-C — 司机档案（Runtime 化）
 * 原 151 行自建页 → Panel 委托；统一 5 态生命周期 + Workflow
 * 司机用 driver_name 作 codeKey（业务约定）
 */
export default function DriverRuntimePage() {
  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px", maxWidth: 1200 }}>
      <PageHeader title="司机档案" subtitle="销售/配送司机主档 · 生命周期管控 · 配送单引用源" breadcrumb={["主数据中心", "司机档案"]} />
      <MasterDataRuntimePanel
        type="driver"
        title="司机"
        codeKey="driver_name"
        nameKey="driver_name"
        fields={[
          { key: "driver_name", label: "司机姓名", required: true, readOnlyOnEdit: true },
          { key: "phone", label: "联系电话" },
          { key: "license_no", label: "驾照号" },
          { key: "company_code", label: "所属公司编码" },
          { key: "effective_date", label: "生效日期", type: "date" },
          { key: "expire_date", label: "失效日期", type: "date" },
        ]}
        columns={[
          { key: "phone", label: "电话" },
          { key: "license_no", label: "驾照" },
          { key: "company_code", label: "公司" },
        ]}
      />
    </div>
  );
}
