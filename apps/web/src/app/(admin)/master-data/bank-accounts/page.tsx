"use client";
import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel, type MdField } from "@/components/master-data/MasterDataRuntimePanel";
import { MasterDataCenterStrip } from "@/components/master-data/MasterDataCenterStrip";
import { MasterDataDetailDrawer } from "@/components/master-data/MasterDataDetailDrawer";
import { bankAccountConfig } from "@/components/master-data/detail-configs";

/**
 * UIX-9A — 银行账户中心接入 MasterDataDetailDrawer
 * g200p-3:13 字段切 page 模式
 */

// g200p-3:13 字段分 4 组
export const BANK_ACCOUNT_FIELDS: MdField[] = [
  { key: "bank_name",      label: "开户行(中文)",    required: true, group: "基本信息" },
  { key: "bank_name_en",   label: "Bank Name (EN)",   group: "基本信息" },
  { key: "branch_name",    label: "支行",             group: "基本信息" },
  { key: "company_code",   label: "所属公司编码",     group: "基本信息" },
  { key: "account_no",     label: "账号",             required: true, group: "账户信息" },
  { key: "account_holder", label: "开户名",           required: true, group: "账户信息" },
  { key: "currency_code",  label: "币种",             required: true, type: "select", group: "账户信息",
    options: [
      { value: "CNY", label: "人民币 CNY" }, { value: "USD", label: "美元 USD" },
      { value: "EUR", label: "欧元 EUR" }, { value: "HKD", label: "港币 HKD" },
      { value: "JPY", label: "日元 JPY" }, { value: "LAK", label: "老挝基普 LAK" },
      { value: "THB", label: "泰铢 THB" }, { value: "VND", label: "越南盾 VND" },
    ] },
  { key: "country_code",   label: "国家",             type: "select", group: "国际结算",
    options: [
      { value: "CN", label: "中国" }, { value: "LA", label: "老挝" }, { value: "TH", label: "泰国" },
      { value: "VN", label: "越南" }, { value: "HK", label: "香港" }, { value: "US", label: "美国" }, { value: "OTHER", label: "其他" },
    ] },
  { key: "swift_code",     label: "SWIFT Code",       group: "国际结算" },
  { key: "iban",           label: "IBAN",             group: "国际结算" },
  { key: "effective_date", label: "生效日期",         type: "date", group: "有效期与备注" },
  { key: "expire_date",    label: "失效日期",         type: "date", group: "有效期与备注" },
  { key: "remark",         label: "备注",             group: "有效期与备注" },
];

export default function BankAccountRuntimePage() {
  const [detailCode, setDetailCode] = useState<string | null>(null);
  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px" }}>
      <PageHeader title="银行账户中心" subtitle="境外/跨境结算账户 · 币种 · 绑定 ERP 账户 · 点击编码查看银行全景" breadcrumb={["主数据中心", "银行账户中心"]} />
      <MasterDataCenterStrip type="bank-account" />
      <MasterDataRuntimePanel
        type="bank-account"
        title="银行账户"
        codeKey="bank_account_code"
        nameKey="bank_name"
        mode="page"
        pageRoutePrefix="/master-data/bank-accounts"
        onCodeClick={(code) => setDetailCode(code)}
        fields={BANK_ACCOUNT_FIELDS}
        columns={[
          { key: "bank_name", label: "开户行" },
          { key: "account_no", label: "账号" },
          { key: "currency_code", label: "币种" },
          { key: "country_code", label: "国家" },
          { key: "company_code", label: "公司" },
        ]}
      />
      <MasterDataDetailDrawer
        open={detailCode !== null}
        code={detailCode}
        config={bankAccountConfig}
        onClose={() => setDetailCode(null)}
      />
    </div>
  );
}
