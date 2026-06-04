"use client";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel } from "@/components/master-data/MasterDataRuntimePanel";

/**
 * G5.5-C — 车辆档案（Runtime 化）
 * 原 141 行自建页 → Panel 委托；统一 5 态生命周期 + Workflow
 */
export default function VehicleRuntimePage() {
  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px", maxWidth: 1200 }}>
      <PageHeader title="车辆档案" subtitle="销售/配送车辆主档 · 生命周期管控 · 配送单引用源" breadcrumb={["主数据中心", "车辆档案"]} />
      <MasterDataRuntimePanel
        type="vehicle"
        title="车辆"
        codeKey="vehicle_no"
        nameKey="vehicle_no"
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
    </div>
  );
}
