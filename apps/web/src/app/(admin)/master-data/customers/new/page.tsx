"use client";
import { MasterDataFormPage } from "@/components/master-data/MasterDataFormPage";
import { useLanguage } from "@/contexts/LanguageContext";
import { CUSTOMER_FIELDS } from "../page";

/**
 * g200p:新增客户全屏页(替代 12 字段塞抽屉)
 * 字段定义统一从 ../page.tsx 的 CUSTOMER_FIELDS 导入,避免重复。
 */
export default function CustomerNewPage() {
  const { t } = useLanguage();
  return (
    <MasterDataFormPage
      type="customer"
      title={t('md.entity_customer','客户')}
      codeKey="customer_no"
      nameKey="customer_name"
      fields={CUSTOMER_FIELDS}
      listRoute="/master-data/customers"
      mode="create"
    />
  );
}
