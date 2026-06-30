"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { MasterDataFormPage } from "@/components/master-data/MasterDataFormPage";
import { LoadingSkeleton } from "@/components/design-system";
import { useLanguage } from "@/contexts/LanguageContext";
import request from "@/lib/api-client";
import { SUPPLIER_FIELDS } from "../../page";

/**
 * g200p-2:编辑供应商全屏页
 */
const toArr = (v: any): any[] =>
  Array.isArray(v) ? v : (v?.data ?? v?.items ?? v?.list ?? v?.rows ?? []);

export default function SupplierEditPage() {
  const { t } = useLanguage();
  const params = useParams();
  const code = decodeURIComponent(String(params?.code || ""));
  const [row, setRow] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await request<any>(`/master-data/runtime/supplier`);
        const list = toArr(r);
        const match = (x: any) => String(x.supplier_code ?? x.code) === code;
        let found = list.find(match) || null;
        if (!found) {
          const r2 = await request<any>(`/master-data/runtime/supplier/active`).catch(() => null);
          found = toArr(r2).find(match) || null;
        }
        if (!found) setNotFound(true);
        else setRow(found);
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
      fields={SUPPLIER_FIELDS}
      listRoute="/master-data/suppliers"
      mode="edit"
      initialRow={row}
    />
  );
}
