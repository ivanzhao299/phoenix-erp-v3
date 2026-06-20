"use client";
import { MasterDataFormPage } from "@/components/master-data/MasterDataFormPage";
import { BANK_ACCOUNT_FIELDS } from "../page";

export default function BankAccountNewPage() {
  return (
    <MasterDataFormPage
      type="bank-account"
      title="银行账户"
      codeKey="bank_account_code"
      nameKey="bank_name"
      fields={BANK_ACCOUNT_FIELDS}
      listRoute="/master-data/bank-accounts"
      mode="create"
    />
  );
}
