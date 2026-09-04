"use client";
import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel } from "@/components/master-data/MasterDataRuntimePanel";
import { MasterDataCenterStrip } from "@/components/master-data/MasterDataCenterStrip";
import { MasterDataDetailDrawer } from "@/components/master-data/MasterDataDetailDrawer";
import { warehouseConfig } from "@/components/master-data/detail-configs";
import { useLanguage } from "@/contexts/LanguageContext";

/**
 * 仓库档案 + UIX-8 仓库中心 detail（库存/批次/可用率聚合）
 */
export default function WarehouseRuntimePage() {
  const { t } = useLanguage();
  const [detailCode, setDetailCode] = useState<string | null>(null);
  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px" }}>
      <PageHeader title={t('md.warehouseCenter', '仓库中心')} subtitle={t('md.warehouseCenterSub', '仓储节点 · 在库批次 · 可用率 · 点击编码查看仓库全景')} breadcrumb={[t('md.center', '主数据中心'), t('md.warehouseCenter', '仓库中心')]} />
      <MasterDataCenterStrip type="warehouse" />
      <MasterDataRuntimePanel
        type="warehouse"
        title={t('md.warehouse', '仓库')}
        codeKey="warehouse_code"
        nameKey="warehouse_name"
        onCodeClick={(code) => setDetailCode(code)}
        fields={[
          { key: "warehouse_name", label: t('md.warehouseNameEn', '仓库名称（英）'), required: true },
          { key: "warehouse_name_zh", label: t('md.warehouseNameZh', '仓库名称（中文）') },
          { key: "type", label: t('md.warehouseUsageType', '库存用途'), dictType: "WMS_WAREHOUSE_USAGE_TYPE", required: true },
          { key: "facility_class", label: t('md.warehouseFacilityClass', '设施类别'), dictType: "WMS_WAREHOUSE_FACILITY_CLASS", required: true },
          { key: "capability", label: t('md.warehouseCapability', '仓库能力'), dictType: "WMS_WAREHOUSE_CAPABILITY" },
          { key: "domain", label: t('md.warehouseDomain', '领域身份'), type: "readonly" },
          { key: "company_code", label: t('md.belongCompany', '所属公司'), type: "company", onPickKeys: { company_name: "org_name" } },
          { key: "manager", label: t('md.warehouseManager', '仓库经理'), type: "user" },
          { key: "effective_date", label: t('md.effectiveDate', '生效日期'), type: "date" },
          { key: "expire_date", label: t('md.expireDate', '失效日期'), type: "date" },
          { key: "remark", label: t('md.remark', '备注') },
        ]}
        columns={[
          { key: "warehouse_name", label: t('md.warehouseNameEn', '仓库名称（英）') },
          { key: "warehouse_name_zh", label: t('md.nameZh', '中文名') },
          { key: "type", label: t('md.warehouseUsageType', '库存用途') },
          { key: "facility_class", label: t('md.warehouseFacilityClass', '设施类别') },
          { key: "domain", label: t('md.warehouseDomain', '领域身份') },
          { key: "company_code", label: t('md.company', '公司'), displayKind: "company" },
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
