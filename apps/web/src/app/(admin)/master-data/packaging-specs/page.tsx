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
          { key: "unit_count", label: t('md.unitCount', '单位数量（如 30 枚/盒）'), type: "number" },
          { key: "pack_type", label: t('md.packType', '包装类型'), type: "select", options: [
            { value: "BOX", label: t('md.packBox', '纸盒') }, { value: "PLASTIC", label: t('md.packPlastic', '塑料盒') },
            { value: "TRAY", label: t('md.packTray', '托盘') }, { value: "BAG", label: t('md.packBag', '袋装') }, { value: "BULK", label: t('md.packBulk', '散装') },
          ] },
          { key: "effective_date", label: t('md.effectiveDate', '生效日期'), type: "date" },
          { key: "expire_date", label: t('md.expireDate', '失效日期'), type: "date" },
          { key: "remark", label: t('md.remark', '备注') },
        ]}
        columns={[
          { key: "spec_name", label: t('md.specName', '规格名称') },
          { key: "unit_count", label: t('md.unitCountShort', '单位数') },
          { key: "pack_type", label: t('md.packType', '包装类型') },
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
