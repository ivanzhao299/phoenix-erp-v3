"use client";
import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel } from "@/components/master-data/MasterDataRuntimePanel";
import { MasterDataCenterStrip } from "@/components/master-data/MasterDataCenterStrip";
import { MasterDataDetailDrawer } from "@/components/master-data/MasterDataDetailDrawer";
import { bankAccountConfig } from "@/components/master-data/detail-configs";
import { useLanguage } from "@/contexts/LanguageContext";
import { BANK_ACCOUNT_FIELDS } from "./_fields";

/**
 * UIX-9A — 银行账户中心接入 MasterDataDetailDrawer
 * g200p-3:13 字段切 page 模式
 */

export default function BankAccountRuntimePage() {
  const { t } = useLanguage();
  const [detailCode, setDetailCode] = useState<string | null>(null);
  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px" }}>
      <PageHeader title={t('md.bankAccountCenter', '银行账户中心')} subtitle={t('md.bankAccountCenterSub', '境外/跨境结算账户 · 币种 · 绑定 ERP 账户 · 点击编码查看银行全景')} breadcrumb={[t('md.center', '主数据中心'), t('md.bankAccountCenter', '银行账户中心')]} />
      <MasterDataCenterStrip type="bank-account" />
      <MasterDataRuntimePanel
        type="bank-account"
        title={t('md.bankAccount', '银行账户')}
        codeKey="bank_account_code"
        nameKey="bank_name"
        mode="page"
        pageRoutePrefix="/master-data/bank-accounts"
        onCodeClick={(code) => setDetailCode(code)}
        fields={BANK_ACCOUNT_FIELDS}
        columns={[
          { key: "bank_name", label: t('md.bankName', '开户行') },
          { key: "account_no", label: t('md.accountNo', '账号') },
          { key: "currency_code", label: t('md.currency', '币种') },
          { key: "country_code", label: t('md.country', '国家') },
          { key: "company_code", label: t('md.company', '公司') },
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
