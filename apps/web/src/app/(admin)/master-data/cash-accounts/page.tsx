"use client";
import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel } from "@/components/master-data/MasterDataRuntimePanel";
import { MasterDataCenterStrip } from "@/components/master-data/MasterDataCenterStrip";
import { MasterDataDetailDrawer } from "@/components/master-data/MasterDataDetailDrawer";
import { cashAccountConfig } from "@/components/master-data/detail-configs";
import { useLanguage } from "@/contexts/LanguageContext";
import { CASH_ACCOUNT_FIELDS } from "./_fields";

/**
 * G5.5-C — 资金账户档案（Runtime 化）
 * UIX-9A — 接入 MasterDataDetailDrawer（资金账户中心，点击编码看流水/绑定）
 * g200p-2:12 字段切路由全屏页(基本/银行/有效期 3 组)
 */

export default function CashAccountRuntimePage() {
  const { t } = useLanguage();
  const [detailCode, setDetailCode] = useState<string | null>(null);
  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px" }}>
      <PageHeader title={t('md.cashAccountCenter', '资金账户中心')} subtitle={t('md.cashAccountCenterSub', 'ERP 资金账户 · 流水态势 · 余额风险 · 点击编码查看账户全景')} breadcrumb={[t('md.center', '主数据中心'), t('md.cashAccountCenter', '资金账户中心')]} />
      <MasterDataCenterStrip type="cash-account" />
      <MasterDataRuntimePanel
        type="cash-account"
        title={t('md.cashAccount', '资金账户')}
        codeKey="account_code"
        nameKey="account_name"
        mode="page"
        pageRoutePrefix="/master-data/cash-accounts"
        onCodeClick={(code) => setDetailCode(code)}
        fields={CASH_ACCOUNT_FIELDS}
        columns={[
          { key: "account_name", label: t('md.accountName', '账户名称') },
          { key: "company_code", label: t('md.company', '公司') },
          { key: "currency_code", label: t('md.currency', '币种') },
          { key: "account_type", label: t('md.type', '类型') },
          { key: "bank_name", label: t('md.bankName', '开户行') },
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
