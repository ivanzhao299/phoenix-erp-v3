"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel } from "@/components/master-data/MasterDataRuntimePanel";
import { MasterDataDetailDrawer } from "@/components/master-data/MasterDataDetailDrawer";
import { MasterDataCenterStrip } from "@/components/master-data/MasterDataCenterStrip";
import { customerConfig } from "@/components/master-data/detail-configs";
import { useLanguage } from "@/contexts/LanguageContext";
import { CUSTOMER_FIELDS } from "./_fields";

/**
 * 主数据中心 — 客户主数据 Runtime（G3-A + UIX-7 产品化）
 * g200p:新增/编辑改为路由式全屏页(12 字段超抽屉合理容量);列表 + 流程不变。
 * 编码 CUS-00001 自动生成；生命周期统一。
 * UIX-7：点击客户编码 → 客户中心 detail drawer（订单/AR/审批/引用聚合）
 */

export default function CustomerRuntimePage() {
  const { t } = useLanguage();
  const router = useRouter();
  const [detailCode, setDetailCode] = useState<string | null>(null);
  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px" }}>
      <PageHeader title={t('md.customerCenter', '客户中心')} subtitle={t('md.customerCenterSub', '客户运营态势 · 业务关系 · 应收风险 · 点击编码查看客户全景')} breadcrumb={[t('md.center', '主数据中心'), t('md.customerCenter', '客户中心')]} />
      <MasterDataCenterStrip type="customer" />
      <MasterDataRuntimePanel
        type="customer"
        title={t('md.customer', '客户')}
        codeKey="customer_no"
        nameKey="customer_name"
        mode="page"
        pageRoutePrefix="/master-data/customers"
        onCodeClick={(code) => router.push("/master-data/customers/" + encodeURIComponent(code))}
        fields={CUSTOMER_FIELDS}
        columns={[
          { key: "customer_name", label: t('md.customerName', '客户名称') },
          { key: "customer_type", label: t('md.type', '类型') },
          { key: "company_code", label: t('md.company', '公司') },
          { key: "contact_name", label: t('md.contactName', '联系人') },
          { key: "contact_phone", label: t('md.phone', '电话') },
        ]}
      />
      <MasterDataDetailDrawer
        open={detailCode !== null}
        code={detailCode}
        config={customerConfig}
        onClose={() => setDetailCode(null)}
      />
    </div>
  );
}
