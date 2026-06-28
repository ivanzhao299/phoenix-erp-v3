"use client";
import { MasterDataFormPage } from "@/components/master-data/MasterDataFormPage";
import { useLanguage } from "@/contexts/LanguageContext";
import { CASH_ACCOUNT_FIELDS } from "../page";

export default function CashAccountNewPage() {
  const { t } = useLanguage();
  return (
    <MasterDataFormPage
      type="cash-account"
      title={t('md.entity_cash_account','资金账户')}
      codeKey="account_code"
      nameKey="account_name"
      fields={CASH_ACCOUNT_FIELDS}
      listRoute="/master-data/cash-accounts"
      mode="create"
    />
  );
}
