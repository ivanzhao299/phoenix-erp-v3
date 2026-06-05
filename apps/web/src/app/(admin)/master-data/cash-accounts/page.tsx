"use client";
import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel } from "@/components/master-data/MasterDataRuntimePanel";
import { MasterDataCenterStrip } from "@/components/master-data/MasterDataCenterStrip";
import { MasterDataDetailDrawer } from "@/components/master-data/MasterDataDetailDrawer";
import { cashAccountConfig } from "@/components/master-data/detail-configs";

/**
 * G5.5-C — 资金账户档案（Runtime 化）
 * UIX-9A — 接入 MasterDataDetailDrawer（资金账户中心，点击编码看流水/绑定）
 */
export default function CashAccountRuntimePage() {
  const [detailCode, setDetailCode] = useState<string | null>(null);
  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px" }}>
      <PageHeader title="资金账户中心" subtitle="ERP 资金账户 · 流水态势 · 余额风险 · 点击编码查看账户全景" breadcrumb={["主数据中心", "资金账户中心"]} />
      <MasterDataCenterStrip type="cash-account" />
      <MasterDataRuntimePanel
        type="cash-account"
        title="资金账户"
        codeKey="account_code"
        nameKey="account_name"
        onCodeClick={(code) => setDetailCode(code)}
        fields={[
          { key: "account_name", label: "账户名称", required: true },
          { key: "company_code", label: "所属公司编码", required: true },
          { key: "company_name", label: "所属公司名称" },
          { key: "currency_code", label: "币种", required: true, type: "select", options: [
            { value: "CNY", label: "人民币 CNY" }, { value: "USD", label: "美元 USD" },
            { value: "EUR", label: "欧元 EUR" }, { value: "LAK", label: "老挝基普 LAK" },
            { value: "THB", label: "泰铢 THB" },
          ] },
          { key: "account_type", label: "账户类型", required: true, type: "select", options: [
            { value: "BANK", label: "银行账户" }, { value: "CASH", label: "现金账户" },
            { value: "VIRTUAL", label: "虚拟账户" }, { value: "SHAREHOLDER", label: "股东账户" },
            { value: "INTERNAL", label: "内部账户" },
          ] },
          { key: "bank_name", label: "开户行" },
          { key: "bank_account_no", label: "银行账号" },
          { key: "bank_acc_code", label: "绑定银行账户编码（BANK-XXXXX）" },
          { key: "holder_code", label: "持有人编码" },
          { key: "effective_date", label: "生效日期", type: "date" },
          { key: "expire_date", label: "失效日期", type: "date" },
          { key: "remark", label: "备注" },
        ]}
        columns={[
          { key: "account_name", label: "账户名称" },
          { key: "company_code", label: "公司" },
          { key: "currency_code", label: "币种" },
          { key: "account_type", label: "类型" },
          { key: "bank_name", label: "开户行" },
        ]}
      />
      <MasterDataDetailDrawer
        open={detailCode !== null}
        code={detailCode}
        config={cashAccountConfig}
        onClose={() => setDetailCode(null)}
      />
    </div>
  );
}
