"use client";
import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel } from "@/components/master-data/MasterDataRuntimePanel";
import { MasterDataCenterStrip } from "@/components/master-data/MasterDataCenterStrip";
import { MasterDataDetailDrawer } from "@/components/master-data/MasterDataDetailDrawer";
import { skuConfig } from "@/components/master-data/detail-configs";
import { useLanguage } from "@/contexts/LanguageContext";

export default function SkuRuntimePage() {
  const { t } = useLanguage();
  const [detailCode, setDetailCode] = useState<string | null>(null);
  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px" }}>
      <PageHeader title={t('md.skuCenter', 'SKU 中心')} subtitle={t('md.skuCenterSub', '物料 SKU 主档 · 三键唯一 · 库存批次 · 点击编码查看 SKU 全景')} breadcrumb={[t('md.center', '主数据中心'), t('md.skuCenter', 'SKU 中心')]} />
      <MasterDataCenterStrip type="sku" />
      <MasterDataRuntimePanel
        type="sku"
        title="SKU"
        codeKey="sku_code"
        nameKey="sku_name"
        onCodeClick={(code) => setDetailCode(code)}
        fields={[
          { key: "sku_name", label: t('md.skuName', 'SKU 名称'), required: true },
          { key: "product_code", label: t('md.productCode', '产品编码'), required: true },
          { key: "product_name", label: t('md.productName', '产品名称') },
          { key: "grade_code", label: t('md.gradeCode', '等级编码'), required: true },
          { key: "spec_code", label: t('md.specCode', '规格编码'), required: true },
          { key: "barcode", label: t('md.barcode', '条码') },
          { key: "effective_date", label: t('md.effectiveDate', '生效日期'), type: "date" },
          { key: "expire_date", label: t('md.expireDate', '失效日期'), type: "date" },
          { key: "remark", label: t('md.remark', '备注') },
        ]}
        columns={[
          { key: "sku_name", label: t('md.skuName', 'SKU 名称') },
          { key: "product_code", label: t('md.product', '产品') },
          { key: "grade_code", label: t('md.grade', '等级') },
          { key: "spec_code", label: t('md.spec', '规格') },
          { key: "barcode", label: t('md.barcode', '条码') },
        ]}
      />
      <MasterDataDetailDrawer
        open={detailCode !== null}
        code={detailCode}
        config={skuConfig}
        onClose={() => setDetailCode(null)}
      />
    </div>
  );
}
