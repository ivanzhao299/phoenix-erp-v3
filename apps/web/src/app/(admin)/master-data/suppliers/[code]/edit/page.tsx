"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { MasterDataFormPage } from "@/components/master-data/MasterDataFormPage";
import { LoadingSkeleton } from "@/components/design-system";
import { useLanguage } from "@/contexts/LanguageContext";
import request from "@/lib/api-client";
import { usePermission } from "@/hooks/usePermission";
import { SUPPLIER_FIELDS } from "../../_fields";

/**
 * g200p-2:编辑供应商全屏页
 */
export default function SupplierEditPage() {
  const { t } = useLanguage();
  const { isSuper } = usePermission("MENU_MD_SUPPLIER");
  const params = useParams();
  const code = decodeURIComponent(String(params?.code || ""));
  const [row, setRow] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const found = await request<Record<string, unknown>>(`/master-data/runtime/supplier/${encodeURIComponent(code)}`);
        setRow(found);
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [code]);

  if (loading) return <div style={{ padding: 32 }}><LoadingSkeleton variant="card" rows={6} /></div>;
  if (notFound || !row) return (
    <div style={{ padding: 48, textAlign: "center", color: "var(--text-secondary)" }}>
      {t('md.notfound_prefix','未找到编码')} {code} {t('md.notfound_suffix_supplier','的供应商档案')}
    </div>
  );

  return (
    <MasterDataFormPage
      type="supplier"
      title={t('md.entity_supplier','供应商')}
      codeKey="supplier_code"
      nameKey="supplier_name"
      fields={isSuper ? [...SUPPLIER_FIELDS,
        { key: "bank_name", label: t("md.supplier_bank_name", "银行名称"), group: "财务设置" },
        { key: "bank_account_name", label: t("md.supplier_account_holder", "银行账户名称"), group: "财务设置" },
        { key: "bank_account_no", label: t("md.supplier_account_number", "银行账号"), group: "财务设置" },
        { key: "bank_swift", label: t("md.supplier_swift", "SWIFT"), group: "财务设置" },
      ] : SUPPLIER_FIELDS}
      listRoute="/master-data/suppliers"
      mode="edit"
      initialRow={row}
    />
  );
}
