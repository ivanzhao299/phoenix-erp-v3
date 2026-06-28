"use client";
import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel } from "@/components/master-data/MasterDataRuntimePanel";
import { MasterDataCenterStrip } from "@/components/master-data/MasterDataCenterStrip";
import { MasterDataDetailDrawer } from "@/components/master-data/MasterDataDetailDrawer";
import { driverConfig } from "@/components/master-data/detail-configs";
import { useLanguage } from "@/contexts/LanguageContext";

/**
 * UIX-9A — 司机中心（接入 MasterDataDetailDrawer）
 */
export default function DriverRuntimePage() {
  const { t } = useLanguage();
  const [detailCode, setDetailCode] = useState<string | null>(null);
  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px" }}>
      <PageHeader title={t('md.driverCenter', '司机中心')} subtitle={t('md.driverCenterSub', '销售/配送司机 · 配送绩效 · 关联订单 · 点击姓名查看司机全景')} breadcrumb={[t('md.center', '主数据中心'), t('md.driverCenter', '司机中心')]} />
      <MasterDataCenterStrip type="driver" />
      <MasterDataRuntimePanel
        type="driver"
        title={t('md.driver', '司机')}
        codeKey="driver_name"
        nameKey="driver_name"
        onCodeClick={(code) => setDetailCode(code)}
        fields={[
          { key: "driver_name", label: t('md.driverName', '司机姓名'), required: true, readOnlyOnEdit: true },
          { key: "phone", label: t('md.contactPhone', '联系电话') },
          { key: "license_no", label: t('md.licenseNo', '驾照号') },
          { key: "company_code", label: t('md.belongCompanyCode', '所属公司编码') },
          { key: "effective_date", label: t('md.effectiveDate', '生效日期'), type: "date" },
          { key: "expire_date", label: t('md.expireDate', '失效日期'), type: "date" },
        ]}
        columns={[
          { key: "phone", label: t('md.phone', '电话') },
          { key: "license_no", label: t('md.license', '驾照') },
          { key: "company_code", label: t('md.company', '公司') },
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
