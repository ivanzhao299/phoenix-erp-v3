"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel } from "@/components/master-data/MasterDataRuntimePanel";
import { MasterDataCenterStrip } from "@/components/master-data/MasterDataCenterStrip";
import { MasterDataDetailDrawer } from "@/components/master-data/MasterDataDetailDrawer";
import { supplierConfig } from "@/components/master-data/detail-configs";
import { useLanguage } from "@/contexts/LanguageContext";
import { SUPPLIER_FIELDS } from "./_fields";

/**
 * 主数据中心 — 供应商主数据 Runtime（G3-A + UIX-7 产品化）
 * g200p-2:新增/编辑改路由全屏页(14 字段超抽屉合理容量)
 * 点击编码 → 供应商中心 detail drawer（采购/AP/审计/引用聚合）
 */

export default function SupplierRuntimePage() {
  const { t } = useLanguage();
  const router = useRouter();
  const [detailCode, setDetailCode] = useState<string | null>(null);
  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px" }}>
      <PageHeader title={t('md.supplierCenter', '供应商中心')} subtitle={t('md.supplierCenterSub', '供应商运营态势 · 采购协作 · 应付风险 · 点击编码查看供应商全景')} breadcrumb={[t('md.center', '主数据中心'), t('md.supplierCenter', '供应商中心')]} />
      <MasterDataCenterStrip type="supplier" />
      <MasterDataRuntimePanel
        type="supplier"
        title={t('md.supplier', '供应商')}
        codeKey="supplier_code"
        nameKey="supplier_name"
        mode="page"
        pageRoutePrefix="/master-data/suppliers"
        onCodeClick={(code) => router.push("/master-data/suppliers/" + encodeURIComponent(code))}
        fields={SUPPLIER_FIELDS}
        columns={[
          { key: "supplier_name", label: t('md.supplierName', '供应商名称') },
          { key: "supplier_type", label: t('md.type', '类型'), displayKind: "supplierType" },
          { key: "country_code", label: t('md.country', '国家') },
          { key: "contact_name", label: t('md.contactName', '联系人') },
          { key: "default_currency", label: t('md.currency', '币种') },
        ]}
      />
      <MasterDataDetailDrawer
        open={detailCode !== null}
        code={detailCode}
        config={supplierConfig}
        onClose={() => setDetailCode(null)}
      />
    </div>
  );
}
