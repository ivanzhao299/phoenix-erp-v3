"use client";
import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel } from "@/components/master-data/MasterDataRuntimePanel";
import { MasterDataCenterStrip } from "@/components/master-data/MasterDataCenterStrip";
import { MasterDataDetailDrawer } from "@/components/master-data/MasterDataDetailDrawer";
import { storeConfig } from "@/components/master-data/detail-configs";
import { useLanguage } from "@/contexts/LanguageContext";

/**
 * UIX-9A — 门店中心（接入 MasterDataDetailDrawer）
 */
export default function StoreRuntimePage() {
  const { t } = useLanguage();
  const [detailCode, setDetailCode] = useState<string | null>(null);
  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px" }}>
      <PageHeader title={t('md.storeCenter', '门店中心')} subtitle={t('md.storeCenterSub', '直营/加盟门店 · 销售态势 · 引用单据 · 点击编码查看门店全景')} breadcrumb={[t('md.center', '主数据中心'), t('md.storeCenter', '门店中心')]} />
      <MasterDataCenterStrip type="store" />
      <MasterDataRuntimePanel
        type="store"
        title={t('md.store', '门店')}
        codeKey="store_code"
        nameKey="store_name"
        onCodeClick={(code) => setDetailCode(code)}
        fields={[
          { key: "store_name", label: t('md.storeName', '门店名称'), required: true },
          { key: "company_code", label: t('md.belongCompanyCode', '所属公司编码') },
          // G113：经营类型走字典 STORE_OP_TYPE（厂家直营/代理商自营店/代理商合作店/加盟店/合作仓）
          { key: "operation_type", label: t('md.operationType', '经营类型'), type: "select", dictType: "STORE_OP_TYPE" },
          { key: "manager", label: t('md.mainManager', '主要负责人') },
          { key: "contact", label: t('md.contactName', '联系人') },
          { key: "phone", label: t('md.contactPhone', '联系电话') },
          { key: "address", label: t('md.address', '地址') },
          { key: "effective_date", label: t('md.effectiveDate', '生效日期'), type: "date" },
          { key: "expire_date", label: t('md.expireDate', '失效日期'), type: "date" },
          { key: "remark", label: t('md.remark', '备注') },
        ]}
        columns={[
          { key: "store_name", label: t('md.storeName', '门店名称') },
          { key: "company_code", label: t('md.company', '公司') },
          { key: "operation_type", label: t('md.operationType', '经营类型') },
          { key: "manager", label: t('md.manager', '负责人') },
          { key: "contact", label: t('md.contactName', '联系人') },
          { key: "phone", label: t('md.phone', '电话') },
        ]}
      />
      <MasterDataDetailDrawer
        open={detailCode !== null}
        code={detailCode}
        config={storeConfig}
        onClose={() => setDetailCode(null)}
      />
    </div>
  );
}
