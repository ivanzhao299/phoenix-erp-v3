"use client";
import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel } from "@/components/master-data/MasterDataRuntimePanel";
import { MasterDataDetailDrawer } from "@/components/master-data/MasterDataDetailDrawer";
import { vehicleConfig } from "@/components/master-data/detail-configs";

/**
 * UIX-9A — 车辆中心（接入 MasterDataDetailDrawer）
 */
export default function VehicleRuntimePage() {
  const [detailCode, setDetailCode] = useState<string | null>(null);
  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px", maxWidth: 1200 }}>
      <PageHeader title="车辆档案" subtitle="销售/配送车辆主档 · 生命周期管控 · 点击车牌查看车辆中心" breadcrumb={["主数据中心", "车辆档案"]} />
      <MasterDataRuntimePanel
        type="vehicle"
        title="车辆"
        codeKey="vehicle_no"
        nameKey="vehicle_no"
        onCodeClick={(code) => setDetailCode(code)}
        fields={[
          { key: "vehicle_no", label: "车辆编号", required: true, readOnlyOnEdit: true },
          { key: "plate_no", label: "车牌号" },
          { key: "vehicle_type", label: "车辆类型", type: "select", options: [
            { value: "TRUCK", label: "卡车" }, { value: "VAN", label: "面包车" },
            { value: "PICKUP", label: "皮卡" }, { value: "REFRIGERATED", label: "冷藏车" },
          ] },
          { key: "capacity", label: "载重（kg）", type: "number" },
          { key: "company_code", label: "所属公司编码" },
          { key: "effective_date", label: "生效日期", type: "date" },
          { key: "expire_date", label: "失效日期", type: "date" },
        ]}
        columns={[
          { key: "plate_no", label: "车牌" },
          { key: "vehicle_type", label: "类型" },
          { key: "capacity", label: "载重" },
          { key: "company_code", label: "公司" },
        ]}
      />
      <MasterDataDetailDrawer
        open={detailCode !== null}
        code={detailCode}
        config={vehicleConfig}
        onClose={() => setDetailCode(null)}
      />
    </div>
  );
}
