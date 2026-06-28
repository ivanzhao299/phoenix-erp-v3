"use client";
import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel } from "@/components/master-data/MasterDataRuntimePanel";
import { MasterDataCenterStrip } from "@/components/master-data/MasterDataCenterStrip";
import { MasterDataDetailDrawer } from "@/components/master-data/MasterDataDetailDrawer";
import { gradeConfig } from "@/components/master-data/detail-configs";
import { useLanguage } from "@/contexts/LanguageContext";

/**
 * UIX-9A — 等级中心（接入 MasterDataDetailDrawer）
 */
export default function ProductGradeRuntimePage() {
  const { t } = useLanguage();
  const [detailCode, setDetailCode] = useState<string | null>(null);
  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px" }}>
      <PageHeader title={t('md.gradeCenter', '等级中心')} subtitle={t('md.gradeCenterSub', '蛋品/物料等级 · SKU 关联 · 业务策略 · 点击编码查看等级全景')} breadcrumb={[t('md.center', '主数据中心'), t('md.gradeCenter', '等级中心')]} />
      <MasterDataCenterStrip type="grade" />
      <MasterDataRuntimePanel
        type="grade"
        title={t('md.grade', '等级')}
        codeKey="grade_code"
        nameKey="grade_name"
        onCodeClick={(code) => setDetailCode(code)}
        fields={[
          { key: "grade_name", label: t('md.gradeName', '等级名称'), required: true },
          { key: "sort_order", label: t('md.sort', '排序'), type: "number" },
          { key: "effective_date", label: t('md.effectiveDate', '生效日期'), type: "date" },
          { key: "expire_date", label: t('md.expireDate', '失效日期'), type: "date" },
          { key: "remark", label: t('md.remark', '备注') },
        ]}
        columns={[
          { key: "grade_name", label: t('md.gradeName', '等级名称') },
          { key: "sort_order", label: t('md.sort', '排序') },
        ]}
      />
      <MasterDataDetailDrawer
        open={detailCode !== null}
        code={detailCode}
        config={gradeConfig}
        onClose={() => setDetailCode(null)}
      />
    </div>
  );
}
