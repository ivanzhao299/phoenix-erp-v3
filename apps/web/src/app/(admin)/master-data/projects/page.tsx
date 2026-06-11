"use client";
import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel } from "@/components/master-data/MasterDataRuntimePanel";
import { MasterDataCenterStrip } from "@/components/master-data/MasterDataCenterStrip";
import { MasterDataDetailDrawer } from "@/components/master-data/MasterDataDetailDrawer";
import { projectConfig } from "@/components/master-data/detail-configs";

export default function ProjectRuntimePage() {
  const [detailCode, setDetailCode] = useState<string | null>(null);
  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px" }}>
      <PageHeader title="项目中心" subtitle="股东出资项目 · 业务归属 · 生命周期 · 点击编码查看项目全景" breadcrumb={["主数据中心", "项目中心"]} />
      <MasterDataCenterStrip type="project" />
      <MasterDataRuntimePanel
        type="project"
        title="项目公司"
        codeKey="project_code"
        nameKey="project_name"
        onCodeClick={(code) => setDetailCode(code)}
        fields={[
          { key: "project_name", label: "项目名称", required: true },
          { key: "company_code", label: "所属公司", type: "company", onPickKeys: { company_name: "org_name" } },
          { key: "site_code", label: "场区", type: "farm" },
          { key: "project_type", label: "项目类型", type: "select", options: [
            { value: "LAYER_FARM", label: "蛋鸡养殖场" }, { value: "BROILER_FARM", label: "肉鸡养殖场" },
            { value: "SLAUGHTER", label: "屠宰加工厂" }, { value: "FOOD_FACTORY", label: "食品厂" },
            { value: "ORGANIC_FERTILIZER", label: "有机肥生产厂" }, { value: "HATCHERY", label: "孵化场" },
            { value: "FEED_MILL", label: "饲料厂" }, { value: "OTHER", label: "其他" },
          ] },
          { key: "effective_date", label: "生效日期", type: "date" },
          { key: "expire_date", label: "失效日期", type: "date" },
          { key: "remark", label: "备注" },
        ]}
        columns={[
          { key: "project_name", label: "项目名称" },
          { key: "company_code", label: "公司" },
          { key: "site_code", label: "场区" },
          { key: "project_type", label: "类型" },
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
