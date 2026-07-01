"use client";
import { MasterDataFormPage } from "@/components/master-data/MasterDataFormPage";
import { useLanguage } from "@/contexts/LanguageContext";
import { PRODUCT_FIELDS } from "../_fields";

export default function ProductNewPage() {
  const { t } = useLanguage();
  return (
    <MasterDataFormPage
      type="product"
      title={t('md.entity_product','产品')}
      codeKey="product_code"
      nameKey="product_name"
      fields={PRODUCT_FIELDS}
      listRoute="/master-data/products"
      mode="create"
    />
  );
}
