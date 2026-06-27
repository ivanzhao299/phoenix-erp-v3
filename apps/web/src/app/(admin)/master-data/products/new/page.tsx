"use client";
import { MasterDataFormPage } from "@/components/master-data/MasterDataFormPage";
import { PRODUCT_FIELDS } from "../page";

export default function ProductNewPage() {
  return (
    <MasterDataFormPage
      type="product"
      title="产品"
      codeKey="product_code"
      nameKey="product_name"
      fields={PRODUCT_FIELDS}
      listRoute="/master-data/products"
      mode="create"
    />
  );
}
