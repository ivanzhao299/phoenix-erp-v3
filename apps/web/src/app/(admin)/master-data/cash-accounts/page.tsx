"use client";
import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel, type MdField } from "@/components/master-data/MasterDataRuntimePanel";
import { MasterDataCenterStrip } from "@/components/master-data/MasterDataCenterStrip";
import { MasterDataDetailDrawer } from "@/components/master-data/MasterDataDetailDrawer";
import { cashAccountConfig } from "@/components/master-data/detail-configs";

/**
 * G5.5-C — 资金账户档案（Runtime 化）
 * UIX-9A — 接入 MasterDataDetailDrawer（资金账户中心，点击编码看流水/绑定）
 * g200p-2:12 字段切路由全屏页(基本/银行/有效期 3 组)
 */

// g200p-2:12 字段分 3 组
export const CASH_ACCOUNT_FIELDS: MdField[] = [
  { key: "account_name",   label: "账户名称", required: true, group: "基本信息" },
  { key: "company_code",   label: "所属公司", required: true, type: "company", onPickKeys: { company_name: "org_name" }, group: "基本信息" },
  { key: "company_name",   label: "所属公司名称(自动带出)", type: "readonly", group: "基本信息" },
  { key: "currency_code",  label: "币种", required: true, dictType: "SYS_CURRENCY", group: "基本信息" },
  { key: "account_type",   label: "账户类型", required: true, type: "select", group: "基本信息",
    options: [
      { value: "BANK", label: "银行账户" }, { value: "CASH", label: "现金账户" },
      { value: "VIRTUAL", label: "虚拟账户" }, { value: "SHAREHOLDER", label: "股东账户" },
      { value: "INTERNAL", label: "内部账户" },
    ] },
  { key: "bank_name",       label: "开户行",     group: "银行信息" },
  { key: "bank_account_no", label: "银行账号",   group: "银行信息" },
  { key: "bank_acc_code",   label: "绑定银行账户编码(BANK-XXXXX)", group: "银行信息" },
  { key: "holder_code",     label: "持有人编码", group: "银行信息" },
  { key: "effective_date",  label: "生效日期",   type: "date", group: "有效期与备注" },
  { key: "expire_date",     label: "失效日期",   type: "date", group: "有效期与备注" },
  { key: "remark",          label: "备注",       group: "有效期与备注" },
];

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
        mode="page"
        pageRoutePrefix="/master-data/cash-accounts"
        onCodeClick={(code) => setDetailCode(code)}
        fields={CASH_ACCOUNT_FIELDS}
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
