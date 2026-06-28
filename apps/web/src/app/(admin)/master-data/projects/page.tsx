"use client";
import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel } from "@/components/master-data/MasterDataRuntimePanel";
import { MasterDataCenterStrip } from "@/components/master-data/MasterDataCenterStrip";
import { MasterDataDetailDrawer } from "@/components/master-data/MasterDataDetailDrawer";
import { projectConfig } from "@/components/master-data/detail-configs";
import { useLanguage } from "@/contexts/LanguageContext";

export default function ProjectRuntimePage() {
  const { t } = useLanguage();
  const [detailCode, setDetailCode] = useState<string | null>(null);
  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px" }}>
      <PageHeader title={t('md.projectCenter', '项目中心')} subtitle={t('md.projectCenterSub', '股东出资项目 · 业务归属 · 生命周期 · 点击编码查看项目全景')} breadcrumb={[t('md.center', '主数据中心'), t('md.projectCenter', '项目中心')]} />
      <MasterDataCenterStrip type="project" />
      <MasterDataRuntimePanel
        type="project"
        title={t('md.projectCompany', '项目公司')}
        codeKey="project_code"
        nameKey="project_name"
        onCodeClick={(code) => setDetailCode(code)}
        fields={[
          // MDM-1：字段对齐 biz_projects 统一项目主表真实列
          { key: "project_name", label: t('md.projectName', '项目名称'), required: true },
          { key: "project_short_name", label: t('md.projectShortName', '项目简称') },
          { key: "company_code", label: t('md.belongCompany', '所属公司'), type: "company", onPickKeys: { company_name: "org_name" } },
          { key: "project_type", label: t('md.projectType', '项目类型'), type: "select", options: [
            { value: "INVESTMENT", label: t('md.projTypeInvestment', '投资项目') },
            { value: "OPERATION", label: t('md.projTypeOperation', '经营项目') },
            { value: "COST_CENTER", label: t('md.projTypeCostCenter', '成本中心') },
            { value: "PROFIT_CENTER", label: t('md.projTypeProfitCenter', '利润中心') },
          ] },
          { key: "budget_amount", label: t('md.budgetAmount', '预算金额'), type: "number" },
          { key: "budget_currency", label: t('md.budgetCurrency', '预算币种'), dictType: "SYS_CURRENCY" },
          { key: "start_date", label: t('md.startDate', '开始日期'), type: "date" },
          { key: "end_date", label: t('md.endDate', '结束日期'), type: "date" },
          { key: "manager_name", label: t('md.projectManager', '项目负责人') },
          { key: "remark", label: t('md.remark', '备注') },
        ]}
        columns={[
          { key: "project_name", label: t('md.projectName', '项目名称') },
          { key: "company_code", label: t('md.company', '公司') },
          { key: "project_type", label: t('md.type', '类型') },
          { key: "budget_amount", label: t('md.budgetAmount', '预算金额') },
          { key: "budget_currency", label: t('md.currency', '币种') },
        ]}
      />
      <MasterDataDetailDrawer
        open={detailCode !== null}
        code={detailCode}
        config={projectConfig}
        onClose={() => setDetailCode(null)}
      />
    </div>
  );
}
