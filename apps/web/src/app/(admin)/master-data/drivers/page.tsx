"use client";
import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel } from "@/components/master-data/MasterDataRuntimePanel";
import { MasterDataCenterStrip } from "@/components/master-data/MasterDataCenterStrip";
import { MasterDataDetailDrawer } from "@/components/master-data/MasterDataDetailDrawer";
import { driverConfig } from "@/components/master-data/detail-configs";

/**
 * UIX-9A — 司机中心（接入 MasterDataDetailDrawer）
 */
export default function DriverRuntimePage() {
  const [detailCode, setDetailCode] = useState<string | null>(null);
  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px" }}>
      <PageHeader title="司机中心" subtitle="销售/配送司机 · 配送绩效 · 关联订单 · 点击姓名查看司机全景" breadcrumb={["主数据中心", "司机中心"]} />
      <MasterDataCenterStrip type="driver" />
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
