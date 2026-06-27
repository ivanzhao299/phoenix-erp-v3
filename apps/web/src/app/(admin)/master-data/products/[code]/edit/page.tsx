"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { MasterDataFormPage } from "@/components/master-data/MasterDataFormPage";
import { LoadingSkeleton } from "@/components/design-system";
import request from "@/lib/api-client";
import { PRODUCT_FIELDS } from "../../page";

const toArr = (v: any): any[] =>
  Array.isArray(v) ? v : (v?.data ?? v?.items ?? v?.list ?? v?.rows ?? []);

export default function ProductEditPage() {
  const params = useParams();
  const code = decodeURIComponent(String(params?.code || ""));
  const [row, setRow] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await request<any>(`/master-data/runtime/product`);
        const list = toArr(r);
        const match = (x: any) => String(x.product_code ?? x.code) === code;
        let found = list.find(match) || null;
        if (!found) {
          const r2 = await request<any>(`/master-data/runtime/product/active`).catch(() => null);
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
      未找到编码 {code} 的产品档案
    </div>
  );

  return (
    <MasterDataFormPage
      type="product"
      title="产品"
      codeKey="product_code"
      nameKey="product_name"
      fields={PRODUCT_FIELDS}
      listRoute="/master-data/products"
      mode="edit"
      initialRow={row}
    />
  );
}
