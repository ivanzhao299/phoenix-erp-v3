"use client";
import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel } from "@/components/master-data/MasterDataRuntimePanel";
import { MasterDataCenterStrip } from "@/components/master-data/MasterDataCenterStrip";
import { MasterDataDetailDrawer } from "@/components/master-data/MasterDataDetailDrawer";
import { specConfig } from "@/components/master-data/detail-configs";
import { useLanguage } from "@/contexts/LanguageContext";

/**
 * UIX-9A — 规格中心（接入 MasterDataDetailDrawer）
 */
export default function PackagingSpecRuntimePage() {
  const { t } = useLanguage();
  const [detailCode, setDetailCode] = useState<string | null>(null);
  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px" }}>
      <PageHeader title={t('md.specCenter', '规格中心')} subtitle={t('md.specCenterSub', '包装规格主档 · SKU 关联 · 单位换算 · 点击编码查看规格全景')} breadcrumb={[t('md.center', '主数据中心'), t('md.specCenter', '规格中心')]} />
      <MasterDataCenterStrip type="spec" />
      <MasterDataRuntimePanel
        type="spec"
        title={t('md.spec', '规格')}
        codeKey="spec_code"
        nameKey="spec_name"
        onCodeClick={(code) => setDetailCode(code)}
        fields={[
          { key: "spec_name", label: t('md.specName', '规格名称'), required: true },
          { key: "qty_per_unit", label: t('md.qtyPerUnit', '每销售单位含基础数量（托30、箱360）'), type: "number", required: true },
          { key: "base_unit", label: t('md.baseUnit', '库存基本单位（如枚）'), required: true },
          { key: "display_unit", label: t('md.displayUnit', '销售单位（如托、箱）'), required: true },
          { key: "remark", label: t('md.remark', '备注') },
        ]}
        columns={[
          { key: "spec_name", label: t('md.specName', '规格名称') },
          { key: "qty_per_unit", label: t('md.qtyPerUnit', '每销售单位基础量') },
          { key: "base_unit", label: t('md.baseUnit', '库存基本单位') },
          { key: "display_unit", label: t('md.displayUnit', '销售单位') },
        ]}
      />
      <MasterDataDetailDrawer
        open={detailCode !== null}
        code={detailCode}
        config={specConfig}
        onClose={() => setDetailCode(null)}
      />
    </div>
  );
}
