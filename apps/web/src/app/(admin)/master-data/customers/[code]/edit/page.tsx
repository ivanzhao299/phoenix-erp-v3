"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { MasterDataFormPage } from "@/components/master-data/MasterDataFormPage";
import { LoadingSkeleton } from "@/components/design-system";
import { useLanguage } from "@/contexts/LanguageContext";
import request from "@/lib/api-client";
import { CUSTOMER_FIELDS } from "../../_fields";

/**
 * g200p:编辑客户全屏页 — 从 runtime/customer 取行,然后渲染 FormPage(mode="edit")
 */
const toArr = (v: any): any[] =>
  Array.isArray(v) ? v : (v?.data ?? v?.items ?? v?.list ?? v?.rows ?? []);

export default function CustomerEditPage() {
  const { t } = useLanguage();
  const params = useParams();
  const code = decodeURIComponent(String(params?.code || ""));
  const [row, setRow] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await request<any>(`/master-data/runtime/customer`);
        const list = toArr(r);
        const match = (x: any) => String(x.customer_no ?? x.customer_code ?? x.code) === code;
        let found = list.find(match) || null;
        if (!found) {
          const r2 = await request<any>(`/master-data/runtime/customer/active`).catch(() => null);
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
      {t('md.notfound_prefix','未找到编码')} {code} {t('md.notfound_suffix_customer','的客户档案')}
    </div>
  );

  return (
    <MasterDataFormPage
      type="customer"
      title={t('md.entity_customer','客户')}
      codeKey="customer_no"
      nameKey="customer_name"
      fields={CUSTOMER_FIELDS}
      listRoute="/master-data/customers"
      mode="edit"
      initialRow={row}
    />
  );
}
