"use client";
import { useState, useEffect, useCallback } from "react";
import { BarChart2, AlertTriangle, TrendingUp, RefreshCw, Users, ShieldOff } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import s from "@/components/ui/admin-ui.module.css";

// ── API helper ────────────────────────────────────────────────────────────────
function tok() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "";
}
const BASE = process.env.NEXT_PUBLIC_API_BASE || "";
async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(BASE + path, {
    headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.message || `HTTP ${res.status}`);
  }
  const d = await res.json();
  return d.data ?? d;
}

// ── 信用状态颜色 ──────────────────────────────────────────────────────────────
const CREDIT_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  NORMAL:     { label: "正常",   color: "#22c55e", bg: "rgba(34,197,94,0.1)"   },
  WARNING:    { label: "预警",   color: "#f59e0b", bg: "rgba(245,158,11,0.1)"  },
  OVER_LIMIT: { label: "超额度", color: "#ef4444", bg: "rgba(239,68,68,0.1)"   },
  OVERDUE:    { label: "逾期",   color: "#dc2626", bg: "rgba(220,38,38,0.1)"   },
  FROZEN:     { label: "冻结",   color: "#6b7280", bg: "rgba(107,114,128,0.1)" },
};

// ── Tab 定义 ──────────────────────────────────────────────────────────────────
type ReportTab = "overdue" | "high-risk" | "frozen" | "aging" | "returns" | "inventory";

/**
 * Sales V2 Phase 5/6 — 销售报表（客户欠款分析 + 退货分析）
 */
export default function SalesV2ReportsPage() {
  const [tab, setTab] = useState<ReportTab>("overdue");

  return (
    <div className="animate-fade-in" style={{ padding: "0 0 40px" }}>
      <PageHeader
        title="销售报表"
        subtitle="客户欠款分析 · 逾期预警 · 信用风险 · 账龄分布 · 退货分析"
        breadcrumb={["销售系统", "销售报表"]}
      />

      {/* Tab Bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--border)", paddingBottom: 0 }}>
        {([
          { id: "overdue",   label: "⚠ 逾期客户",   icon: <AlertTriangle size={13} /> },
          { id: "high-risk", label: "● 高风险客户",  icon: <TrendingUp size={13} />    },
          { id: "frozen",    label: "🔒 冻结客户",   icon: <ShieldOff size={13} />     },
          { id: "aging",     label: "账龄分析",      icon: <BarChart2 size={13} />     },
          { id: "returns",   label: "退货分析",      icon: <RefreshCw size={13} />     },
          { id: "inventory", label: "库存损耗",       icon: <BarChart2 size={13} />     },
        ] as { id: ReportTab; label: string; icon: React.ReactNode }[]).map(({ id, label, icon }) => (
          <button key={id} type="button" onClick={() => setTab(id)} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "8px 16px",
            border: "none", background: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
            color: tab === id ? "var(--color-primary)" : "var(--text-secondary)",
            borderBottom: tab === id ? "2px solid var(--color-primary)" : "2px solid transparent",
            marginBottom: -1,
          }}>{icon}{label}</button>
        ))}
      </div>

      {tab === "overdue"   && <OverdueReport />}
      {tab === "high-risk" && <HighRiskReport />}
      {tab === "frozen"    && <FrozenReport />}
      {tab === "aging"     && <AgingReport />}
      {tab === "returns"   && <ReturnReport />}
      {tab === "inventory" && <InventoryReport />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 逾期客户报表
// ══════════════════════════════════════════════════════════════════════════════
function OverdueReport() {
  const [rows, setRows]     = useState<any[]>([]);
  const [total, setTotal]   = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage]     = useState(1);
  const limit = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), limit: String(limit) });
      const res = await apiFetch(`/api/v2/sales/credit/overdue-customers?${p}`);
      setRows(res.data ?? []);
      setTotal(Number(res.total ?? 0));
    } catch { setRows([]); } finally { setLoading(false); }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      {/* 统计头 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "逾期/预警客户", value: total, icon: <AlertTriangle size={20} color="#f59e0b" />, color: "#f59e0b" },
          { label: "数据来源", value: "Finance V2 AR", icon: <BarChart2 size={20} color="#6366f1" />, color: "#6366f1" },
          { label: "每日自动更新", value: "02:00 AM", icon: <RefreshCw size={20} color="#22c55e" />, color: "#22c55e" },
        ].map(({ label, value, icon, color }) => (
          <div key={label} style={{ padding: "16px 20px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", display: "flex", alignItems: "center", gap: 12 }}>
            {icon}
            <div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>逾期 / 预警客户列表（按逾期天数降序）</div>
        <button type="button" className={s.btnSecondary} onClick={load} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, padding: "5px 12px" }}>
          <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} /> 刷新
        </button>
      </div>

      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "var(--bg-muted)", borderBottom: "1px solid var(--border)" }}>
              {["客户名称","公司","信用状态","逾期天数","逾期金额","最早逾期日","信用额度","已用额度","账期(天)"].map(h => (
                <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} style={{ textAlign: "center", padding: 32, color: "var(--text-secondary)" }}>加载中…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={9} style={{ textAlign: "center", padding: 32, color: "var(--text-secondary)" }}>暂无逾期客户，系统健康 ✓</td></tr>}
            {rows.map((row, i) => {
              const cs = CREDIT_STATUS[row.credit_status ?? "WARNING"] ?? CREDIT_STATUS.WARNING;
              const overdueDays = Number(row.overdue_days ?? 0);
              const overdueAmt  = Number(row.overdue_amount ?? 0);
              return (
                <tr key={row.id} style={{ borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none", background: overdueDays > 90 ? "rgba(220,38,38,0.03)" : undefined }}>
                  <td style={{ padding: "9px 12px", fontWeight: 600 }}>{row.customer_name}</td>
                  <td style={{ padding: "9px 12px", color: "var(--text-secondary)" }}>{row.company_code}</td>
                  <td style={{ padding: "9px 12px" }}>
                    <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: cs.bg, color: cs.color }}>{cs.label}</span>
                  </td>
                  <td style={{ padding: "9px 12px", fontWeight: 700, color: overdueDays > 60 ? "#dc2626" : overdueDays > 30 ? "#f59e0b" : "var(--text-primary)" }}>
                    {overdueDays > 0 ? `${overdueDays} 天` : "—"}
                  </td>
                  <td style={{ padding: "9px 12px", textAlign: "right", color: overdueAmt > 0 ? "#dc2626" : "var(--text-secondary)", fontWeight: 700, fontFamily: "monospace" }}>
                    {overdueAmt > 0 ? overdueAmt.toLocaleString() : "—"}
                  </td>
                  <td style={{ padding: "9px 12px", color: "var(--text-secondary)" }}>
                    {row.earliest_overdue_date ? String(row.earliest_overdue_date).slice(0, 10) : "—"}
                  </td>
                  <td style={{ padding: "9px 12px", textAlign: "right", fontFamily: "monospace", fontSize: 11 }}>
                    {Number(row.credit_limit ?? 0).toLocaleString()}
                  </td>
                  <td style={{ padding: "9px 12px", textAlign: "right", fontFamily: "monospace", fontSize: 11, color: "#f59e0b" }}>
                    {Number(row.credit_used ?? 0).toLocaleString()}
                  </td>
                  <td style={{ padding: "9px 12px", textAlign: "center" }}>{row.payment_terms ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12, alignItems: "center", fontSize: 12 }}>
          <span style={{ color: "var(--text-secondary)" }}>共 {total} 条</span>
          <button type="button" className={s.btnSecondary} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
          <span>第 {page} / {totalPages} 页</span>
          <button type="button" className={s.btnSecondary} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</button>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 高风险客户报表
// ══════════════════════════════════════════════════════════════════════════════
function HighRiskReport() {
  const [rows, setRows]     = useState<any[]>([]);
  const [total, setTotal]   = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage]     = useState(1);
  const limit = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), limit: String(limit) });
      const res = await apiFetch(`/api/v2/sales/credit/high-risk-customers?${p}`);
      setRows(res.data ?? []);
      setTotal(Number(res.total ?? 0));
    } catch { setRows([]); } finally { setLoading(false); }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const RISK_CFG: Record<string, { label: string; color: string }> = {
    NORMAL:    { label: "正常",   color: "#22c55e" },
    WATCH:     { label: "观察",   color: "#f59e0b" },
    HIGH:      { label: "高风险", color: "#ef4444" },
    BLACKLIST: { label: "黑名单", color: "#7f1d1d" },
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>高风险客户（共 {total} 个）</div>
        <button type="button" className={s.btnSecondary} onClick={load} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, padding: "5px 12px" }}>
          <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} /> 刷新
        </button>
      </div>

      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "var(--bg-muted)", borderBottom: "1px solid var(--border)" }}>
              {["客户名称","公司","风险等级","信用状态","状态","总欠款","信用额度","账期","已逾期"].map(h => (
                <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} style={{ textAlign: "center", padding: 32, color: "var(--text-secondary)" }}>加载中…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={9} style={{ textAlign: "center", padding: 32, color: "var(--text-secondary)" }}>暂无高风险客户 ✓</td></tr>}
            {rows.map((row, i) => {
              const riskCfg = RISK_CFG[row.risk_level] ?? RISK_CFG.NORMAL;
              const cs = CREDIT_STATUS[row.credit_status ?? "NORMAL"] ?? CREDIT_STATUS.NORMAL;
              const statusLabel = row.status === "FROZEN" ? "冻结" : row.status === "BLACKLIST" ? "黑名单" : "正常";
              const statusColor = row.status === "FROZEN" ? "#6b7280" : row.status === "BLACKLIST" ? "#7f1d1d" : "#22c55e";
              return (
                <tr key={row.id} style={{ borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none", background: row.risk_level === "BLACKLIST" ? "rgba(127,29,29,0.04)" : undefined }}>
                  <td style={{ padding: "9px 12px", fontWeight: 600 }}>{row.customer_name}</td>
                  <td style={{ padding: "9px 12px", color: "var(--text-secondary)" }}>{row.company_code}</td>
                  <td style={{ padding: "9px 12px" }}>
                    <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: "rgba(239,68,68,0.1)", color: riskCfg.color }}>{riskCfg.label}</span>
                  </td>
                  <td style={{ padding: "9px 12px" }}>
                    <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: cs.bg, color: cs.color }}>{cs.label}</span>
                  </td>
                  <td style={{ padding: "9px 12px" }}>
                    <span style={{ fontWeight: 600, color: statusColor }}>{statusLabel}</span>
                  </td>
                  <td style={{ padding: "9px 12px", textAlign: "right", fontFamily: "monospace", fontSize: 11, color: "#f59e0b", fontWeight: 700 }}>
                    {Number(row.total_receivable ?? row.credit_used ?? 0).toLocaleString()}
                  </td>
                  <td style={{ padding: "9px 12px", textAlign: "right", fontFamily: "monospace", fontSize: 11 }}>
                    {Number(row.credit_limit ?? 0).toLocaleString()}
                  </td>
                  <td style={{ padding: "9px 12px", textAlign: "center" }}>{row.payment_terms ?? 0} 天</td>
                  <td style={{ padding: "9px 12px", textAlign: "center" }}>
                    {row.last_overdue_at ? <span style={{ color: "#dc2626", fontWeight: 600 }}>是</span> : <span style={{ color: "#22c55e" }}>否</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12, alignItems: "center", fontSize: 12 }}>
          <span style={{ color: "var(--text-secondary)" }}>共 {total} 条</span>
          <button type="button" className={s.btnSecondary} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
          <span>第 {page} / {totalPages} 页</span>
          <button type="button" className={s.btnSecondary} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</button>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 冻结客户报表
// ══════════════════════════════════════════════════════════════════════════════
function FrozenReport() {
  const [rows, setRows]       = useState<any[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage]       = useState(1);
  const limit = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), limit: String(limit), status: "FROZEN" });
      const res = await apiFetch(`/api/v2/sales/customers?${p}`);
      setRows(res.data ?? []);
      setTotal(Number(res.total ?? 0));
    } catch { setRows([]); } finally { setLoading(false); }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>冻结客户（共 {total} 个）</div>
        <button type="button" className={s.btnSecondary} onClick={load} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, padding: "5px 12px" }}>
          <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} /> 刷新
        </button>
      </div>

      {total > 0 && (
        <div style={{ padding: "10px 16px", borderRadius: 8, background: "rgba(107,114,128,0.08)", border: "1px solid rgba(107,114,128,0.2)", fontSize: 12, marginBottom: 16, color: "var(--text-secondary)" }}>
          冻结客户不能下单。自动冻结客户（auto_frozen=true）可由财务在客户信用页手动解冻。
        </div>
      )}

      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "var(--bg-muted)", borderBottom: "1px solid var(--border)" }}>
              {["客户名称","公司","风险等级","信用状态","冻结类型","信用额度","已用额度","最近逾期"].map(h => (
                <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} style={{ textAlign: "center", padding: 32, color: "var(--text-secondary)" }}>加载中…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={8} style={{ textAlign: "center", padding: 32, color: "var(--text-secondary)" }}>暂无冻结客户 ✓</td></tr>}
            {rows.map((row, i) => {
              const cs = CREDIT_STATUS[row.credit_status ?? "FROZEN"] ?? CREDIT_STATUS.FROZEN;
              return (
                <tr key={row.id} style={{ borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <td style={{ padding: "9px 12px", fontWeight: 600 }}>{row.customer_name}</td>
                  <td style={{ padding: "9px 12px", color: "var(--text-secondary)" }}>{row.company_code}</td>
                  <td style={{ padding: "9px 12px" }}>
                    <span style={{ fontSize: 11, color: row.risk_level === "BLACKLIST" ? "#7f1d1d" : "#f59e0b", fontWeight: 700 }}>{row.risk_level}</span>
                  </td>
                  <td style={{ padding: "9px 12px" }}>
                    <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: cs.bg, color: cs.color }}>{cs.label}</span>
                  </td>
                  <td style={{ padding: "9px 12px" }}>
                    {row.auto_frozen
                      ? <span style={{ color: "#dc2626", fontWeight: 600 }}>自动冻结</span>
                      : <span style={{ color: "#6b7280" }}>手工冻结</span>}
                  </td>
                  <td style={{ padding: "9px 12px", textAlign: "right", fontFamily: "monospace", fontSize: 11 }}>
                    {Number(row.credit_limit ?? 0).toLocaleString()}
                  </td>
                  <td style={{ padding: "9px 12px", textAlign: "right", fontFamily: "monospace", fontSize: 11, color: "#f59e0b" }}>
                    {Number(row.credit_used ?? 0).toLocaleString()}
                  </td>
                  <td style={{ padding: "9px 12px", color: "var(--text-secondary)" }}>
                    {row.last_overdue_at ? String(row.last_overdue_at).slice(0, 10) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12, alignItems: "center", fontSize: 12 }}>
          <span style={{ color: "var(--text-secondary)" }}>共 {total} 条</span>
          <button type="button" className={s.btnSecondary} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
          <span>第 {page} / {totalPages} 页</span>
          <button type="button" className={s.btnSecondary} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</button>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 全局账龄分析报表
// ══════════════════════════════════════════════════════════════════════════════
function AgingReport() {
  const [rows, setRows]       = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<{
    totalReceivable: number;
    overdueTotal: number;
    normalTotal: number;
    customerCount: number;
  } | null>(null);

  // 全量客户逾期汇总（复用 overdue-customers 接口，limit=200）
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/v2/sales/credit/overdue-customers?page=1&limit=200");
      const data: any[] = res.data ?? [];
      setRows(data);
      const totalReceivable = data.reduce((s, r) => s + Number(r.credit_used ?? 0), 0);
      const overdueTotal    = data.reduce((s, r) => s + Number(r.overdue_amount ?? 0), 0);
      setSummary({ totalReceivable, overdueTotal, normalTotal: totalReceivable - overdueTotal, customerCount: data.length });
    } catch { setRows([]); setSummary(null); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // 账龄分桶
  const BUCKETS = [
    { key: "notDue",   label: "未到期",     min: -Infinity, max: 0  },
    { key: "d1_30",    label: "逾期 1-30",   min: 1,  max: 30  },
    { key: "d31_60",   label: "逾期 31-60",  min: 31, max: 60  },
    { key: "d61_90",   label: "逾期 61-90",  min: 61, max: 90  },
    { key: "d91_180",  label: "逾期 91-180", min: 91, max: 180 },
    { key: "d181plus", label: "逾期 180+",   min: 181, max: Infinity },
  ];

  const bucketAmounts = BUCKETS.map(b => ({
    ...b,
    amount: rows
      .filter(r => { const d = Number(r.overdue_days ?? 0); return d >= b.min && d <= b.max; })
      .reduce((s, r) => s + Number(r.overdue_amount ?? 0), 0),
    count: rows.filter(r => { const d = Number(r.overdue_days ?? 0); return d >= b.min && d <= b.max; }).length,
  }));

  const maxAmount = Math.max(...bucketAmounts.map(b => b.amount), 1);
  const BUCKET_COLORS = ["#22c55e","#f59e0b","#fb923c","#ef4444","#dc2626","#7f1d1d"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* 刷新 */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="button" className={s.btnSecondary} onClick={load} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, padding: "5px 12px" }}>
          <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} /> 刷新
        </button>
      </div>

      {/* 汇总卡片 */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {[
            { label: "涉及客户数",   value: summary.customerCount, color: "#6366f1" },
            { label: "实时欠款合计", value: summary.totalReceivable.toLocaleString(), color: "#f59e0b" },
            { label: "其中逾期",     value: summary.overdueTotal.toLocaleString(),    color: "#ef4444" },
            { label: "未到期应收",   value: summary.normalTotal.toLocaleString(),     color: "#22c55e" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ padding: "14px 18px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" }}>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* 账龄条形图 */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "20px 24px" }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>账龄分桶（基于逾期客户）</div>
        {loading ? (
          <div style={{ textAlign: "center", padding: 32, color: "var(--text-secondary)" }}>加载中…</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {bucketAmounts.map((b, idx) => {
              const pct = maxAmount > 0 ? (b.amount / maxAmount) * 100 : 0;
              return (
                <div key={b.key} style={{ display: "grid", gridTemplateColumns: "120px 1fr 140px", gap: 12, alignItems: "center" }}>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", textAlign: "right" }}>{b.label}</div>
                  <div style={{ height: 24, background: "var(--bg-muted)", borderRadius: 6, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: BUCKET_COLORS[idx], borderRadius: 6, minWidth: b.amount > 0 ? 4 : 0, transition: "width 0.5s" }} />
                  </div>
                  <div style={{ fontSize: 12, fontFamily: "monospace", textAlign: "right" }}>
                    {b.count > 0 ? (
                      <span>
                        <strong style={{ color: BUCKET_COLORS[idx] }}>{b.amount.toLocaleString()}</strong>
                        <span style={{ color: "var(--text-secondary)", marginLeft: 6 }}>({b.count} 客户)</span>
                      </span>
                    ) : (
                      <span style={{ color: "var(--text-secondary)" }}>—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 欠款 TOP 20 */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", fontWeight: 700, fontSize: 14, borderBottom: "1px solid var(--border)" }}>
          欠款 TOP {Math.min(20, rows.length)} 客户
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "var(--bg-muted)", borderBottom: "1px solid var(--border)" }}>
              {["#","客户","公司","信用状态","逾期天数","逾期金额","总欠款"].map(h => (
                <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "var(--text-secondary)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} style={{ textAlign: "center", padding: 24, color: "var(--text-secondary)" }}>加载中…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", padding: 24, color: "var(--text-secondary)" }}>暂无数据 ✓</td></tr>}
            {rows.slice(0, 20).map((row, i) => {
              const cs = CREDIT_STATUS[row.credit_status ?? "WARNING"] ?? CREDIT_STATUS.WARNING;
              return (
                <tr key={row.id} style={{ borderBottom: i < Math.min(19, rows.length - 1) ? "1px solid var(--border)" : "none" }}>
                  <td style={{ padding: "8px 12px", color: "var(--text-secondary)", fontWeight: 700, fontSize: 14 }}>{i + 1}</td>
                  <td style={{ padding: "8px 12px", fontWeight: 600 }}>{row.customer_name}</td>
                  <td style={{ padding: "8px 12px", color: "var(--text-secondary)" }}>{row.company_code}</td>
                  <td style={{ padding: "8px 12px" }}>
                    <span style={{ padding: "1px 7px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: cs.bg, color: cs.color }}>{cs.label}</span>
                  </td>
                  <td style={{ padding: "8px 12px", fontWeight: 700, color: Number(row.overdue_days) > 60 ? "#dc2626" : "#f59e0b" }}>
                    {Number(row.overdue_days ?? 0) > 0 ? `${row.overdue_days} 天` : "—"}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "monospace", fontSize: 11, color: "#dc2626", fontWeight: 700 }}>
                    {Number(row.overdue_amount ?? 0) > 0 ? Number(row.overdue_amount).toLocaleString() : "—"}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "monospace", fontSize: 11, color: "#f59e0b", fontWeight: 700 }}>
                    {Number(row.credit_used ?? 0).toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 11, color: "var(--text-secondary)", textAlign: "center" }}>
        数据来源：Finance V2 fin_ar_invoices · 每日 02:00 AM 自动更新 · 数据权限按公司隔离
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 退货分析报表（Phase 6）
// ══════════════════════════════════════════════════════════════════════════════
function ReturnReport() {
  const [analysis, setAnalysis] = useState<{
    topCustomers: Array<{ customer_code: string; customer_name: string; return_count: number; total_amount: number }>;
    topProducts: Array<{ product_code: string; product_name: string; return_count: number; total_qty: number; damaged_qty: number }>;
    summary: { totalReturns: number; totalAmount: number; deliveryRejectCount: number; damageCount: number; damageRate: string };
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/api/v2/sales/returns/analysis");
      setAnalysis(data);
    } catch { setAnalysis(null); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const maxCust = Math.max(1, ...(analysis?.topCustomers ?? []).map(c => Number(c.return_count)));
  const maxProd = Math.max(1, ...(analysis?.topProducts ?? []).map(p => Number(p.return_count)));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="button" className={s.btnSecondary} onClick={load} disabled={loading}
          style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, padding: "5px 12px" }}>
          <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} /> 刷新
        </button>
      </div>

      {/* 汇总统计 */}
      {analysis?.summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12 }}>
          {[
            { label: "退货总单数",   value: analysis.summary.totalReturns,        color: "#6b7280" },
            { label: "退货总金额",   value: Number(analysis.summary.totalAmount).toLocaleString(), color: "#3b82f6" },
            { label: "配送拒收",     value: analysis.summary.deliveryRejectCount,  color: "#f59e0b" },
            { label: "破损退货",     value: analysis.summary.damageCount,          color: "#ef4444" },
            { label: "破损率(30天)", value: analysis.summary.damageRate,           color: "#8b5cf6" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "14px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color, marginBottom: 4 }}>{value}</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {loading && <div style={{ textAlign: "center", padding: 40, color: "var(--text-secondary)" }}>加载中…</div>}

      {/* TOP 退货客户 */}
      {analysis && (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>TOP 退货客户（近30天）</div>
          {analysis.topCustomers.length === 0 ? (
            <div style={{ color: "var(--text-secondary)", textAlign: "center", padding: 20 }}>暂无数据</div>
          ) : analysis.topCustomers.map((c, i) => (
            <div key={c.customer_code} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <span style={{ width: 22, height: 22, borderRadius: "50%", background: i < 3 ? "#ef4444" : "#9ca3af", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{c.customer_name ?? c.customer_code}</div>
                <div style={{ height: 6, background: "var(--bg-muted)", borderRadius: 3 }}>
                  <div style={{ height: "100%", background: "#ef4444", borderRadius: 3, width: `${(Number(c.return_count) / maxCust) * 100}%`, minWidth: 4 }} />
                </div>
              </div>
              <span style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{c.return_count} 单</span>
              <span style={{ fontSize: 12, color: "#ef4444", whiteSpace: "nowrap", fontFamily: "monospace" }}>{Number(c.total_amount).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      {/* TOP 退货产品 */}
      {analysis && (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>TOP 退货产品（近30天）</div>
          {analysis.topProducts.length === 0 ? (
            <div style={{ color: "var(--text-secondary)", textAlign: "center", padding: 20 }}>暂无数据</div>
          ) : analysis.topProducts.map((p, i) => (
            <div key={p.product_code} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <span style={{ width: 22, height: 22, borderRadius: "50%", background: i < 3 ? "#f59e0b" : "#9ca3af", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{p.product_name ?? p.product_code}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", display: "flex", gap: 8, marginTop: 2, marginBottom: 4 }}>
                  <span>退货 {p.total_qty} 件</span>
                  <span style={{ color: "#ef4444" }}>破损 {p.damaged_qty} 件</span>
                </div>
                <div style={{ height: 6, background: "var(--bg-muted)", borderRadius: 3 }}>
                  <div style={{ height: "100%", background: "#f59e0b", borderRadius: 3, width: `${(Number(p.return_count) / maxProd) * 100}%`, minWidth: 4 }} />
                </div>
              </div>
              <span style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{p.return_count} 次</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11, color: "var(--text-secondary)", textAlign: "center" }}>
        退货数据来源：sal_return_orders + sal_return_items · 统计范围：近 30 天已完成退货
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 库存损耗报表 — Phase 7
// ══════════════════════════════════════════════════════════════════════════════
function InventoryReport() {
  const [stats, setStats]   = useState<any>(null);
  const [loss, setLoss]     = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [s, l] = await Promise.all([
        apiFetch("/api/v2/sales/inventory/stats"),
        apiFetch("/api/v2/sales/inventory/loss-analysis"),
      ]);
      setStats(s); setLoss(l);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const fmt = (n: number | null | undefined) =>
    n == null ? "—" : Number(n).toLocaleString("zh-CN", { maximumFractionDigits: 0 });

  const changeTypeLabel: Record<string, string> = {
    EXPIRE_WRITEOFF: "过期核销",
    DAMAGE_WRITEOFF: "破损核销",
    WRITE_OFF: "手动核销",
  };

  if (loading) return <div style={{ textAlign: "center", color: "#9ca3af", padding: 40 }}>加载中...</div>;
  if (error)   return <div style={{ color: "#dc2626", padding: 16 }}>{error}</div>;
  if (!stats && !loss) return null;

  return (
    <div>
      {/* 汇总统计 */}
      {stats && (
        <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
          {[
            { label: "活跃批次",       value: fmt(stats.activeBatches),   color: "#374151" },
            { label: "总可用库存（枚）", value: fmt(stats.totalAvailable),  color: "#2563eb" },
            { label: "临期批次（≤7天）", value: fmt(stats.expiringBatches), color: "#d97706" },
            { label: "已过期批次",      value: fmt(stats.expiredBatches),  color: "#dc2626" },
            { label: "今日过期损耗",    value: fmt(stats.todayExpireLoss), color: "#be123c" },
            { label: "今日破损损耗",    value: fmt(stats.todayDamageLoss), color: "#b45309" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 18px",
            }}>
              <div style={{ fontSize: 11, color: "#6b7280" }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* 损耗按类型 */}
      {loss && (
        <>
          <h4 style={{ margin: "0 0 12px", color: "#374151" }}>损耗类型分布（近30天）</h4>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 24 }}>
            <thead>
              <tr style={{ background: "#faf5ff" }}>
                {["损耗类型","批次数","合计损耗（枚）"].map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, fontSize: 12, color: "#374151", borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(loss.byType ?? []).map((row: any, i: number) => (
                <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "8px 12px" }}>{changeTypeLabel[row.change_type] ?? row.change_type}</td>
                  <td style={{ padding: "8px 12px" }}>{fmt(row.batch_count)}</td>
                  <td style={{ padding: "8px 12px", fontWeight: 700, color: "#dc2626" }}>{fmt(row.total_loss)}</td>
                </tr>
              ))}
              {!(loss.byType?.length) && (
                <tr><td colSpan={3} style={{ textAlign: "center", color: "#9ca3af", padding: 24 }}>近30天无损耗记录</td></tr>
              )}
            </tbody>
          </table>

          {/* 损耗汇总 */}
          {loss.summary && (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              {[
                { label: "过期合计损耗", value: fmt(loss.summary.total_expire_loss), color: "#dc2626" },
                { label: "破损合计损耗", value: fmt(loss.summary.total_damage_loss), color: "#d97706" },
                { label: "合计总损耗",   value: fmt(loss.summary.total_loss),        color: "#7c3aed" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "12px 16px" }}>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>{label}（近30天，枚）</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div style={{ fontSize: 11, color: "var(--text-secondary)", textAlign: "center", marginTop: 16 }}>
        库存数据来源：inv_batches + inv_ledger · 统计范围：近 30 天变动记录
      </div>
    </div>
  );
}
