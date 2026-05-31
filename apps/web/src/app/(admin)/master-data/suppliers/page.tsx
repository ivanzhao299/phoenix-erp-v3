"use client";
import { useState, useEffect, useCallback } from "react";
import { Globe, Search, RefreshCw, ExternalLink } from "lucide-react";
import Link from "next/link";
import { usePermission } from "@/hooks/usePermission";
import PageHeader from "@/components/PageHeader";
import ui from "@/components/ui/admin-ui.module.css";

/**
 * 主数据中心 — 供应商档案
 * 数据来源：Procurement V2 Supplier Runtime → GET /api/v2/procurement/suppliers
 * 完整管理入口：/procurement2/suppliers
 */

const tok = () =>
  typeof window !== "undefined"
    ? sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || ""
    : "";
const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${tok()}` });

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  ACTIVE:      { label: "启用",  color: "#10b981" },
  INACTIVE:    { label: "停用",  color: "#64748b" },
  BLACKLISTED: { label: "黑名单", color: "#ef4444" },
};
const TYPE_MAP: Record<string, string> = {
  FEED:       "饲料",
  EQUIPMENT:  "设备",
  MEDICINE:   "兽药",
  PACKAGING:  "包装",
  OTHER:      "其他",
};
const SCOPE_MAP: Record<string, string> = {
  GROUP:   "集团共享",
  COMPANY: "公司专用",
  PROJECT: "项目专用",
};

interface Supplier {
  id: string;
  supplierCode: string;
  supplierName: string;
  supplierNameEn?: string;
  countryCode?: string;
  supplierType?: string;
  defaultCurrency?: string;
  sharedScope?: string;
  contactName?: string;
  contactPhone?: string;
  status: string;
}

export default function MdSuppliersPage() {
  const { canView } = usePermission("MENU_PRC2_MASTER");
  const [items, setItems] = useState<Supplier[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (search) q.set("keyword", search);
      const res = await fetch(`/api/v2/procurement/suppliers?${q}`, { headers: hdr() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const arr: Supplier[] = Array.isArray(data) ? data : (data.items ?? data.data ?? []);
      setItems(arr);
      setTotal(typeof data.total === "number" ? data.total : arr.length);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  if (!canView) return (
    <div className="text-text-muted" style={{ padding: 40, textAlign: "center" }}>无权限查看供应商档案</div>
  );

  return (
    <div className="bg-bg-card text-text min-h-screen" style={{ padding: "24px 32px" }}>
      <PageHeader
        title="供应商档案"
        subtitle="供应商主档 · 多国多币种"
        breadcrumb={["主数据中心", "供应商档案"]}
      />

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "0 0 280px" }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#475569" }} />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="搜索供应商名称 / 编码..."
            className="bg-bg-muted border border-border text-text"
            style={{ width: "100%", padding: "7px 10px 7px 32px", borderRadius: 7, fontSize: 13, outline: "none" }}
          />
        </div>
        <button onClick={load} className="bg-bg-muted border border-border text-text-muted" style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 7, fontSize: 13, cursor: "pointer" }}>
          <RefreshCw size={13} /> 刷新
        </button>
        <div style={{ flex: 1 }} />
        <Link href="/procurement2/suppliers" style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "#10b981", border: "none", borderRadius: 7, color: "#fff", fontSize: 13, cursor: "pointer", textDecoration: "none", fontWeight: 600 }}>
          <ExternalLink size={13} /> 完整管理
        </Link>
      </div>

      <div className="text-text-muted" style={{ marginBottom: 12, fontSize: 12 }}>
        共 <span style={{ fontWeight: 600 }}>{total}</span> 家供应商
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: "center", color: "#475569" }}>加载中...</div>
      ) : error ? (
        <div style={{ padding: 40, textAlign: "center", color: "#ef4444" }}>{error}</div>
      ) : (
        <div className="bg-bg-muted border border-border" style={{ borderRadius: 10, overflow: "auto" }}>
          <table className={ui.table}>
            <thead>
              <tr>
                {["供应商编码", "供应商名称", "类型", "国家", "货币", "共享范围", "联系人", "状态"].map(h => (
                  <th key={h} style={{ whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: "#475569" }}>暂无数据</td></tr>
              ) : items.map((s, i) => {
                const st = STATUS_MAP[s.status] ?? { label: s.status, color: "#64748b" };
                return (
                  <tr key={s.id ?? i} className="border-b border-border/30"
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(148,163,184,0.08)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <td className="text-text-muted" style={{ fontFamily: "monospace" }}>{s.supplierCode}</td>
                    <td className="text-text">{s.supplierName}{s.supplierNameEn ? <span className="text-text-muted" style={{ fontSize: 11, marginLeft: 6 }}>{s.supplierNameEn}</span> : null}</td>
                    <td className="text-text-muted">{TYPE_MAP[s.supplierType ?? ""] ?? s.supplierType ?? "-"}</td>
                    <td className="text-text-muted">{s.countryCode ?? "-"}</td>
                    <td className="text-text-muted">{s.defaultCurrency ?? "-"}</td>
                    <td className="text-text-muted">{SCOPE_MAP[s.sharedScope ?? ""] ?? s.sharedScope ?? "-"}</td>
                    <td className="text-text-muted">{s.contactName ?? "-"}</td>
                    <td>
                      <span style={{ padding: "2px 8px", borderRadius: 4, background: `${st.color}22`, color: st.color, fontSize: 11, fontWeight: 600 }}>{st.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {total > pageSize && (
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "center" }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="bg-bg-muted border border-border text-text-muted" style={{ padding: "6px 14px", borderRadius: 6, cursor: "pointer" }}>上一页</button>
          <span className="text-text-muted" style={{ padding: "6px 12px", fontSize: 13 }}>第 {page} 页 / 共 {Math.ceil(total / pageSize)} 页</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / pageSize)} className="bg-bg-muted border border-border text-text-muted" style={{ padding: "6px 14px", borderRadius: 6, cursor: "pointer" }}>下一页</button>
        </div>
      )}
    </div>
  );
}
