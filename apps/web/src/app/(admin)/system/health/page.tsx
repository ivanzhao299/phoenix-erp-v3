"use client";
import { useState, useEffect, useCallback } from "react";
import u from "@/styles/uix-utils.module.css";
import PageHeader from "@/components/PageHeader";
import {
  Activity, Database, Cpu, Server, AlertTriangle,
  RefreshCw, CheckCircle, XCircle, Clock, TrendingUp, ShieldAlert,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import s from "@/components/ui/admin-ui.module.css";

type HealthStatus = "HEALTHY" | "DEGRADED" | "UNKNOWN";

interface HealthSummary {
  status:       HealthStatus;
  timestamp:    string;
  database:     { connected: boolean; pool: Record<string, number> };
  memory:       { heapUsedMB: number; heapTotalMB: number; rssMB: number; usedPct: number };
  cpu:          { userMs: number; systemMs: number };
  recentErrors: number;
  openAlerts:   number;
}

interface ErrorStat {
  error_type:  string;
  http_status: number;
  count:       number;
  last_seen:   string;
}

function StatusBadge({ status }: { status: HealthStatus }) {
  const color = status === "HEALTHY" ? "var(--status-success)" : status === "DEGRADED" ? "var(--status-warning)" : "var(--gray-400)";
  const bg    = status === "HEALTHY" ? "var(--status-success-bg-faint)" : status === "DEGRADED" ? "var(--status-warning-bg-faint)" : "var(--gray-100)";
  const label = status === "HEALTHY" ? "正常" : status === "DEGRADED" ? "降级" : "未知";
  return (
    <span style={{ padding: "2px 10px", borderRadius: 99, background: bg, color, fontWeight: 700, fontSize: 13 }}>
      {label}
    </span>
  );
}

function MetricCard({
  icon, title, value, unit, sub, borderColor,
}: {
  icon: React.ReactNode; title: string; value: string | number; unit?: string; sub?: string; borderColor?: string;
}) {
  return (
    <div style={{
      background: "var(--bg-card)", border: "1px solid var(--border)",
      borderLeft: `var(--card-accent-width) solid ${borderColor ?? "var(--primary)"}`,
      borderRadius: "var(--radius-lg)", padding: "16px 20px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, color: "var(--text-secondary)" }}>
        {icon}
        <span style={{ fontSize: 12, fontWeight: 600 }}>{title}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)" }}>
        {value}
        {unit && <span style={{ fontSize: 13, fontWeight: 400, marginLeft: 4 }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function SystemHealthPage() {
  const { t } = useLanguage();
  const [summary,     setSummary]     = useState<HealthSummary | null>(null);
  const [errorStats,  setErrorStats]  = useState<ErrorStat[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string>("");

  const tok = () => (typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") ?? "" : "");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${tok()}` };
      const [healthRes, errRes] = await Promise.allSettled([
        fetch("/api/system/monitor/health",  { headers }),
        fetch("/api/system/monitor/errors",  { headers }),
      ]);

      if (healthRes.status === "fulfilled" && healthRes.value.ok) {
        setSummary(await healthRes.value.json());
      }
      if (errRes.status === "fulfilled" && errRes.value.ok) {
        const d = await errRes.value.json();
        setErrorStats(d.summary ?? []);
      }
    } finally {
      setLoading(false);
      setLastRefresh(new Date().toLocaleTimeString("zh-CN"));
    }
  }, []);

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 30_000); // 30s 自动刷新
    return () => clearInterval(timer);
  }, [fetchData]);

  const overall: HealthStatus = summary?.status ?? "UNKNOWN";
  const overallColor = overall === "HEALTHY" ? "var(--status-success)" : overall === "DEGRADED" ? "var(--status-warning)" : "var(--gray-400)";

  return (
    <div>
      <PageHeader
        title="系统监控"
        subtitle={`生产运行状态 · 每 30 秒自动刷新 · 上次: ${lastRefresh || "—"}`}
        actions={
          <button
            onClick={fetchData}
            disabled={loading}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 16px", borderRadius: "var(--radius-md)",
              background: "var(--primary)", color: "var(--bg-card)", border: "none",
              cursor: loading ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600,
            }}
          >
            <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            刷新
          </button>
        }
      />

      {/* 整体状态横幅 */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "14px 20px", marginBottom: 24,
        background: `${overallColor}15`, borderRadius: "var(--radius-lg)",
        border: `1px solid ${overallColor}40`,
      }}>
        {overall === "HEALTHY"
          ? <CheckCircle size={20} color={overallColor} />
          : <AlertTriangle size={20} color={overallColor} />
        }
        <span style={{ fontWeight: 700, fontSize: 15, color: overallColor }}>
          系统整体状态：
        </span>
        <StatusBadge status={overall} />
        {summary && (
          <span style={{ fontSize: 12, color: "var(--text-secondary)", marginLeft: "auto" }}>
            最后检测：{new Date(summary.timestamp).toLocaleString("zh-CN")}
          </span>
        )}
      </div>

      {/* 核心指标卡片 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
        <MetricCard
          icon={<Database size={16} />}
          title="数据库连接"
          value={summary?.database.connected ? "在线" : "离线"}
          borderColor={summary?.database.connected ? "var(--status-success)" : "var(--status-danger)"}
          sub={`连接池 total: ${summary?.database.pool?.total ?? "—"} / idle: ${summary?.database.pool?.idle ?? "—"}`}
        />
        <MetricCard
          icon={<Cpu size={16} />}
          title="堆内存占用"
          value={summary?.memory.heapUsedMB ?? "—"}
          unit="MB"
          borderColor={
            (summary?.memory.usedPct ?? 0) > 85 ? "var(--status-danger)"
            : (summary?.memory.usedPct ?? 0) > 70 ? "var(--status-warning)" : "var(--color-accent)"
          }
          sub={`已用 ${summary?.memory.usedPct ?? "—"}%，共 ${summary?.memory.heapTotalMB ?? "—"} MB`}
        />
        <MetricCard
          icon={<Server size={16} />}
          title="进程内存 (RSS)"
          value={summary?.memory.rssMB ?? "—"}
          unit="MB"
          borderColor="var(--color-purple-600)"
          sub="Node.js 进程驻留集"
        />
        <MetricCard
          icon={<AlertTriangle size={16} />}
          title="近 1h 错误数"
          value={summary?.recentErrors ?? "—"}
          borderColor={(summary?.recentErrors ?? 0) > 0 ? "var(--status-danger)" : "var(--status-success)"}
          sub="系统 500/PG 错误"
        />
        <MetricCard
          icon={<ShieldAlert size={16} />}
          title="未处理告警"
          value={summary?.openAlerts ?? "—"}
          borderColor={(summary?.openAlerts ?? 0) > 0 ? "var(--status-warning)" : "var(--status-success)"}
          sub="点击告警页面处理"
        />
        <MetricCard
          icon={<Activity size={16} />}
          title="CPU 用户态"
          value={summary?.cpu.userMs ?? "—"}
          unit="ms"
          borderColor="var(--status-info)"
          sub={`系统态: ${summary?.cpu.systemMs ?? "—"} ms`}
        />
      </div>

      {/* 24h 错误类型分布 */}
      <div style={{
        background: "var(--bg-card)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", padding: "20px 24px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>过去 24 小时错误分布</h3>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {errorStats.length} 种错误类型
          </span>
        </div>

        {errorStats.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: "var(--status-success)" }}>
            <CheckCircle size={32} />
            <p style={{ margin: "8px 0 0", fontWeight: 600 }}>近 24 小时无错误记录</p>
          </div>
        ) : (
          <div className={u.scrollX}>
            <table className={s.table}>
              <thead>
                <tr>
                  {["错误类型", "HTTP状态", "次数", "最近发生"].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {errorStats.map((row, i) => (
                  <tr key={i}>
                    <td>
                      <span style={{
                        padding: "1px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700,
                        background: row.error_type === "UNHANDLED" ? "var(--status-danger-bg-faint)" : "var(--status-warning-bg-faint)",
                        color: row.error_type === "UNHANDLED" ? "var(--status-danger)" : "var(--status-warning)",
                      }}>{row.error_type}</span>
                    </td>
                    <td style={{ fontFamily: "monospace" }}>{row.http_status}</td>
                    <td style={{ color: Number(row.count) > 10 ? "var(--status-danger)" : "inherit" }}>
                      {row.count}
                    </td>
                    <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                      {new Date(row.last_seen).toLocaleString("zh-CN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
