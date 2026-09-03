"use client";
import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel } from "@/components/master-data/MasterDataRuntimePanel";
import { MasterDataCenterStrip } from "@/components/master-data/MasterDataCenterStrip";
import { MasterDataDetailDrawer } from "@/components/master-data/MasterDataDetailDrawer";
import { vehicleConfig } from "@/components/master-data/detail-configs";
import { useLanguage } from "@/contexts/LanguageContext";

/**
 * UIX-9A — 车辆中心（接入 MasterDataDetailDrawer）
 */
export default function VehicleRuntimePage() {
  const { t } = useLanguage();
  const [detailCode, setDetailCode] = useState<string | null>(null);
  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px" }}>
      <PageHeader title={t('md.vehicleCenter', '车辆中心')} subtitle={t('md.vehicleCenterSub', '销售/配送车辆 · 利用率 · 关联订单 · 点击车牌查看车辆全景')} breadcrumb={[t('md.center', '主数据中心'), t('md.vehicleCenter', '车辆中心')]} />
      <MasterDataCenterStrip type="vehicle" />
      <MasterDataRuntimePanel
        type="vehicle"
        title={t('md.vehicle', '车辆')}
        codeKey="vehicle_no"
        nameKey="vehicle_no"
        onCodeClick={(code) => setDetailCode(code)}
        fields={[
          { key: "vehicle_no", label: t('md.vehicleNo', '车辆编号'), required: true, readOnlyOnEdit: true },
          { key: "plate_no", label: t('md.plateNo', '车牌号') },
          { key: "vehicle_type", label: t('md.vehicleType', '车辆类型'), type: "select", displayKind: "vehicleType", options: [
            { value: "TRUCK", label: t('md.vehTruck', '卡车') }, { value: "VAN", label: t('md.vehVan', '面包车') },
            { value: "PICKUP", label: t('md.vehPickup', '皮卡') }, { value: "REFRIGERATED", label: t('md.vehRefrigerated', '冷藏车') },
          ] },
          { key: "capacity", label: t('md.capacityKg', '载重（kg）'), type: "number" },
          { key: "company_code", label: t('md.belongCompany', '所属公司'), type: "company" },
        ]}
        columns={[
          { key: "plate_no", label: t('md.plate', '车牌') },
          { key: "vehicle_type", label: t('md.type', '类型'), displayKind: "vehicleType" },
          { key: "capacity", label: t('md.capacity', '载重') },
          { key: "company_code", label: t('md.company', '公司'), displayKind: "company" },
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
