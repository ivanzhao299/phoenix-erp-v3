"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { MasterDataFormPage } from "@/components/master-data/MasterDataFormPage";
import { LoadingSkeleton } from "@/components/design-system";
import request from "@/lib/api-client";
import { BANK_ACCOUNT_FIELDS } from "../../page";

const toArr = (v: any): any[] =>
  Array.isArray(v) ? v : (v?.data ?? v?.items ?? v?.list ?? v?.rows ?? []);

export default function BankAccountEditPage() {
  const params = useParams();
  const code = decodeURIComponent(String(params?.code || ""));
  const [row, setRow] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await request<any>(`/master-data/runtime/bank-account`);
        const list = toArr(r);
        const match = (x: any) => String(x.bank_account_code ?? x.code) === code;
        let found = list.find(match) || null;
        if (!found) {
          const r2 = await request<any>(`/master-data/runtime/bank-account/active`).catch(() => null);
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
      未找到编码 {code} 的银行账户
    </div>
  );

  return (
    <MasterDataFormPage
      type="bank-account"
      title="银行账户"
      codeKey="bank_account_code"
      nameKey="bank_name"
      fields={BANK_ACCOUNT_FIELDS}
      listRoute="/master-data/bank-accounts"
      mode="edit"
      initialRow={row}
    />
  );
}
