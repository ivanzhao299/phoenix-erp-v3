"use client";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel } from "@/components/master-data/MasterDataRuntimePanel";

/**
 * G5.5-C — 银行账户中心
 * 全新建立；统一编码 BANK-00001 + 5 态生命周期 + Workflow
 * 与 fin_cash_accounts 通过 bank_acc_code 关联（境外/跨境结算）
 */
export default function BankAccountRuntimePage() {
  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px", maxWidth: 1200 }}>
      <PageHeader
        title="银行账户中心"
        subtitle="境外/跨境结算账户 · 编码自动生成 · 生命周期管控 · 与 ERP 资金账户绑定"
        breadcrumb={["主数据中心", "银行账户中心"]}
      />
      <MasterDataRuntimePanel
        type="bank-account"
        title="银行账户"
        codeKey="bank_account_code"
        nameKey="bank_name"
        fields={[
          { key: "bank_name", label: "开户行（中文）", required: true },
          { key: "bank_name_en", label: "Bank Name (EN)" },
          { key: "branch_name", label: "支行" },
          { key: "account_no", label: "账号", required: true },
          { key: "account_holder", label: "开户名", required: true },
          { key: "currency_code", label: "币种", required: true, type: "select", options: [
            { value: "CNY", label: "人民币 CNY" }, { value: "USD", label: "美元 USD" },
            { value: "EUR", label: "欧元 EUR" }, { value: "HKD", label: "港币 HKD" },
            { value: "JPY", label: "日元 JPY" }, { value: "LAK", label: "老挝基普 LAK" },
            { value: "THB", label: "泰铢 THB" }, { value: "VND", label: "越南盾 VND" },
          ] },
          { key: "country_code", label: "国家", type: "select", options: [
            { value: "CN", label: "中国" }, { value: "LA", label: "老挝" }, { value: "TH", label: "泰国" },
            { value: "VN", label: "越南" }, { value: "HK", label: "香港" }, { value: "US", label: "美国" }, { value: "OTHER", label: "其他" },
          ] },
          { key: "swift_code", label: "SWIFT Code" },
          { key: "iban", label: "IBAN" },
          { key: "company_code", label: "所属公司编码" },
          { key: "effective_date", label: "生效日期", type: "date" },
          { key: "expire_date", label: "失效日期", type: "date" },
          { key: "remark", label: "备注" },
        ]}
        columns={[
          { key: "bank_name", label: "开户行" },
          { key: "account_no", label: "账号" },
          { key: "currency_code", label: "币种" },
          { key: "country_code", label: "国家" },
          { key: "company_code", label: "公司" },
        ]}
      />
    </div>
  );
}
