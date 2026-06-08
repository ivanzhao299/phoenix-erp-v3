"use client";
import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel } from "@/components/master-data/MasterDataRuntimePanel";
import { MasterDataCenterStrip } from "@/components/master-data/MasterDataCenterStrip";
import { MasterDataDetailDrawer } from "@/components/master-data/MasterDataDetailDrawer";
import { supplierConfig } from "@/components/master-data/detail-configs";

/**
 * 主数据中心 — 供应商主数据 Runtime（G3-A + UIX-7 产品化）
 * 点击编码 → 供应商中心 detail drawer（采购/AP/审计/引用聚合）
 */
export default function SupplierRuntimePage() {
  const [detailCode, setDetailCode] = useState<string | null>(null);
  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px" }}>
      <PageHeader title="供应商中心" subtitle="供应商运营态势 · 采购协作 · 应付风险 · 点击编码查看供应商全景" breadcrumb={["主数据中心", "供应商中心"]} />
      <MasterDataCenterStrip type="supplier" />
      <MasterDataRuntimePanel
        type="supplier"
        title="供应商"
        codeKey="supplier_code"
        nameKey="supplier_name"
        onCodeClick={(code) => setDetailCode(code)}
        fields={[
          { key: "supplier_name", label: "供应商名称", required: true },
          { key: "supplier_name_en", label: "英文名称" },
          { key: "supplier_type", label: "供应商类型", type: "select", options: [
            { value: "LOCAL", label: "本地" }, { value: "OVERSEAS", label: "海外" }, { value: "AGENT", label: "代理" },
          ] },
          { key: "country_code", label: "国家", type: "select", options: [
            { value: "LA", label: "老挝" }, { value: "CN", label: "中国" }, { value: "TH", label: "泰国" },
            { value: "VN", label: "越南" }, { value: "US", label: "美国" }, { value: "OTHER", label: "其他" },
          ] },
          { key: "contact_name", label: "联系人" },
          { key: "contact_phone", label: "联系电话" },
          { key: "contact_email", label: "邮箱" },
          { key: "tax_no", label: "税号" },
          { key: "default_currency", label: "默认币种", type: "select", options: [
            { value: "CNY", label: "人民币" }, { value: "LAK", label: "老挝基普" }, { value: "THB", label: "泰铢" },
            { value: "USD", label: "美元" }, { value: "VND", label: "越南盾" },
          ] },
          { key: "payment_terms", label: "结算账期(天)", type: "number" },
          { key: "address", label: "地址" },
          { key: "effective_date", label: "生效日期", type: "date" },
          { key: "expire_date", label: "失效日期", type: "date" },
          { key: "remark", label: "备注" },
        ]}
        columns={[
          { key: "supplier_name", label: "供应商名称" },
          { key: "supplier_type", label: "类型" },
          { key: "country_code", label: "国家" },
          { key: "contact_name", label: "联系人" },
          { key: "default_currency", label: "币种" },
        ]}
      />
      <MasterDataDetailDrawer
        open={detailCode !== null}
        code={detailCode}
        config={supplierConfig}
        onClose={() => setDetailCode(null)}
      />
    </div>
  );
}
