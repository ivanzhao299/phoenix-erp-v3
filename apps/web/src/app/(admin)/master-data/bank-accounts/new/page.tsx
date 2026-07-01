"use client";
import { MasterDataFormPage } from "@/components/master-data/MasterDataFormPage";
import { useLanguage } from "@/contexts/LanguageContext";
import { BANK_ACCOUNT_FIELDS } from "../_fields";

export default function BankAccountNewPage() {
  const { t } = useLanguage();
  return (
    <MasterDataFormPage
      type="bank-account"
      title={t('md.entity_bank_account','银行账户')}
      codeKey="bank_account_code"
      nameKey="bank_name"
      fields={BANK_ACCOUNT_FIELDS}
      listRoute="/master-data/bank-accounts"
      mode="create"
    />
  );
}
