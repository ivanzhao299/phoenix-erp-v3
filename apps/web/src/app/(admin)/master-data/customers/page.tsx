"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel, type MdField } from "@/components/master-data/MasterDataRuntimePanel";
import { MasterDataDetailDrawer } from "@/components/master-data/MasterDataDetailDrawer";
import { MasterDataCenterStrip } from "@/components/master-data/MasterDataCenterStrip";
import { customerConfig } from "@/components/master-data/detail-configs";

/**
 * 主数据中心 — 客户主数据 Runtime（G3-A + UIX-7 产品化）
 * g200p:新增/编辑改为路由式全屏页(12 字段超抽屉合理容量);列表 + 流程不变。
 * 编码 CUS-00001 自动生成；生命周期统一。
 * UIX-7：点击客户编码 → 客户中心 detail drawer（订单/AR/审批/引用聚合）
 */

// g200p:字段按业务语义分 4 组(同 new/[code]/edit 路由共用)
export const CUSTOMER_FIELDS: MdField[] = [
  { key: "customer_name",   label: "客户名称", required: true, group: "基本信息" },
  { key: "customer_type",   label: "客户类型", dictType: "SAL_CUSTOMER_TYPE", group: "基本信息" },
  { key: "company_code",    label: "所属公司", type: "company", required: true, onPickKeys: { company_name: "org_name" }, group: "基本信息" },
  { key: "contact_name",    label: "联系人",   group: "联系方式" },
  { key: "contact_phone",   label: "联系电话", group: "联系方式" },
  { key: "delivery_address",label: "配送地址", group: "联系方式" },
  { key: "region_code",     label: "区域",     dictType: "SAL_REGION", group: "财务设置" },
  { key: "credit_limit",    label: "信用额度", type: "number", group: "财务设置" },
  { key: "payment_terms",   label: "账期天数", type: "number", group: "财务设置" },
  { key: "effective_date",  label: "生效日期", type: "date", group: "有效期与备注" },
  { key: "expire_date",     label: "失效日期", type: "date", group: "有效期与备注" },
  { key: "remark",          label: "备注",     group: "有效期与备注" },
];

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
        mode="page"
        pageRoutePrefix="/master-data/customers"
        onCodeClick={(code) => router.push("/master-data/customers/" + encodeURIComponent(code))}
        fields={CUSTOMER_FIELDS}
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
