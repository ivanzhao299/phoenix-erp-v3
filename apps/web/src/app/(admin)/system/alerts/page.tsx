"use client";
import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/PageHeader";
import { ShieldAlert, CheckCircle, RefreshCw, AlertTriangle, Info } from "lucide-react";

interface Alert {
  id:            number;
  alert_type:    string;
  severity:      "INFO" | "WARNING" | "CRITICAL";
  title:         string;
  detail:        Record<string, unknown> | null;
  related_path:  string | null;
  resolved:      boolean;
  resolved_at:   string | null;
  resolved_by:   string | null;
  created_at:    string;
}

const SEVERITY_STYLE: Record<string, { bg: string; color: string }> = {
  CRITICAL: { bg: "#fee2e2", color: "#dc2626" },
  WARNING:  { bg: "#fef3c7", color: "#d97706" },
  INFO:     { bg: "#dbeafe", color: "#2563eb" },
};

export default function SystemAlertsPage() {
  const [alerts,    setAlerts]    = useState<Alert[]>([]);
  const [total,     setTotal]     = useState(0);
  const [loading,   setLoading]   = useState(false);
  const [resolving, setResolving] = useState<number | null>(null);
  const [filterResolved, setFilterResolved] = useState<"" | "true" | "false">("");

  const tok = () => sessionStorage.getItem("phoenix_token") ?? "";

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const params = filterResolved !== "" ? `?resolved=${filterResolved}` : "";
      const res = await fetch(`/api/system/alerts${params}`, {
        headers: { Authorization: `Bearer ${tok()}` },
      });
      if (res.ok) {
        const d = await res.json();
        setAlerts(d.items ?? []);
        setTotal(d.total ?? 0);
      }
    } finally { setLoading(false); }
  }, [filterResolved]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  const handleResolve = async (id: number) => {
    if (!confirm("确认将此告警标记为已处理？此操作不可撤销。")) return;
    setResolving(id);
    try {
      const res = await fetch(`/api/system/alerts/${id}/resolve`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ remark: "手动处理" }),
      });
      if (res.ok) fetchAlerts();
      else alert("处理失败，请检查权限");
    } finally { setResolving(null); }
  };

  return (
    <div>
      <PageHeader
        title="异常告警"
        subtitle={`共 ${total} 条 · 仅可标记处理，不可删除（append-only 安全约束）`}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <select
              value={filterResolved}
              onChange={e => setFilterResolved(e.target.value as "" | "true" | "false")}
              style={{ padding: "6px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", fontSize: 13 }}
            >
              <option value="">全部</option>
              <option value="false">未处理</option>
              <option value="true">已处理</option>
            </select>
            <button
              onClick={fetchAlerts}
              disabled={loading}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "6px 14px",
                borderRadius: "var(--radius-md)", background: "var(--primary)", color: "#fff",
                border: "none", cursor: loading ? "not-allowed" : "pointer", fontSize: 13,
              }}
            >
              <RefreshCw size={13} />刷新
            </button>
          </div>
        }
      />

      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
              {["告警类型", "级别", "标题", "相关路径", "状态", "创建时间", "操作"].map(h => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {alerts.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: "center", padding: 48, color: "#16a34a" }}>
                <CheckCircle size={28} />
                <p style={{ margin: "8px 0 0", fontWeight: 600 }}>无告警记录</p>
              </td></tr>
            ) : alerts.map((a, i) => {
              const sty = SEVERITY_STYLE[a.severity] ?? SEVERITY_STYLE.INFO;
              return (
                <tr key={a.id} style={{ borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "transparent" : "var(--bg-surface)" }}>
                  <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 12 }}>{a.alert_type}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{ padding: "1px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700, ...sty }}>
                      {a.severity}
                    </span>
                  </td>
                  <td style={{ padding: "10px 14px", maxWidth: 260 }}>{a.title}</td>
                  <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 11, color: "var(--text-secondary)" }}>
                    {a.related_path ?? "—"}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    {a.resolved
                      ? <span style={{ color: "#16a34a", fontWeight: 600, fontSize: 12 }}>✅ 已处理</span>
                      : <span style={{ color: "#d97706", fontWeight: 600, fontSize: 12 }}>⏳ 待处理</span>}
                  </td>
                  <td style={{ padding: "10px 14px", color: "var(--text-secondary)", fontSize: 12, whiteSpace: "nowrap" }}>
                    {new Date(a.created_at).toLocaleString("zh-CN")}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    {!a.resolved && (
                      <button
                        onClick={() => handleResolve(a.id)}
                        disabled={resolving === a.id}
                        style={{
                          padding: "4px 12px", borderRadius: "var(--radius-md)", fontSize: 12,
                          background: "#16a34a", color: "#fff", border: "none",
                          cursor: resolving === a.id ? "not-allowed" : "pointer", fontWeight: 600,
                        }}
                      >
                        {resolving === a.id ? "处理中..." : "标记处理"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
