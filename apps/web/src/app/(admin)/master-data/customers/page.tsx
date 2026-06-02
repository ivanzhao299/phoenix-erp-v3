"use client";
import { useState, useEffect, useCallback } from "react";
import { Users, Search, RefreshCw, ExternalLink } from "lucide-react";
import Link from "next/link";
import { usePermission } from "@/hooks/usePermission";
import PageHeader from "@/components/PageHeader";
import s from "@/components/ui/admin-ui.module.css";

/**
 * 主数据中心 — 客户档案
 * 数据来源：Sales V2 Customer Runtime → GET /api/v2/sales/customers
 * 完整管理入口：/sales2/customers
 */

const tok = () =>
  typeof window !== "undefined"
    ? sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || ""
    : "";
const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${tok()}` });

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  ACTIVE:    { label: "正常",  color: "var(--status-success)" },
  FROZEN:    { label: "冻结",  color: "var(--status-warning)" },
  BLACKLIST: { label: "黑名单", color: "var(--status-danger)" },
};
const TYPE_MAP: Record<string, string> = {
  DIRECT_STORE: "直营店",
  DISTRIBUTOR:  "经销商",
  AGENT:        "代理商",
  KEY_ACCOUNT:  "大客户",
  RETAIL:       "散客零售",
};

interface Customer {
  id: string | number;
  customerCode?: string;
  customerName: string;
  customerType?: string;
  creditLimit?: number;
  creditUsed?: number;
  status?: string;
  contactName?: string;
  contactPhone?: string;
  companyCode?: string;
}

export default function MdCustomersPage() {
  const { canView } = usePermission("MENU_SALES2_CUSTOMER");
  const [items, setItems] = useState<Customer[]>([]);
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
      const q = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (search) q.set("keyword", search);
      const res = await fetch(`/api/v2/sales/customers?${q}`, { headers: hdr() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const raw: any[] = Array.isArray(data) ? data : (data.data ?? data.items ?? []);
      // 后端 list() 走 SELECT * 返回 snake_case 字段，这里归一化为页面所需 camelCase（兼容两种）
      const arr: Customer[] = raw.map((r: any) => ({
        id: r.id,
        customerCode: r.customer_no ?? r.customer_code ?? r.customerCode,
        customerName: r.customer_name ?? r.customerName,
        customerType: r.customer_type ?? r.customerType,
        contactName: r.contact_name ?? r.contactName,
        contactPhone: r.contact_phone ?? r.contactPhone,
        creditLimit: r.credit_limit ?? r.creditLimit,
        creditUsed: r.credit_used ?? r.creditUsed,
        status: r.status,
        companyCode: r.company_code ?? r.companyCode,
      }));
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
    <div className="text-text-muted" style={{ padding: 40, textAlign: "center" }}>无权限查看客户档案</div>
  );

  return (
    <div className="bg-bg-card text-text min-h-screen" style={{ padding: "24px 32px" }}>
      <PageHeader
        title="客户档案"
        subtitle="统一客户主档 · 按公司数据隔离"
        breadcrumb={["主数据中心", "客户档案"]}
      />

      {/* 工具栏 */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "0 0 280px" }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }} />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="搜索客户名称 / 编码..."
            className="bg-bg-muted border border-border text-text"
            style={{
              width: "100%", padding: "7px 10px 7px 32px",
              borderRadius: 7,
              fontSize: 13, outline: "none",
            }}
          />
        </div>
        <button
          onClick={load}
          className="bg-bg-muted border border-border text-text-muted"
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
            borderRadius: 7,
            fontSize: 13, cursor: "pointer",
          }}
        >
          <RefreshCw size={13} /> 刷新
        </button>
        <div style={{ flex: 1 }} />
        <Link href="/sales2/customers" style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "var(--color-accent)", border: "none", borderRadius: 7, color: "var(--text-on-dark)", fontSize: 13, cursor: "pointer", textDecoration: "none", fontWeight: 600 }}>
          <ExternalLink size={13} /> 完整管理
        </Link>
      </div>

      {/* 统计 */}
      <div className="text-text-muted" style={{ marginBottom: 12, fontSize: 12 }}>
        共 <span className="text-text-muted" style={{ fontWeight: 600 }}>{total}</span> 个客户
      </div>

      {/* 表格 */}
      {loading ? (
        <div style={{ padding: 60, textAlign: "center", color: "var(--text-secondary)" }}>加载中...</div>
      ) : error ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--status-danger)" }}>{error}</div>
      ) : (
        <div className="bg-bg-muted border border-border" style={{ borderRadius: 10, overflow: "auto" }}>
          <table className={s.table}>
            <thead>
              <tr>
                {["客户编码", "客户名称", "客户类型", "联系人", "信用额度", "信用已用", "状态"].map(h => (
                  <th key={h} style={{ whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>暂无数据</td></tr>
              ) : items.map((c, i) => {
                const st = STATUS_MAP[c.status ?? ""] ?? { label: c.status ?? "-", color: "var(--text-secondary)" };
                return (
                  <tr key={c.id ?? i} className="border-b border-border/30"
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(148,163,184,0.08)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <td className="text-text-muted" style={{ fontFamily: "monospace" }}>{c.customerCode ?? "-"}</td>
                    <td className="text-text">{c.customerName}</td>
                    <td className="text-text-muted">{TYPE_MAP[c.customerType ?? ""] ?? c.customerType ?? "-"}</td>
                    <td className="text-text-muted">{c.contactName ?? "-"}</td>
                    <td className="text-text">{c.creditLimit != null ? c.creditLimit.toLocaleString() : "-"}</td>
                    <td className="text-text">{c.creditUsed != null ? c.creditUsed.toLocaleString() : "-"}</td>
                    <td>
                      <span style={{ padding: "2px 8px", borderRadius: 4, background: `${st.color}22`, color: st.color, fontSize: 11, fontWeight: 600 }}>
                        {st.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 分页 */}
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
