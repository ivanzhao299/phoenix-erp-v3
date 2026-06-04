"use client";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel } from "@/components/master-data/MasterDataRuntimePanel";

/**
 * G5.5-C — 门店档案 Runtime
 * 替换原占位页；统一编码 STR-00001 + 5 态生命周期 + Workflow
 */
export default function StoreRuntimePage() {
  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px", maxWidth: 1200 }}>
      <PageHeader title="门店档案" subtitle="直营门店主档 · 编码自动生成 · 生命周期管控 · POS / 销售单据引用源" breadcrumb={["主数据中心", "门店档案"]} />
      <MasterDataRuntimePanel
        type="store"
        title="门店"
        codeKey="store_code"
        nameKey="store_name"
        fields={[
          { key: "store_name", label: "门店名称", required: true },
          { key: "company_code", label: "所属公司编码" },
          { key: "manager", label: "店长（用户名）" },
          { key: "phone", label: "联系电话" },
          { key: "address", label: "地址" },
          { key: "effective_date", label: "生效日期", type: "date" },
          { key: "expire_date", label: "失效日期", type: "date" },
          { key: "remark", label: "备注" },
        ]}
        columns={[
          { key: "store_name", label: "门店名称" },
          { key: "company_code", label: "公司" },
          { key: "manager", label: "店长" },
          { key: "phone", label: "电话" },
        ]}
      />
    </div>
  );
}
