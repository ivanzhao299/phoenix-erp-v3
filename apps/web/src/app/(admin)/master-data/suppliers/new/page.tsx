"use client";
import { MasterDataFormPage } from "@/components/master-data/MasterDataFormPage";
import { SUPPLIER_FIELDS } from "../page";

/**
 * g200p-2:新增供应商全屏页
 */
export default function SupplierNewPage() {
  return (
    <MasterDataFormPage
      type="supplier"
      title="供应商"
      codeKey="supplier_code"
      nameKey="supplier_name"
      fields={SUPPLIER_FIELDS}
      listRoute="/master-data/suppliers"
      mode="create"
    />
  );
}
