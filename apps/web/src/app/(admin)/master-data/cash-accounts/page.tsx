"use client";
import { useState, useEffect, useCallback } from "react";
import { Wallet, Search, RefreshCw, ExternalLink } from "lucide-react";
import Link from "next/link";
import { usePermission } from "@/hooks/usePermission";
import PageHeader from "@/components/PageHeader";
import s from "@/components/ui/admin-ui.module.css";

/**
 * 主数据中心 — 资金账户档案
 * 数据来源：Finance V2 Cash Runtime → GET /api/v2/finance/cash/accounts
 * 完整管理入口：/finance2/cash-accounts
 */

const tok = () =>
  typeof window !== "undefined"
    ? sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || ""
    : "";
const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${tok()}` });

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  ACTIVE:  { label: "启用", color: "var(--status-success)" },
  FROZEN:  { label: "冻结", color: "var(--status-warning)" },
  CLOSED:  { label: "注销", color: "var(--text-secondary)" },
};
const ACCOUNT_TYPE_MAP: Record<string, string> = {
  CASH:       "现金账户",
  BANK:       "银行账户",
  MOBILE_PAY: "移动支付",
  ADVANCE:    "备用金",
};

interface CashAccount {
  id: string | number;
  accountCode?: string;
  accountName: string;
  accountType?: string;
  bankName?: string;
  bankAccountNo?: string;
  currency?: string;
  balance?: number;
  status?: string;
  companyCode?: string;
  companyName?: string;
}

export default function MdCashAccountsPage() {
  const { canView } = usePermission("MENU_FIN2_CASH");
  const [items, setItems] = useState<CashAccount[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/v2/finance/cash/accounts?limit=100", { headers: hdr() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const arr: CashAccount[] = Array.isArray(data) ? data : (data.data ?? data.accounts ?? data.items ?? []);
      setItems(arr);
      setTotal(typeof data.total === "number" ? data.total : arr.length);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  if (!canView) return (
    <div className="text-text-muted" style={{ padding: 40, textAlign: "center" }}>无权限查看资金账户档案</div>
  );

  const filtered = items.filter(a =>
    !search || (a.accountName ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (a.accountCode ?? "").includes(search) || (a.bankName ?? "").includes(search)
  );

  return (
    <div className="bg-bg-card text-text min-h-screen" style={{ padding: "24px 32px" }}>
      <PageHeader
        title="资金账户档案"
        subtitle="现金 / 银行账户 · 余额监控"
        breadcrumb={["主数据中心", "资金账户档案"]}
      />

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "0 0 260px" }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索账户名称 / 编码 / 银行..."
            className="bg-bg-muted border border-border text-text"
            style={{ width: "100%", padding: "7px 10px 7px 32px", borderRadius: 7, fontSize: 13, outline: "none" }} />
        </div>
        <button onClick={load} className="bg-bg-muted border border-border text-text-muted" style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 7, fontSize: 13, cursor: "pointer" }}>
          <RefreshCw size={13} /> 刷新
        </button>
        <div style={{ flex: 1 }} />
        <Link href="/finance2/cash-accounts" style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "var(--color-accent)", border: "none", borderRadius: 7, color: "var(--text-on-dark)", fontSize: 13, cursor: "pointer", textDecoration: "none", fontWeight: 600 }}>
          <ExternalLink size={13} /> 完整管理
        </Link>
      </div>

      <div className="text-text-muted" style={{ marginBottom: 12, fontSize: 12 }}>
        共 <span style={{ fontWeight: 600 }}>{filtered.length}</span> 个账户
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: "center", color: "var(--text-secondary)" }}>加载中...</div>
      ) : error ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--status-danger)" }}>{error}</div>
      ) : (
        <div className="bg-bg-muted border border-border" style={{ borderRadius: 10, overflow: "auto" }}>
          <table className={s.table}>
            <thead>
              <tr>
                {["账户名称", "账户类型", "银行名称", "银行账号", "货币", "余额", "所属公司", "状态"].map(h => (
                  <th key={h} style={{ whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>暂无数据</td></tr>
              ) : filtered.map((a, i) => {
                const st = STATUS_MAP[a.status ?? "ACTIVE"] ?? { label: a.status ?? "-", color: "var(--text-secondary)" };
                const bal = a.balance;
                const balColor = bal == null ? "var(--text-secondary)" : bal >= 0 ? "var(--status-success)" : "var(--status-danger)";
                return (
                  <tr key={a.id ?? i} className="border-b border-border/30"
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(148,163,184,0.08)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <td className="text-text">{a.accountName}</td>
                    <td className="text-text-muted">{ACCOUNT_TYPE_MAP[a.accountType ?? ""] ?? a.accountType ?? "-"}</td>
                    <td className="text-text-muted">{a.bankName ?? "-"}</td>
                    <td className="text-text-muted" style={{ fontFamily: "monospace", fontSize: 12 }}>{a.bankAccountNo ?? "-"}</td>
                    <td className="text-text-muted">{a.currency ?? "-"}</td>
                    <td style={{ color: balColor, fontWeight: 600 }}>
                      {bal != null ? bal.toLocaleString("zh-CN", { minimumFractionDigits: 2 }) : "-"}
                    </td>
                    <td className="text-text-muted" style={{ fontSize: 12 }}>{a.companyName ?? a.companyCode ?? "-"}</td>
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
    </div>
  );
}
