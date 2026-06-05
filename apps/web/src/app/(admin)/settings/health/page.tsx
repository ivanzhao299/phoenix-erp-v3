"use client";

import { useState, useCallback } from "react";
import PageHeader from "@/components/PageHeader";
import { Activity, Database, Cpu, Wifi, Clock, RefreshCw, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePolling } from '@/hooks/usePolling';
import s from "@/components/ui/admin-ui.module.css";
import u from "@/styles/uix-utils.module.css";
type Status = "ok" | "warn" | "error" | "loading";
const STATUS_COLOR: Record<Status, string> = {
  ok: "var(--status-success)",
  warn: "var(--status-warning)",
  error: "var(--status-danger)",
  loading: "var(--text-disabled)"
};
const STATUS_BG: Record<Status, string> = {
  ok: "color-mix(in srgb, var(--status-success) 14%, transparent)",
  warn: "color-mix(in srgb, var(--status-warning) 16%, transparent)",
  error: "color-mix(in srgb, var(--status-danger) 14%, transparent)",
  loading: "var(--bg-muted)"
};
function HealthCard({
  title,
  icon,
  value,
  unit,
  status,
  detail,
  color
}: {
  title: string;
  icon: React.ReactNode;
  value?: string | number | null;
  unit?: string;
  status: Status;
  detail?: string;
  color: string;
}) {
  const {
    t
  } = useLanguage();
  const STATUS_LABEL: Record<Status, string> = {
    ok: t("status.normal", "正常"),
    warn: t("status.warning", "警告"),
    error: t("ui.故障", "故障"),
    loading: t("ui.检测中", "检测中")
  };
  const sc = STATUS_COLOR[status];
  const bg = STATUS_BG[status];
  return <div style={{
    backgroundColor: "var(--bg-card)",
    border: `1px solid ${sc}30`,
    borderRadius: "var(--radius-lg)",
    padding: 20,
    borderLeft: `var(--card-accent-width) solid ${color}`
  }}>
      <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 12
    }}>
        <div style={{
        padding: 8,
        backgroundColor: bg,
        borderRadius: 8,
        color: sc
      }}>{icon}</div>
        <span style={{
        fontSize: 11,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 10,
        backgroundColor: bg,
        color: sc
      }}>{STATUS_LABEL[status]}</span>
      </div>
      <div style={{
      fontSize: 12,
      color: "var(--text-secondary)",
      fontWeight: 600,
      marginBottom: 4
    }}>{title}</div>
      <div style={{
      fontSize: 26,
      fontWeight: 800,
      color: sc
    }}>
        {value ?? "—"}{unit && <span style={{
        fontSize: 13,
        fontWeight: 400,
        marginLeft: 3
      }}>{unit}</span>}
      </div>
      {detail && <div style={{
      fontSize: 11,
      color: "var(--text-secondary)",
      marginTop: 6
    }}>{detail}</div>}
    </div>;
}
const ENDPOINTS = [{
  path: "/api/health",
  descKey: "ui.基础健康检查",
  descFallback: "基础健康检查",
  key: "health"
}, {
  path: "/api/readiness",
  descKey: "ui.数据库就绪探针",
  descFallback: "数据库就绪探针",
  key: "ready"
}, {
  path: "/api/auth/me",
  descKey: "ui.身份验证",
  descFallback: "身份验证",
  key: "ok"
}, {
  path: "/api/dashboard/kpi",
  descKey: "ui.仪表盘数据",
  descFallback: "仪表盘数据",
  key: "ok"
}, {
  path: "/api/farm-device/alerts/stream",
  descKey: "ui.SSE实时推送",
  descFallback: "SSE 实时推送",
  key: "ok"
}];
export default function SystemHealthPage() {
  const {
    t
  } = useLanguage();
  const [health, setHealth] = useState<Status | null>(null);
  const [ready, setReady] = useState<Status | null>(null);
  const [apiLatency, setApiLatency] = useState<number | null>(null);
  const [memUsage, setMemUsage] = useState<{
    used: string;
    pct: string;
    limit: string;
  } | null>(null);
  const [lastCheck, setLastCheck] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [history, setHistory] = useState<number[]>([]);
  const STATUS_LABEL: Record<Status, string> = {
    ok: t("status.normal", "正常"),
    warn: t("status.warning", "警告"),
    error: t("ui.故障", "故障"),
    loading: t("ui.检测中", "检测中")
  };
  const tok = () => typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") || "" : "";
  const runCheck = useCallback(async () => {
    setChecking(true);
    const t0 = Date.now();
    try {
      const r = await fetch("/api/health");
      const d = await r.json();
      setHealth(d.status === "OK" ? "ok" : "error");
    } catch {
      setHealth("error");
    }
    try {
      const r = await fetch("/api/readiness");
      const d = await r.json();
      setReady(d.status === "READY" ? "ok" : "error");
    } catch {
      setReady("error");
    }
    const latency = Date.now() - t0;
    setApiLatency(latency);
    setHistory(prev => [...prev.slice(-19), latency]);
    const mem = (window.performance as any)?.memory;
    if (mem) {
      setMemUsage({
        used: (mem.usedJSHeapSize / 1024 / 1024).toFixed(1),
        pct: (mem.usedJSHeapSize / mem.jsHeapSizeLimit * 100).toFixed(1),
        limit: (mem.jsHeapSizeLimit / 1024 / 1024).toFixed(0)
      });
    }
    setLastCheck(new Date().toLocaleTimeString("zh-CN"));
    setChecking(false);
  }, []);
  usePolling(runCheck, 30_000);
  const latencyStatus: Status = apiLatency == null ? "loading" : apiLatency < 200 ? "ok" : apiLatency < 800 ? "warn" : "error";
  const memStatus: Status = memUsage == null ? "loading" : Number(memUsage.pct) < 60 ? "ok" : Number(memUsage.pct) < 80 ? "warn" : "error";
  const avgLatency = history.length ? Math.round(history.reduce((a, b) => a + b, 0) / history.length) : null;
  const maxLatency = history.length ? Math.max(...history) : null;
  const sparkMax = Math.max(...history, 100);
  return <div className="animate-fade-in">
      <PageHeader title={t("ui.系统健康监控", "系统健康监控")} subtitle={t("ui.实时检测后端服务数据库连接与前端性能", "实时检测后端服务、数据库连接与前端性能")} breadcrumb={[t("ui.系统设置", "系统设置"), t("ui.健康监控", "健康监控")]} actions={<div className={u.flexRow8}>
            {lastCheck && <span className={u.muted12}>{t("ui.上次检测", "上次检测")}: {lastCheck}</span>}
            <button type="button" onClick={runCheck} disabled={checking} style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "7px 14px",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        background: "var(--bg-card)",
        cursor: checking ? "not-allowed" : "pointer",
        fontSize: 13,
        opacity: checking ? 0.6 : 1,
        color: "var(--text-primary)"
      }}>
              <RefreshCw size={13} style={{
          animation: checking ? "spin 1s linear infinite" : undefined
        }} /> {t("ui.立即检测", "立即检测")}
            </button>
          </div>} />

      {/* 健康卡片 */}
      <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
      gap: 16,
      marginBottom: 24
    }}>
        <HealthCard title={t("ui.API服务", "API 服务")} icon={<Activity size={20} />} value={health === "ok" ? t("ui.运行中", "运行中") : health === "error" ? t("ui.异常", "异常") : null} status={health || "loading"} color="var(--status-special)" detail="GET /api/health" />
        <HealthCard title={t("ui.数据库连接", "数据库连接")} icon={<Database size={20} />} value={ready === "ok" ? t("ui.已就绪", "已就绪") : ready === "error" ? t("ui.断开", "断开") : null} status={ready || "loading"} color="var(--status-success)" detail="GET /api/readiness (PostgreSQL)" />
        <HealthCard title={t("ui.API响应延迟", "API 响应延迟")} icon={<Wifi size={20} />} value={apiLatency} unit="ms" status={latencyStatus} color="var(--status-warning)" detail={avgLatency ? `${t("ui.近", "近")}${history.length}${t("ui.次平均", "次平均")} ${avgLatency}ms，${t("ui.最高", "最高")} ${maxLatency}ms` : t("ui.首次检测", "首次检测")} />
        <HealthCard title={t("ui.前端内存占用", "前端内存占用")} icon={<Cpu size={20} />} value={memUsage?.used} unit="MB" status={memStatus} color="var(--status-special)" detail={memUsage ? `${memUsage.pct}% / ${memUsage.limit}MB ${t("ui.上限", "上限")}` : t("ui.仅Chromium内核支持", "仅 Chromium 内核支持")} />
      </div>

      {/* 延迟趋势迷你图 */}
      {history.length > 1 && <div style={{
      backgroundColor: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      padding: 20,
      marginBottom: 20
    }}>
          <div style={{
        fontWeight: 700,
        fontSize: 14,
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        gap: 8,
        color: "var(--text-primary)"
      }}>
            <Clock size={15} /> {t("ui.API延迟历史", "API 延迟历史")}（{t("ui.最近", "最近")} {history.length} {t("ui.次30秒次", "次，30秒/次")}）
          </div>
          <div style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 3,
        height: 80
      }}>
            {history.map((v, i) => {
          const pct = Math.max(4, v / sparkMax * 100);
          const col = v < 200 ? "var(--status-success)" : v < 800 ? "var(--status-warning)" : "var(--status-danger)";
          return <div key={i} title={`${v}ms`} style={{
            flex: 1,
            height: `${pct}%`,
            backgroundColor: col,
            borderRadius: "3px 3px 0 0",
            opacity: i === history.length - 1 ? 1 : 0.65
          }} />;
        })}
          </div>
          <div style={{
        display: "flex",
        justifyContent: "space-between",
        marginTop: 8,
        fontSize: 11,
        color: "var(--text-secondary)"
      }}>
            <span>{t("ui.最早", "最早")}</span>
            <span style={{
          display: "flex",
          gap: 12
        }}>
              <span style={{
            color: "var(--status-success)"
          }}>● &lt;200ms {t("status.normal", "正常")}</span>
              <span style={{
            color: "var(--status-warning)"
          }}>● &lt;800ms {t("status.warning", "警告")}</span>
              <span style={{
            color: "var(--status-danger)"
          }}>● &gt;800ms {t("ui.故障", "故障")}</span>
            </span>
            <span>{t("ui.最新", "最新")}</span>
          </div>
        </div>}

      {/* 端点状态表 */}
      <div style={{
      backgroundColor: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      padding: 20
    }}>
        <div style={{
        fontWeight: 700,
        fontSize: 14,
        marginBottom: 14,
        color: "var(--text-primary)"
      }}>{t("ui.关键端点状态", "关键端点状态")}</div>
        <table className={s.table}>
          <thead>
            <tr>
              {[t("ui.端点", "端点"), t("ui.用途", "用途"), t("common.status", "状态")].map(h => <th key={h}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {ENDPOINTS.map((row, i) => {
            const st: Status = row.key === "health" ? health || "loading" : row.key === "ready" ? ready || "loading" : "ok";
            const color = STATUS_COLOR[st];
            const Icon = st === "ok" ? CheckCircle : st === "error" ? XCircle : AlertTriangle;
            return <tr key={i}>
                  <td style={{
                fontFamily: "monospace",
                fontSize: 12,
                color: "var(--color-primary)"
              }}>{row.path}</td>
                  <td className={u.muted}>{t(row.descKey, row.descFallback)}</td>
                  <td>
                    <span style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  color,
                  fontWeight: 600,
                  fontSize: 12
                }}>
                      <Icon size={13} />{STATUS_LABEL[st]}
                    </span>
                  </td>
                </tr>;
          })}
          </tbody>
        </table>
      </div>

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>;
}