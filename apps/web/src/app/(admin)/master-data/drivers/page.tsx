"use client";
import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel } from "@/components/master-data/MasterDataRuntimePanel";
import { MasterDataDetailDrawer } from "@/components/master-data/MasterDataDetailDrawer";
import { driverConfig } from "@/components/master-data/detail-configs";

/**
 * UIX-9A — 司机中心（接入 MasterDataDetailDrawer）
 */
export default function DriverRuntimePage() {
  const [detailCode, setDetailCode] = useState<string | null>(null);
  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px", maxWidth: 1200 }}>
      <PageHeader title="司机档案" subtitle="销售/配送司机主档 · 生命周期管控 · 点击姓名查看司机中心" breadcrumb={["主数据中心", "司机档案"]} />
      <MasterDataRuntimePanel
        type="driver"
        title="司机"
        codeKey="driver_name"
        nameKey="driver_name"
        onCodeClick={(code) => setDetailCode(code)}
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
      <MasterDataDetailDrawer
        open={detailCode !== null}
        code={detailCode}
        config={driverConfig}
        onClose={() => setDetailCode(null)}
      />
    </div>
  );
}
