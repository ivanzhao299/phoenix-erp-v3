"use client";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel } from "@/components/master-data/MasterDataRuntimePanel";

/**
 * 主数据中心 — 项目公司主数据 Runtime（G3-A）
 * 新增/编辑/提交审批/冻结/归档；编码 PRJ-001 自动生成。
 */
export default function ProjectRuntimePage() {
  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px", maxWidth: 1200 }}>
      <PageHeader title="项目公司主数据" subtitle="股东出资项目统一维护 · 编码自动生成 · 生命周期管控" breadcrumb={["主数据中心", "项目公司主数据"]} />
      <MasterDataRuntimePanel
        type="project"
        title="项目公司"
        codeKey="project_code"
        nameKey="project_name"
        fields={[
          { key: "project_name", label: "项目名称", required: true },
          { key: "company_code", label: "所属公司编码" },
          { key: "site_code", label: "场区编码" },
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
    </div>
  );
}
