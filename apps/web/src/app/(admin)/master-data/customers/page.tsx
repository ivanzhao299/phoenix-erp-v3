"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel } from "@/components/master-data/MasterDataRuntimePanel";
import { MasterDataDetailDrawer } from "@/components/master-data/MasterDataDetailDrawer";
import { MasterDataCenterStrip } from "@/components/master-data/MasterDataCenterStrip";
import { customerConfig } from "@/components/master-data/detail-configs";

/**
 * 主数据中心 — 客户主数据 Runtime（G3-A + UIX-7 产品化）
 * 新增/编辑/提交审批/冻结/归档；编码 CUS-00001 自动生成；生命周期统一。
 * UIX-7：点击客户编码 → 客户中心 detail drawer（订单/AR/审批/引用聚合）
 */
export default function CustomerRuntimePage() {
  const router = useRouter();
  const [detailCode, setDetailCode] = useState<string | null>(null);
  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px" }}>
      <PageHeader title="客户中心" subtitle="客户运营态势 · 业务关系 · 应收风险 · 点击编码查看客户全景" breadcrumb={["主数据中心", "客户中心"]} />
      <MasterDataCenterStrip type="customer" />
      <MasterDataRuntimePanel
        type="customer"
        title="客户"
        codeKey="customer_no"
        nameKey="customer_name"
        onCodeClick={(code) => router.push("/master-data/customers/" + encodeURIComponent(code))}
        fields={[
          { key: "customer_name", label: "客户名称", required: true },
          { key: "customer_type", label: "客户类型", dictType: "SAL_CUSTOMER_TYPE" },  // G66 走字典(消除硬编码重复)
          { key: "company_code", label: "所属公司编码", required: true },
          { key: "contact_name", label: "联系人" },
          { key: "contact_phone", label: "联系电话" },
          { key: "region_code", label: "区域编码" },
          { key: "credit_limit", label: "信用额度", type: "number" },
          { key: "payment_terms", label: "账期天数", type: "number" },
          { key: "delivery_address", label: "配送地址" },
          { key: "effective_date", label: "生效日期", type: "date" },
          { key: "expire_date", label: "失效日期", type: "date" },
          { key: "remark", label: "备注" },
        ]}
        columns={[
          { key: "customer_name", label: "客户名称" },
          { key: "customer_type", label: "类型" },
          { key: "company_code", label: "公司" },
          { key: "contact_name", label: "联系人" },
          { key: "contact_phone", label: "电话" },
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
