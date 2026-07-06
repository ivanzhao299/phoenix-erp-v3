"use client";
/**
 * Phoenix ERP V3 — 错误日志
 * 接既有后端 GET /api/system/error-logs(列表,不含 stack) + /:id(详情含 stack_trace)。
 * 仅 MENU_SYS_MONITOR:V 可访问;append-only,只读查询。
 */
import { useState, useEffect, useCallback } from "react";
import u from "@/styles/uix-utils.module.css";
import s from "@/components/ui/admin-ui.module.css";
import PageHeader from "@/components/PageHeader";
import { FileWarning, RefreshCw, X, Loader2, AlertTriangle, Layers } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface ErrorRow {
  id:             number;
  error_type:     string;
  http_status:    number | null;
  error_message:  string | null;
  pg_error_code:  string | null;
  request_method: string | null;
  request_path:   string | null;
  user_id:        number | null;
  username:       string | null;
  ip_address:     string | null;
  created_at:     string;
  stack_trace?:   string | null;
}
interface ErrorGroup {
  error_type: string;
  http_status: number | null;
  pg_error_code: string | null;
  request_method: string | null;
  path_key: string | null;
  message_key: string | null;
  count: number;
  affected_users: number;
  first_seen: string;
  last_seen: string;
  latest_id: number;
}
interface ErrorSummary {
  windowHours: number;
  total: number;
  serverErrors: number;
  permissionOrClientErrors: number;
  affectedPaths: number;
  topRootCause: ErrorGroup | null;
  groups: ErrorGroup[];
}

const tok = () => (typeof window === "undefined" ? "" : sessionStorage.getItem("phoenix_token") ?? "");

function statusStyle(code: number | null): { bg: string; color: string } {
  if (!code) return { bg: "var(--bg-muted)", color: "var(--text-secondary)" };
  if (code >= 500) return { bg: "var(--status-danger-bg-faint)", color: "var(--status-danger)" };
  if (code >= 400) return { bg: "var(--status-warning-bg-faint)", color: "var(--status-warning)" };
  return { bg: "var(--status-info-bg)", color: "var(--color-accent)" };
}

const PAGE_SIZE = 50;

export default function ErrorLogsPage() {
  const { t } = useLanguage();
  const [rows, setRows]       = useState<ErrorRow[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<ErrorSummary | null>(null);
  const [errorType, setErrorType]   = useState("");
  const [httpStatus, setHttpStatus] = useState("");

  const [detail, setDetail] = useState<ErrorRow | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const fetchList = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(p), limit: String(PAGE_SIZE) });
      if (errorType.trim())  qs.set("errorType", errorType.trim());
      if (httpStatus.trim()) qs.set("httpStatus", httpStatus.trim());
      const res = await fetch(`/api/system/error-logs?${qs.toString()}`, { headers: { Authorization: `Bearer ${tok()}` } });
      if (res.ok) {
        const d = await res.json();
        setRows(d.items ?? []);
        setTotal(d.total ?? 0);
        setPage(p);
      }
      const summaryRes = await fetch("/api/system/error-logs/summary?hours=24&limit=12", { headers: { Authorization: `Bearer ${tok()}` } });
      if (summaryRes.ok) setSummary(await summaryRes.json());
      else setSummary(null);
    } finally { setLoading(false); }
  }, [errorType, httpStatus]);

  useEffect(() => { fetchList(1); }, [fetchList]);

  const openDetail = async (id: number) => {
    setLoadingDetail(true); setDetail(null);
    try {
      const res = await fetch(`/api/system/error-logs/${id}`, { headers: { Authorization: `Bearer ${tok()}` } });
      if (res.ok) setDetail(await res.json());
    } finally { setLoadingDetail(false); }
  };

  const pages = Math.ceil(total / PAGE_SIZE) || 1;

  return (
    <div>
      <PageHeader
        title={t('ui.错误日志','错误日志')}
        subtitle={`共 ${total} 条 · 先看根因聚合，再看原始明细 · append-only`}
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input value={errorType} onChange={e => setErrorType(e.target.value)} placeholder={t('ui.错误类型','错误类型')}
              style={{ padding: "6px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", fontSize: 13, width: 140 }} />
            <input value={httpStatus} onChange={e => setHttpStatus(e.target.value)} placeholder={t('ui.HTTP 状态','HTTP 状态')} inputMode="numeric"
              style={{ padding: "6px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", fontSize: 13, width: 100 }} />
            <button onClick={() => fetchList(1)} disabled={loading}
              style={{ padding: "6px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <RefreshCw size={14} /> {t('ui.查询','查询')}
            </button>
          </div>
        }
      />

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
        gap: 12,
        marginBottom: 16,
      }}>
        {[
          { label: "24h 错误总量", value: summary ? summary.total.toLocaleString() : "—", tone: (summary?.total ?? 0) > 0 ? "var(--status-warning)" : "var(--status-success)" },
          { label: "500 / PG 错误", value: summary ? summary.serverErrors.toLocaleString() : "—", tone: (summary?.serverErrors ?? 0) > 0 ? "var(--status-danger)" : "var(--status-success)" },
          { label: "403 / 客户端错误", value: summary ? summary.permissionOrClientErrors.toLocaleString() : "—", tone: (summary?.permissionOrClientErrors ?? 0) > 0 ? "var(--status-warning)" : "var(--status-success)" },
          { label: "影响路径", value: summary ? summary.affectedPaths.toLocaleString() : "—", tone: "var(--color-accent)" },
        ].map(card => (
          <div key={card.label} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderLeft: `var(--card-accent-width) solid ${card.tone}`, borderRadius: "var(--radius-lg)", padding: 14 }}>
            <div style={{ color: "var(--text-secondary)", fontSize: 12, fontWeight: 800 }}>{card.label}</div>
            <div style={{ color: "var(--text-primary)", fontSize: 28, fontWeight: 900, marginTop: 10 }}>{card.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 900, color: "var(--text-primary)", marginBottom: 12 }}>
          <Layers size={16} /> 24h 根因聚合
        </div>
        {(summary?.groups?.length ?? 0) === 0 ? (
          <div style={{ color: "var(--status-success)", display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <FileWarning size={18} /> 近 24 小时暂无错误聚合。
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {summary!.groups.slice(0, 8).map(group => {
              const sty = statusStyle(group.http_status);
              return (
                <button
                  key={`${group.latest_id}-${group.path_key}-${group.message_key}`}
                  onClick={() => openDetail(group.latest_id)}
                  style={{
                    textAlign: "left",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                    background: "var(--bg-page)",
                    padding: "10px 12px",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, alignItems: "start" }}>
                    <span style={{ padding: "1px 8px", borderRadius: 99, fontSize: 11, fontWeight: 800, ...sty }}>{group.http_status ?? "—"}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-primary)", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {group.request_method ?? "—"} {group.path_key || "—"}
                      </div>
                      <div style={{ marginTop: 4, color: "var(--text-secondary)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {group.message_key || "—"}
                      </div>
                    </div>
                    <div style={{ color: "var(--status-danger)", fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{Number(group.count).toLocaleString()} 次</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {summary?.topRootCause && (
          <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--status-warning-bg-faint)", color: "var(--text-secondary)", fontSize: 13, display: "flex", gap: 8 }}>
            <AlertTriangle size={16} style={{ color: "var(--status-warning)", flexShrink: 0 }} />
            优先处理：{summary.topRootCause.request_method} {summary.topRootCause.path_key}，近 24h 出现 {Number(summary.topRootCause.count).toLocaleString()} 次。
          </div>
        )}
      </div>

      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        <table className={s.table}>
          <thead>
            <tr>{[t('ui.时间','时间'), t('ui.类型','类型'), "HTTP", t('ui.方法 / 路径','方法 / 路径'), t('ui.错误消息','错误消息'), t('ui.用户','用户'), "IP", t('ui.操作','操作')].map(h => <th key={h} className={u.nowrap}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: "center", padding: 48, color: "var(--text-secondary)" }}><Loader2 size={22} className="animate-spin" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: "center", padding: 48, color: "var(--status-success)" }}>
                <FileWarning size={26} /><p style={{ margin: "8px 0 0", fontWeight: 600 }}>{t('ui.无错误记录','无错误记录')}</p>
              </td></tr>
            ) : rows.map(r => {
              const sty = statusStyle(r.http_status);
              return (
                <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => openDetail(r.id)}>
                  <td style={{ color: "var(--text-secondary)", fontSize: 12, whiteSpace: "nowrap" }}>{new Date(r.created_at).toLocaleString("zh-CN")}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>{r.error_type}</td>
                  <td>{r.http_status != null && <span style={{ padding: "1px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700, ...sty }}>{r.http_status}</span>}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 11, color: "var(--text-secondary)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.request_method ? `${r.request_method} ` : ""}{r.request_path ?? "—"}
                  </td>
                  <td style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.error_message ?? "—"}</td>
                  <td style={{ fontSize: 12 }}>{r.username ?? (r.user_id ?? "—")}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 11, color: "var(--text-secondary)" }}>{r.ip_address ?? "—"}</td>
                  <td><span style={{ color: "var(--color-accent)", fontSize: 12, fontWeight: 600 }}>{t('ui.详情','详情')}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {pages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
          <button disabled={page <= 1} onClick={() => fetchList(page - 1)} style={{ padding: "5px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", cursor: page > 1 ? "pointer" : "not-allowed", fontSize: 13 }}>{t('ui.上一页','上一页')}</button>
          <span style={{ lineHeight: "32px", fontSize: 13, color: "var(--text-secondary)" }}>第 {page} / {pages} 页 · 共 {total} 条</span>
          <button disabled={page >= pages} onClick={() => fetchList(page + 1)} style={{ padding: "5px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", cursor: page < pages ? "pointer" : "not-allowed", fontSize: 13 }}>{t('ui.下一页','下一页')}</button>
        </div>
      )}

      {/* 详情抽屉 */}
      {(detail || loadingDetail) && (
        <div style={{ position: "fixed", inset: 0, background: "var(--overlay-mask)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }} onClick={() => { setDetail(null); setLoadingDetail(false); }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 560, maxWidth: "92vw", height: "100%", background: "var(--bg-card)", borderLeft: "1px solid var(--border)", overflowY: "auto", padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{t('ui.错误详情','错误详情')}</h3>
              <button onClick={() => { setDetail(null); setLoadingDetail(false); }} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text-secondary)" }}><X size={18} /></button>
            </div>
            {loadingDetail ? (
              <div style={{ textAlign: "center", padding: 48, color: "var(--text-secondary)" }}><Loader2 size={22} className="animate-spin" /></div>
            ) : detail && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13 }}>
                {([
                  [t('ui.错误类型','错误类型'), detail.error_type],
                  [t('ui.HTTP 状态','HTTP 状态'), detail.http_status ?? "—"],
                  [t('ui.PG 错误码','PG 错误码'), detail.pg_error_code ?? "—"],
                  [t('ui.请求','请求'), `${detail.request_method ?? ""} ${detail.request_path ?? "—"}`],
                  [t('ui.用户','用户'), detail.username ?? (detail.user_id ?? "—")],
                  ["IP", detail.ip_address ?? "—"],
                  [t('ui.时间','时间'), new Date(detail.created_at).toLocaleString("zh-CN")],
                ] as [string, React.ReactNode][]).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", gap: 10 }}>
                    <span style={{ color: "var(--text-secondary)", width: 84, flexShrink: 0 }}>{k}</span>
                    <span style={{ fontFamily: "monospace", wordBreak: "break-all" }}>{v}</span>
                  </div>
                ))}
                <div>
                  <div style={{ color: "var(--text-secondary)", marginBottom: 4 }}>{t('ui.错误消息','错误消息')}</div>
                  <div style={{ background: "var(--bg-muted)", borderRadius: "var(--radius-md)", padding: 10, fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{detail.error_message ?? "—"}</div>
                </div>
                <div>
                  <div style={{ color: "var(--text-secondary)", marginBottom: 4 }}>{t('ui.堆栈','堆栈')} stack_trace</div>
                  <pre style={{ background: "var(--bg-muted)", borderRadius: "var(--radius-md)", padding: 10, fontSize: 11, overflowX: "auto", maxHeight: 360, margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{detail.stack_trace ?? t('ui.（无堆栈）','（无堆栈）')}</pre>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
