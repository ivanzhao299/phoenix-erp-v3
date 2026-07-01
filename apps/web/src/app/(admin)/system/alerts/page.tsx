"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import u from "@/styles/uix-utils.module.css";
import PageHeader from "@/components/PageHeader";
import { CheckCircle, RefreshCw, AlertTriangle, Activity, Database, ShieldAlert, ListChecks } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import s from "@/components/ui/admin-ui.module.css";
import { primaryActionButton, secondaryActionButton } from "@/components/design-system/cockpit-styles";

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
interface HealthSummary {
  status: "HEALTHY" | "DEGRADED" | "UNKNOWN";
  database?: { connected?: boolean };
  recentErrors?: number;
  openAlerts?: number;
  timestamp?: string;
}
interface ErrorStat {
  error_type: string;
  http_status: number;
  count: number;
  last_seen: string;
}
interface QualityAlert {
  severity: "LOW" | "MEDIUM" | "HIGH";
  message: string;
}

const SEVERITY_STYLE: Record<string, { bg: string; color: string }> = {
  CRITICAL: { bg: "var(--status-danger-bg-faint)", color: "var(--status-danger)" },
  WARNING:  { bg: "var(--status-warning-bg-faint)", color: "var(--status-warning)" },
  INFO:     { bg: "var(--status-info-bg)", color: "var(--color-accent)" },
};

const MONITORED_SOURCES = [
  { label: "API 500 / PG 错误", desc: "后端异常过滤器写入 sys_alerts，并保留错误日志" },
  { label: "定时任务失败", desc: "Cron 失败写入 CRON_FAILURE 告警" },
  { label: "IoT 同步异常", desc: "设备离线、同步失败进入系统告警或环境预警" },
  { label: "数据质量风险", desc: "主数据、字典、权限、库存等问题进入数据质量中心" },
];

function toneColor(tone: "success" | "warning" | "danger" | "info") {
  if (tone === "success") return "var(--status-success)";
  if (tone === "warning") return "var(--status-warning)";
  if (tone === "danger") return "var(--status-danger)";
  return "var(--color-accent)";
}

function SummaryCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  hint: string;
  tone: "success" | "warning" | "danger" | "info";
}) {
  const color = toneColor(tone);
  return (
    <div style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderLeft: `var(--card-accent-width) solid ${color}`,
      borderRadius: "var(--radius-lg)",
      padding: 16,
      minHeight: 120,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-secondary)", fontSize: 12, fontWeight: 700 }}>
        <span style={{ color, display: "flex" }}>{icon}</span>
        {label}
      </div>
      <div style={{ marginTop: 14, fontSize: 28, lineHeight: 1, fontWeight: 800, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.5, color: "var(--text-secondary)" }}>
        {hint}
      </div>
    </div>
  );
}

export default function SystemAlertsPage() {
  const { t } = useLanguage();
  const [alerts,    setAlerts]    = useState<Alert[]>([]);
  const [total,     setTotal]     = useState(0);
  const [health,    setHealth]    = useState<HealthSummary | null>(null);
  const [errorStats,setErrorStats]= useState<ErrorStat[]>([]);
  const [qualityAlerts, setQualityAlerts] = useState<QualityAlert[]>([]);
  const [loadError, setLoadError] = useState("");
  const [loading,   setLoading]   = useState(false);
  const [resolving, setResolving] = useState<number | null>(null);
  const [filterResolved, setFilterResolved] = useState<"" | "true" | "false">("");

  const tok = () => sessionStorage.getItem("phoenix_token") ?? "";

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const params = filterResolved !== "" ? `?resolved=${filterResolved}` : "";
      const headers = { Authorization: `Bearer ${tok()}` };
      const [alertsRes, healthRes, errorsRes, qualityRes] = await Promise.allSettled([
        fetch(`/api/system/alerts${params}`, { headers }),
        fetch("/api/system/monitor/health", { headers }),
        fetch("/api/system/monitor/errors", { headers }),
        fetch("/api/data-quality/alerts", { headers }),
      ]);
      if (alertsRes.status === "fulfilled" && alertsRes.value.ok) {
        const d = await alertsRes.value.json();
        setAlerts(d.items ?? []);
        setTotal(d.total ?? 0);
      } else {
        setAlerts([]);
        setTotal(0);
        setLoadError("系统告警台账读取失败，请检查 MENU_SYS_MONITOR 权限或后端接口。");
      }
      if (healthRes.status === "fulfilled" && healthRes.value.ok) {
        setHealth(await healthRes.value.json());
      } else {
        setHealth(null);
      }
      if (errorsRes.status === "fulfilled" && errorsRes.value.ok) {
        const d = await errorsRes.value.json();
        setErrorStats(Array.isArray(d.summary) ? d.summary : []);
      } else {
        setErrorStats([]);
      }
      if (qualityRes.status === "fulfilled" && qualityRes.value.ok) {
        const d = await qualityRes.value.json();
        setQualityAlerts(Array.isArray(d) ? d : []);
      } else {
        setQualityAlerts([]);
      }
    } finally { setLoading(false); }
  }, [filterResolved]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  const handleResolve = async (id: number) => {
    if (!confirm(t('ui.确认将此告警标记为已处理？此操作不可撤销。','确认将此告警标记为已处理？此操作不可撤销。'))) return;
    setResolving(id);
    try {
      const res = await fetch(`/api/system/alerts/${id}/resolve`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ remark: "手动处理" }),
      });
      if (res.ok) fetchAlerts();
      else alert(t('ui.处理失败，请检查权限','处理失败，请检查权限'));
    } finally { setResolving(null); }
  };

  const unresolvedCount = alerts.filter(a => !a.resolved).length;
  const criticalCount = alerts.filter(a => a.severity === "CRITICAL" && !a.resolved).length;
  const recentErrorCount = health?.recentErrors ?? errorStats.reduce((sum, row) => sum + Number(row.count || 0), 0);
  const highQualityCount = qualityAlerts.filter(a => a.severity === "HIGH").length;
  const healthTone = health?.status === "HEALTHY" ? "success" : health?.status === "DEGRADED" ? "warning" : "info";

  return (
    <div>
      <PageHeader
        title={t('ui.异常告警','异常告警')}
        subtitle={`生产值班台账 · 只展示需要人工确认的异常 · 0 条代表当前筛选下无待处理系统故障 · 共 ${total} 条`}
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select
              value={filterResolved}
              onChange={e => setFilterResolved(e.target.value as "" | "true" | "false")}
              style={{ padding: "6px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", fontSize: 13 }}
            >
              <option value="">{t('ui.全部','全部')}</option>
              <option value="false">{t('ui.未处理','未处理')}</option>
              <option value="true">{t('ui.已处理','已处理')}</option>
            </select>
            <button
              onClick={fetchAlerts}
              disabled={loading}
              style={{ ...primaryActionButton, opacity: loading ? 0.55 : 1, cursor: loading ? "not-allowed" : "pointer" }}
            >
              <RefreshCw size={13} />{t('ui.刷新','刷新')}
            </button>
          </div>
        }
      />

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
        gap: 14,
        marginBottom: 18,
      }}>
        <SummaryCard
          icon={<ShieldAlert size={16} />}
          label="未处理系统告警"
          value={unresolvedCount}
          hint="来自 sys_alerts，处理后仍保留审计记录"
          tone={unresolvedCount > 0 ? "warning" : "success"}
        />
        <SummaryCard
          icon={<AlertTriangle size={16} />}
          label="严重告警"
          value={criticalCount}
          hint="API 500、Cron 失败、IoT 同步失败等会标为 CRITICAL"
          tone={criticalCount > 0 ? "danger" : "success"}
        />
        <SummaryCard
          icon={<Activity size={16} />}
          label="近 1 小时错误"
          value={recentErrorCount}
          hint="来自系统监控错误日志，用于判断是否有新故障"
          tone={recentErrorCount > 0 ? "danger" : "success"}
        />
        <SummaryCard
          icon={<ListChecks size={16} />}
          label="数据质量告警"
          value={qualityAlerts.length}
          hint={highQualityCount > 0 ? `${highQualityCount} 条高风险，进入数据质量中心处理` : "主数据、字典、权限、库存等质量检查"}
          tone={highQualityCount > 0 ? "warning" : "info"}
        />
        <SummaryCard
          icon={<Database size={16} />}
          label="系统健康探针"
          value={health?.status === "HEALTHY" ? "正常" : health?.status === "DEGRADED" ? "降级" : "未知"}
          hint={health?.database?.connected === false ? "数据库连接不可用" : health?.timestamp ? `最后检测 ${new Date(health.timestamp).toLocaleTimeString("zh-CN")}` : "等待监控接口返回"}
          tone={healthTone}
        />
      </div>

      <div style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: 16,
        marginBottom: 18,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
      }}>
        <div>
          <div style={{ fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>这个页面的用途</div>
          <div style={{ color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.6 }}>
            集中查看需要人工确认的系统异常。它不是普通通知列表，遵循 append-only 安全约束：不能删除，只能标记处理，保留故障审计链路。
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/system/health" style={secondaryActionButton}>查看系统监控</Link>
          <Link href="/system/error-logs" style={secondaryActionButton}>查看错误日志</Link>
          <Link href="/data-quality" style={secondaryActionButton}>查看数据质量</Link>
        </div>
      </div>

      {loadError && (
        <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--status-danger-bg-light)", color: "var(--status-danger)", background: "var(--status-danger-bg-faint)", fontSize: 13 }}>
          {loadError}
        </div>
      )}

      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        <table className={s.table}>
          <thead>
            <tr>
              {[t('ui.告警类型','告警类型'), t('ui.级别','级别'), t('ui.标题','标题'), t('ui.相关路径','相关路径'), t('ui.状态','状态'), t('ui.创建时间','创建时间'), t('ui.操作','操作')].map(h => (
                <th key={h} className={u.nowrap}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {alerts.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: "center", padding: 48, color: "var(--status-success)" }}>
                <CheckCircle size={28} />
                <p style={{ margin: "8px 0 0", fontWeight: 700 }}>{filterResolved === "true" ? "当前没有已处理告警记录" : "当前没有需要处理的系统告警"}</p>
                <p style={{ margin: "8px auto 0", maxWidth: 720, color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.7 }}>
                  这不是空白页：它表示 sys_alerts 台账当前为空或筛选条件下无记录。系统仍在持续监听以下风险源，出现需人工处理的问题后会自动进入此表。
                </p>
                <div style={{
                  margin: "20px auto 0",
                  maxWidth: 900,
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
                  gap: 10,
                  textAlign: "left",
                }}>
                  {MONITORED_SOURCES.map(src => (
                    <div key={src.label} style={{
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                      background: "var(--bg-page)",
                      padding: "10px 12px",
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary)", marginBottom: 4 }}>{src.label}</div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.55 }}>{src.desc}</div>
                    </div>
                  ))}
                </div>
              </td></tr>
            ) : alerts.map((a, i) => {
              const sty = SEVERITY_STYLE[a.severity] ?? SEVERITY_STYLE.INFO;
              return (
                <tr key={a.id}>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>{a.alert_type}</td>
                  <td>
                    <span style={{ padding: "1px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700, ...sty }}>
                      {a.severity}
                    </span>
                  </td>
                  <td style={{ maxWidth: 260 }}>{a.title}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 11, color: "var(--text-secondary)" }}>
                    {a.related_path ?? "—"}
                  </td>
                  <td>
                    {a.resolved
                      ? <span style={{ color: "var(--status-success)", fontWeight: 600, fontSize: 12 }}>✅ {t('ui.已处理','已处理')}</span>
                      : <span style={{ color: "var(--status-warning)", fontWeight: 600, fontSize: 12 }}>⏳ {t('ui.待处理','待处理')}</span>}
                  </td>
                  <td style={{ color: "var(--text-secondary)", fontSize: 12, whiteSpace: "nowrap" }}>
                    {new Date(a.created_at).toLocaleString("zh-CN")}
                  </td>
                  <td>
                    {!a.resolved && (
                      <button
                        onClick={() => handleResolve(a.id)}
                        disabled={resolving === a.id}
                        style={{
                          padding: "4px 12px", borderRadius: "var(--radius-md)", fontSize: 12,
                          background: "var(--status-success)", color: "var(--bg-card)", border: "none",
                          cursor: resolving === a.id ? "not-allowed" : "pointer", fontWeight: 600,
                        }}
                      >
                        {resolving === a.id ? t('ui.处理中...','处理中...') : t('ui.标记处理','标记处理')}
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
