"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import PageHeader from "@/components/PageHeader";
import { Search } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

// ✅ 正向追溯：从批次 → 质检 → 订单
interface TraceResult {
  batch: Record<string,unknown> | null;
  inspections: Record<string,unknown>[];
  orders: Record<string,unknown>[];
}

export default function ForwardTracePage() {
  const { t } = useLanguage();
  const [batchNo, setBatchNo] = useState("");
  const [result,  setResult]  = useState<TraceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const trace = useCallback(async () => {
    if (!batchNo.trim()) return;
    setLoading(true); setError(null);
    try {
      const [bRes, iRes, oRes] = await Promise.all([
        crudApi.list("inv_batches",    { batch_no: batchNo, limit: 1 } as any),
        crudApi.list("qa_inspections", { batch_no: batchNo, limit: 50 } as any),
        crudApi.list("ord_orders",     { limit: 20 } as any),
      ]);
      setResult({
        batch:       ((bRes as any).data ?? [])[0] ?? null,
        inspections: (iRes as any).data ?? [],
        orders:      (oRes as any).data ?? [],
      });
    } catch (e) {
      setError((e as Error).message);
    } finally { setLoading(false); }
  }, [batchNo]);

  const Section = ({ title, items, keys }: { title: string; items: Record<string,unknown>[]; keys: string[] }) => (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontWeight: 700, marginBottom: 10, color: "var(--text-primary)", fontSize: "0.95rem" }}>{title}（{items.length} {t("ui.条","条")}）</div>
      {items.length === 0 ? <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{t("common.no_data","暂无数据")}</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((item, i) => (
            <div key={i} style={{ background: "var(--bg-surface)", borderRadius: 8, padding: "10px 14px", fontSize: "0.83rem", display: "flex", gap: 20, flexWrap: "wrap" }}>
              {keys.map(k => item[k] != null && (
                <span key={k}><b style={{ color: "var(--text-muted)" }}>{k}: </b>{String(item[k])}</span>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader title={t("ui.正向追溯","正向追溯")} subtitle={t("ui.正向追溯副标题","从批次号正向追溯质检记录和关联订单（inv_batches → qa_inspections → ord_orders）")} />
      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <input
          value={batchNo} onChange={e => setBatchNo(e.target.value)}
          onKeyDown={e => e.key === "Enter" && trace()}
          placeholder={t("ui.输入批次号","输入批次号，如：B-20260510-001")}
          style={{ flex: 1, background: "var(--bg-surface)", border: "1px solid var(--border-light)",
            borderRadius: 8, padding: "10px 16px", color: "#fff", fontSize: "0.9rem", outline: "none" }}
        />
        <button onClick={trace} disabled={loading || !batchNo.trim()}
          style={{ padding: "10px 24px", background: "var(--brand-primary)", color: "#fff", borderRadius: 8,
            border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
          <Search size={16} />{loading ? t("ui.查询中","查询中...") : t("ui.追溯","追溯")}
        </button>
      </div>
      {error && <div style={{ color: "#ef4444", marginBottom: 16 }}>{t("ui.查询失败","查询失败")}：{error}</div>}
      {result && (
        <div style={{ background: "var(--bg-surface)", borderRadius: 12, padding: 20, border: "1px solid var(--bg-surface)" }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 700, marginBottom: 8, color: "var(--brand-primary)" }}>📦 {t("ui.批次信息","批次信息")}</div>
            {result.batch ? (
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontSize: "0.85rem" }}>
                {["batch_no","sku_code","qty","house_code","grading_date","pack_type","status"].map(k => result.batch![k] != null && (
                  <span key={k}><b style={{ color: "var(--text-muted)" }}>{k}: </b>{String(result.batch![k])}</span>
                ))}
              </div>
            ) : <div style={{ color: "#ef4444" }}>{t("ui.未找到批次","未找到批次")}「{batchNo}」</div>}
          </div>
          <Section title={`🔬 ${t("ui.质检记录","质检记录")}`} items={result.inspections} keys={["inspect_no","house_code","inspector","status"]} />
          <Section title={`📋 ${t("ui.关联订单","关联订单")}`} items={result.orders}      keys={["order_no","customer_code","total_amount","status"]} />
        </div>
      )}
    </div>
  );
}
