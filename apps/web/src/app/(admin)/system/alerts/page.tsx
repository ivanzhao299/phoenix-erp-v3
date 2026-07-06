"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import u from "@/styles/uix-utils.module.css";
import PageHeader from "@/components/PageHeader";
import { CheckCircle, RefreshCw, AlertTriangle, Activity, Database, ShieldAlert, ListChecks, Archive, Layers } from "lucide-react";
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
interface DeliveryHealth {
  monitorRecipients: number;
  alertNotificationsLast24h: number;
  deliveryMode: string;
  failClosed: boolean;
}
interface AlertBacklogSummary {
  unresolvedTotal: number;
  actionableOpen: number;
  staleOpen: number;
  stale30dOpen: number;
  unresolvedIot: number;
  unresolvedCritical: number;
  oldestUnresolvedAt: string | null;
  byType: { alert_type: string; severity: string; count: number; last_seen: string }[];
  noisyGroups: { alert_type: string; severity: string; title: string; related_path: string; count: number; first_seen: string; last_seen: string }[];
  staleSamples: Alert[];
}
interface BulkPreview {
  dryRun: boolean;
  olderThanDays: number;
  candidateCount: number;
  resolvedCount: number;
  samples: Alert[];
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

function safeInternalPath(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  if (/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

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
  const searchParams = useSearchParams();
  const selectedAlertId = searchParams.get("alertId");
  const selectedRelatedPath = safeInternalPath(searchParams.get("relatedPath"));
  const [alerts,    setAlerts]    = useState<Alert[]>([]);
  const [total,     setTotal]     = useState(0);
  const [health,    setHealth]    = useState<HealthSummary | null>(null);
  const [errorStats,setErrorStats]= useState<ErrorStat[]>([]);
  const [qualityAlerts, setQualityAlerts] = useState<QualityAlert[]>([]);
  const [deliveryHealth, setDeliveryHealth] = useState<DeliveryHealth | null>(null);
  const [backlog, setBacklog] = useState<AlertBacklogSummary | null>(null);
  const [bulkPreview, setBulkPreview] = useState<BulkPreview | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading,   setLoading]   = useState(false);
  const [resolving, setResolving] = useState<number | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [filterResolved, setFilterResolved] = useState<"" | "true" | "false">("");

  const tok = () => sessionStorage.getItem("phoenix_token") ?? "";

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const query = new URLSearchParams();
      if (filterResolved !== "") query.set("resolved", filterResolved);
      if (selectedAlertId && /^\d+$/.test(selectedAlertId)) query.set("alertId", selectedAlertId);
      if (selectedRelatedPath) query.set("relatedPath", selectedRelatedPath);
      const params = query.toString() ? `?${query.toString()}` : "";
      const headers = { Authorization: `Bearer ${tok()}` };
      const [alertsRes, healthRes, errorsRes, qualityRes, deliveryRes, backlogRes] = await Promise.allSettled([
        fetch(`/api/system/alerts${params}`, { headers }),
        fetch("/api/system/monitor/health", { headers }),
        fetch("/api/system/monitor/errors", { headers }),
        fetch("/api/data-quality/alerts", { headers }),
        fetch("/api/system/alerts/delivery-health", { headers }),
        fetch("/api/system/alerts/backlog-summary", { headers }),
      ]);
      if (alertsRes.status === "fulfilled" && alertsRes.value.ok) {
        const d = await alertsRes.value.json();
        setAlerts(d.items ?? []);
        setTotal(d.total ?? 0);
        if ((selectedAlertId || selectedRelatedPath) && (d.items ?? []).length === 0) {
          setLoadError(`未找到匹配告警${selectedAlertId ? ` #${selectedAlertId}` : ""}${selectedRelatedPath ? `（相关路径 ${selectedRelatedPath}）` : ""}。可能已处理归档、权限过滤，或通知引用了不存在的告警。`);
        }
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
      if (deliveryRes.status === "fulfilled" && deliveryRes.value.ok) {
        setDeliveryHealth(await deliveryRes.value.json());
      } else {
        setDeliveryHealth(null);
      }
      if (backlogRes.status === "fulfilled" && backlogRes.value.ok) {
        setBacklog(await backlogRes.value.json());
      } else {
        setBacklog(null);
      }
    } finally { setLoading(false); }
  }, [filterResolved, selectedAlertId, selectedRelatedPath]);

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

  const previewBulkArchive = async () => {
    setBulkLoading(true);
    try {
      const res = await fetch("/api/system/alerts/stale-resolve-preview?olderThanDays=30&maxRows=1000", {
        headers: { Authorization: `Bearer ${tok()}` },
      });
      if (res.ok) setBulkPreview(await res.json());
      else alert("老旧告警归档预览失败，请检查 MENU_SYS_MONITOR:V 权限");
    } finally { setBulkLoading(false); }
  };

  const executeBulkArchive = async () => {
    const candidateCount = bulkPreview?.candidateCount ?? 0;
    if (candidateCount <= 0) return;
    const reason = prompt(`将批量归档 ${candidateCount} 条 30 天前非 CRITICAL 老旧告警。请输入归档原因：`);
    if (!reason) return;
    if (!confirm("确认执行老旧告警归档？此操作只会标记已处理，不会删除台账。")) return;
    setBulkLoading(true);
    try {
      const res = await fetch("/api/system/alerts/bulk-resolve-stale", {
        method: "POST",
        headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          olderThanDays: 30,
          dryRun: false,
          maxRows: 1000,
          reason,
          confirm: "RESOLVE_STALE_ALERTS",
        }),
      });
      if (res.ok) {
        setBulkPreview(await res.json());
        fetchAlerts();
      } else {
        const body = await res.json().catch(() => ({}));
        alert(body?.message ?? "老旧告警归档失败，请检查权限和确认参数");
      }
    } finally { setBulkLoading(false); }
  };

  const unresolvedCount = backlog?.actionableOpen ?? alerts.filter(a => !a.resolved).length;
  const criticalCount = backlog?.unresolvedCritical ?? alerts.filter(a => a.severity === "CRITICAL" && !a.resolved).length;
  const recentErrorCount = health?.recentErrors ?? errorStats.reduce((sum, row) => sum + Number(row.count || 0), 0);
  const highQualityCount = qualityAlerts.filter(a => a.severity === "HIGH").length;
  const healthTone = health?.status === "HEALTHY" ? "success" : health?.status === "DEGRADED" ? "warning" : "info";
  const deliveryTone = !deliveryHealth ? "info" : deliveryHealth.monitorRecipients > 0 ? "success" : "danger";
  const selectedAlert = selectedAlertId
    ? alerts.find(a => String(a.id) === selectedAlertId)
    : null;
  const selectedPath = safeInternalPath(selectedAlert?.related_path) ?? selectedRelatedPath;

  return (
    <div>
      <PageHeader
        title={t('ui.异常告警','异常告警')}
        subtitle={`${selectedAlertId ? `告警 #${selectedAlertId} · ` : ""}生产值班台账 · 只展示需要人工确认的异常 · 0 条代表当前筛选下无待处理系统故障 · 共 ${total} 条`}
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
          label="当前值班待办"
          value={unresolvedCount}
          hint={`近 7 天 CRITICAL/WARNING；历史沉积 ${backlog ? backlog.staleOpen.toLocaleString() : "—"} 条`}
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
          icon={<Archive size={16} />}
          label="30 天沉积"
          value={backlog ? backlog.stale30dOpen.toLocaleString() : "—"}
          hint="可先预览，再按审计原因批量归档；不会物理删除"
          tone={(backlog?.stale30dOpen ?? 0) > 0 ? "warning" : "success"}
        />
        <SummaryCard
          icon={<Database size={16} />}
          label="系统健康探针"
          value={health?.status === "HEALTHY" ? "正常" : health?.status === "DEGRADED" ? "降级" : "未知"}
          hint={health?.database?.connected === false ? "数据库连接不可用" : health?.timestamp ? `最后检测 ${new Date(health.timestamp).toLocaleTimeString("zh-CN")}` : "等待监控接口返回"}
          tone={healthTone}
        />
        <SummaryCard
          icon={<ShieldAlert size={16} />}
          label="值班触达"
          value={deliveryHealth ? `${deliveryHealth.monitorRecipients} 人` : "—"}
          hint={deliveryHealth ? `站内通知；24h 已投递 ${deliveryHealth.alertNotificationsLast24h} 条` : "等待触达自检接口返回"}
          tone={deliveryTone}
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
            集中查看需要人工确认的系统异常。它不是普通通知列表：CRITICAL/WARNING 告警会写入值班人员站内通知，台账遵循 append-only 安全约束，不能删除，只能标记处理。
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/system/health" style={secondaryActionButton}>查看系统监控</Link>
          <Link href="/system/error-logs" style={secondaryActionButton}>查看错误日志</Link>
          <Link href="/data-quality" style={secondaryActionButton}>查看数据质量</Link>
        </div>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
        gap: 14,
        marginBottom: 18,
      }}>
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, color: "var(--text-primary)" }}>
              <Layers size={16} /> 告警生成源
            </div>
            <button onClick={previewBulkArchive} disabled={bulkLoading} style={{ ...secondaryActionButton, opacity: bulkLoading ? 0.6 : 1 }}>
              {bulkLoading ? "处理中" : "预览沉积归档"}
            </button>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {(backlog?.byType ?? []).slice(0, 5).map(row => (
              <div key={`${row.alert_type}-${row.severity}`} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-page)" }}>
                <div>
                  <div style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-primary)", fontWeight: 800 }}>{row.alert_type}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{row.severity} · 最后 {new Date(row.last_seen).toLocaleString("zh-CN")}</div>
                </div>
                <div style={{ fontVariantNumeric: "tabular-nums", fontWeight: 900, color: "var(--text-primary)" }}>{Number(row.count).toLocaleString()}</div>
              </div>
            ))}
            {(backlog?.byType?.length ?? 0) === 0 && <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>当前没有未处理告警源。</div>}
          </div>
        </div>
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 16 }}>
          <div style={{ fontWeight: 800, color: "var(--text-primary)", marginBottom: 12 }}>重复噪音源</div>
          <div style={{ display: "grid", gap: 8 }}>
            {(backlog?.noisyGroups ?? []).slice(0, 5).map(row => (
              <div key={`${row.alert_type}-${row.title}-${row.related_path}`} style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-page)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 800 }}>{row.title}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--status-warning)", fontWeight: 900 }}>{Number(row.count).toLocaleString()} 次</span>
                </div>
                <div style={{ marginTop: 4, fontFamily: "monospace", fontSize: 11, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.related_path || row.alert_type}</div>
              </div>
            ))}
            {(backlog?.noisyGroups?.length ?? 0) === 0 && <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>暂未发现重复噪音源。</div>}
          </div>
        </div>
      </div>

      {bulkPreview && (
        <div style={{ marginBottom: 18, padding: 14, borderRadius: "var(--radius-lg)", border: "1px solid var(--status-warning-bg-light)", background: "var(--status-warning-bg-faint)", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ color: "var(--text-primary)", fontSize: 13, lineHeight: 1.6 }}>
            归档预览：{bulkPreview.olderThanDays} 天前非 CRITICAL 老旧告警 {bulkPreview.candidateCount.toLocaleString()} 条。
            {bulkPreview.resolvedCount > 0 ? ` 已归档 ${bulkPreview.resolvedCount.toLocaleString()} 条。` : " 真实执行需填写原因并保留 resolved 审计。"}
          </div>
          <button onClick={executeBulkArchive} disabled={bulkLoading || bulkPreview.candidateCount <= 0} style={{ ...primaryActionButton, opacity: bulkLoading || bulkPreview.candidateCount <= 0 ? 0.55 : 1 }}>
            执行安全归档
          </button>
        </div>
      )}

      {loadError && (
        <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--status-danger-bg-light)", color: "var(--status-danger)", background: "var(--status-danger-bg-faint)", fontSize: 13 }}>
          {loadError}
        </div>
      )}

      {selectedRelatedPath && (
        <div style={{
          marginBottom: 14,
          padding: "10px 14px",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--status-info-bg)",
          background: "var(--status-info-bg)",
          color: "var(--text-secondary)",
          fontSize: 13,
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}>
          <span>当前按相关路径过滤：<strong style={{ color: "var(--text-primary)" }}>{selectedRelatedPath}</strong></span>
          <Link href="/system/alerts" style={{ color: "var(--color-accent)", fontWeight: 800 }}>清除过滤</Link>
        </div>
      )}

      {selectedAlert && (
        <div style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderLeft: "var(--card-accent-width) solid var(--status-warning)",
          borderRadius: "var(--radius-lg)",
          padding: 16,
          marginBottom: 18,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 700 }}>通知关联的告警详情</div>
              <div style={{ marginTop: 4, fontSize: 18, color: "var(--text-primary)", fontWeight: 800 }}>{selectedAlert.title}</div>
            </div>
            <span style={{
              alignSelf: "flex-start",
              padding: "3px 10px",
              borderRadius: 99,
              fontSize: 12,
              fontWeight: 800,
              ...(SEVERITY_STYLE[selectedAlert.severity] ?? SEVERITY_STYLE.INFO),
            }}>{selectedAlert.severity}</span>
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
            gap: 10,
            fontSize: 13,
            color: "var(--text-secondary)",
          }}>
            <div><strong style={{ color: "var(--text-primary)" }}>类型：</strong>{selectedAlert.alert_type}</div>
            <div><strong style={{ color: "var(--text-primary)" }}>状态：</strong>{selectedAlert.resolved ? "已处理" : "待处理"}</div>
            <div><strong style={{ color: "var(--text-primary)" }}>创建时间：</strong>{new Date(selectedAlert.created_at).toLocaleString("zh-CN")}</div>
            <div><strong style={{ color: "var(--text-primary)" }}>相关路径：</strong>{selectedAlert.related_path ?? "—"}</div>
          </div>
          {selectedPath && (
            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link href={selectedPath} style={primaryActionButton}>打开相关页面</Link>
              <Link href="/system/alerts" style={secondaryActionButton}>返回告警台账</Link>
            </div>
          )}
          {selectedAlert.detail && (
            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8 }}>
              {Object.entries(selectedAlert.detail).map(([key, value]) => (
                <div key={key} style={{
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  padding: "8px 10px",
                  background: "var(--bg-page)",
                  fontSize: 12,
                }}>
                  <div style={{ color: "var(--text-secondary)", marginBottom: 3 }}>{key}</div>
                  <div style={{ color: "var(--text-primary)", fontWeight: 700, wordBreak: "break-word" }}>{String(value ?? "—")}</div>
                </div>
              ))}
            </div>
          )}
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
                <tr key={a.id} style={String(a.id) === selectedAlertId ? { background: "var(--status-warning-bg-faint)" } : undefined}>
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
