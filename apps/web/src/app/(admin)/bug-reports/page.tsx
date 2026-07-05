"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useLanguage } from "@/contexts/LanguageContext";
import u from "@/styles/uix-utils.module.css";
import s from "@/components/ui/admin-ui.module.css";
import { AlertTriangle, Bug, Loader2, RefreshCw, X } from "lucide-react";

type BugReportListItem = {
  bugNo: string;
  title: string;
  severity: string;
  status: string;
  route: string;
  reporterUsername: string;
  reporterName: string;
  createdAt: string;
  updatedAt: string;
  attachmentCount: number;
};

type Attachment = {
  fileName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  previewEndpoint: string;
};

type BugReportDetail = BugReportListItem & {
  description: string;
  url: string;
  reporterUserId: string;
  roles: string[];
  companyCode: string;
  projectCode: string;
  consoleErrors: unknown[];
  failedRequests: unknown[];
  attachments: Attachment[];
  clientContext: Record<string, unknown>;
  resolutionNote: string;
  updatedBy: string;
};

const STATUSES = ["OPEN", "TRIAGED", "IN_PROGRESS", "RESOLVED", "CLOSED", "REJECTED"];
const PAGE_SIZE = 20;

function token() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "";
}

function badgeColor(value: string) {
  if (value === "CRITICAL" || value === "REJECTED") return { bg: "var(--status-danger-bg-faint)", color: "var(--status-danger)" };
  if (value === "HIGH" || value === "OPEN") return { bg: "var(--status-warning-bg-faint)", color: "var(--status-warning)" };
  if (value === "RESOLVED" || value === "CLOSED") return { bg: "var(--status-success-bg-faint)", color: "var(--status-success)" };
  return { bg: "var(--bg-muted)", color: "var(--text-secondary)" };
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre style={{ background: "var(--bg-muted)", borderRadius: "var(--radius-md)", padding: 12, fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 260, overflow: "auto" }}>
      {JSON.stringify(value ?? null, null, 2)}
    </pre>
  );
}

export default function BugReportsPage() {
  const { t } = useLanguage();
  const [rows, setRows] = useState<BugReportListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<BugReportDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");

  const fetchList = useCallback(async (nextPage = 1) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(nextPage), limit: String(PAGE_SIZE) });
      if (status) qs.set("status", status);
      if (keyword.trim()) qs.set("keyword", keyword.trim());
      const res = await fetch(`/api/bug-intake/reports?${qs.toString()}`, { headers: { Authorization: `Bearer ${token()}` } });
      if (res.ok) {
        const data = await res.json() as { items: BugReportListItem[]; total: number };
        setRows(data.items ?? []);
        setTotal(data.total ?? 0);
        setPage(nextPage);
      }
    } finally {
      setLoading(false);
    }
  }, [keyword, status]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchList(1);
  }, [fetchList]);

  const openDetail = async (bugNo: string) => {
    setDetailLoading(true);
    setDetail(null);
    setNote("");
    try {
      const res = await fetch(`/api/bug-intake/reports/${bugNo}`, { headers: { Authorization: `Bearer ${token()}` } });
      if (res.ok) {
        const data = await res.json() as BugReportDetail;
        setDetail(data);
        setNote(data.resolutionNote ?? "");
      }
    } finally {
      setDetailLoading(false);
    }
  };

  const updateStatus = async (bugNo: string, nextStatus: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/bug-intake/reports/${bugNo}/status`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus, resolutionNote: note }),
      });
      if (res.ok) {
        const data = await res.json() as BugReportDetail;
        setDetail(data);
        await fetchList(page);
      }
    } finally {
      setSaving(false);
    }
  };

  const openProtectedAttachment = (endpoint: string) => {
    if (!endpoint) return;
    window.location.assign(endpoint);
  };

  const pages = Math.ceil(total / PAGE_SIZE) || 1;

  return (
    <div>
      <PageHeader
        title={t("system.bugIntake.adminTitle", "问题反馈")}
        subtitle={`${t("system.bugIntake.adminSubtitle", "Bug Intake 台账 · 用户页面提报 + 自动上下文采集")} · ${t("ui.共", "共")} ${total} ${t("ui.条", "条")}`}
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select value={status} onChange={e => setStatus(e.target.value)}
              style={{ padding: "7px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
              <option value="">{t("system.bugIntake.allStatuses", "全部状态")}</option>
              {STATUSES.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
            <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder={t("system.bugIntake.searchPlaceholder", "搜索编号 / 标题 / 页面 / 用户")}
              style={{ padding: "7px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", width: 240 }} />
            <button type="button" onClick={() => fetchList(1)} disabled={loading}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-card)", cursor: loading ? "not-allowed" : "pointer" }}>
              <RefreshCw size={14} /> {t("common.refresh", "刷新")}
            </button>
          </div>
        }
      />

      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        <table className={s.table}>
          <thead>
            <tr>
              {[
                t("system.bugIntake.bugNo", "编号"),
                t("system.bugIntake.title", "标题"),
                t("system.bugIntake.severity", "严重程度"),
                t("common.status", "状态"),
                t("system.bugIntake.page", "页面"),
                t("system.bugIntake.reporter", "提报人"),
                t("system.bugIntake.screenshots", "截图"),
                t("system.bugIntake.createdAt", "创建时间"),
              ].map(h => <th key={h} className={u.nowrap}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: "center", padding: 48 }}><Loader2 size={22} className="animate-spin" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: "center", padding: 48, color: "var(--text-secondary)" }}><Bug size={26} /><p>{t("system.bugIntake.empty", "暂无问题反馈")}</p></td></tr>
            ) : rows.map(row => {
              const sev = badgeColor(row.severity);
              const st = badgeColor(row.status);
              return (
                <tr key={row.bugNo} onClick={() => openDetail(row.bugNo)} style={{ cursor: "pointer" }}>
                  <td style={{ fontFamily: "monospace", color: "var(--color-primary)", fontWeight: 800 }}>{row.bugNo}</td>
                  <td style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.title}</td>
                  <td><span style={{ ...sev, padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 800 }}>{row.severity}</span></td>
                  <td><span style={{ ...st, padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 800 }}>{row.status}</span></td>
                  <td style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-secondary)", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.route || "—"}</td>
                  <td>{row.reporterName || row.reporterUsername || "—"}</td>
                  <td>{row.attachmentCount}</td>
                  <td style={{ whiteSpace: "nowrap", color: "var(--text-secondary)", fontSize: 12 }}>{new Date(row.createdAt).toLocaleString("zh-CN")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
          <button disabled={page <= 1} onClick={() => fetchList(page - 1)}>{t("ui.上一页", "上一页")}</button>
          <span style={{ lineHeight: "28px", color: "var(--text-secondary)" }}>{t("ui.第", "第")} {page} / {pages} {t("ui.页", "页")}</span>
          <button disabled={page >= pages} onClick={() => fetchList(page + 1)}>{t("ui.下一页", "下一页")}</button>
        </div>
      )}

      {(detail || detailLoading) && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "var(--overlay-mask)", display: "flex", justifyContent: "flex-end" }} onMouseDown={() => setDetail(null)}>
          <div style={{ width: 720, maxWidth: "94vw", height: "100%", background: "var(--bg-card)", overflowY: "auto", borderLeft: "1px solid var(--border)" }} onMouseDown={e => e.stopPropagation()}>
            <div style={{ padding: 22, borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ color: "var(--color-primary)", fontWeight: 800, fontFamily: "monospace" }}>{detail?.bugNo ?? "加载中"}</div>
                <h3 style={{ margin: "6px 0 0", fontSize: 18 }}>{detail?.title ?? t("system.bugIntake.detailTitle", "问题详情")}</h3>
              </div>
              <button type="button" onClick={() => setDetail(null)} style={{ border: "none", background: "transparent", color: "var(--text-secondary)", cursor: "pointer" }}><X size={20} /></button>
            </div>

            {detailLoading ? (
              <div style={{ padding: 48, textAlign: "center" }}><Loader2 size={24} className="animate-spin" /></div>
            ) : detail && (
              <div style={{ padding: 22, display: "grid", gap: 18 }}>
                <section style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10, fontSize: 13 }}>
                  <span style={{ color: "var(--text-secondary)" }}>{t("system.bugIntake.pageUrl", "页面地址")}</span><strong style={{ wordBreak: "break-all" }}>{detail.url || detail.route || "—"}</strong>
                  <span style={{ color: "var(--text-secondary)" }}>{t("system.bugIntake.userRoles", "用户 / 角色")}</span><strong>{detail.reporterName || detail.reporterUsername} · {(detail.roles ?? []).join(", ") || "—"}</strong>
                  <span style={{ color: "var(--text-secondary)" }}>{t("system.bugIntake.companyProject", "公司 / 项目")}</span><strong>{detail.companyCode || "—"} / {detail.projectCode || "—"}</strong>
                  <span style={{ color: "var(--text-secondary)" }}>{t("system.bugIntake.description", "说明")}</span><span style={{ whiteSpace: "pre-wrap" }}>{detail.description || "—"}</span>
                </section>

                <section>
                  <h4>{t("system.bugIntake.processingStatus", "处理状态")}</h4>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <select value={detail.status} onChange={e => updateStatus(detail.bugNo, e.target.value)} disabled={saving}
                      style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
                      {STATUSES.map(item => <option key={item} value={item}>{item}</option>)}
                    </select>
                    {saving && <Loader2 size={16} className="animate-spin" />}
                  </div>
                  <textarea value={note} onChange={e => setNote(e.target.value)} placeholder={t("system.bugIntake.resolutionPlaceholder", "处理备注 / 复现结论")}
                    style={{ width: "100%", minHeight: 80, marginTop: 10, padding: 10, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-card)", color: "var(--text-primary)" }} />
                </section>

                <section>
                  <h4>{t("system.bugIntake.attachments", "截图 / 附件")}</h4>
                  {detail.attachments?.length ? (
                    <div style={{ display: "grid", gap: 10 }}>
                      {detail.attachments.map(file => (
                        <div key={file.fileName} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 10 }}>
                          <button
                            type="button"
                            onClick={() => openProtectedAttachment(file.previewEndpoint)}
                            style={{ border: 0, background: "transparent", color: "var(--color-primary)", fontWeight: 700, cursor: "pointer", padding: 0 }}
                          >
                            {file.originalName}
                          </button>
                          <div style={{ color: "var(--text-secondary)", fontSize: 12 }}>{file.mimeType} · {Math.round(file.sizeBytes / 1024)} KB</div>
                          {file.mimeType?.startsWith("image/") && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={file.previewEndpoint} alt={file.originalName} style={{ marginTop: 10, maxWidth: "100%", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }} />
                          )}
                        </div>
                      ))}
                    </div>
                  ) : <p style={{ color: "var(--text-secondary)" }}>{t("system.bugIntake.noScreenshots", "未上传截图。")}</p>}
                </section>

                <section>
                  <h4><AlertTriangle size={16} /> {t("system.bugIntake.recentConsoleErrors", "最近 Console Error")}</h4>
                  <JsonBlock value={detail.consoleErrors} />
                </section>
                <section>
                  <h4>{t("system.bugIntake.recentFailedRequests", "最近失败接口")}</h4>
                  <JsonBlock value={detail.failedRequests} />
                </section>
                <section>
                  <h4>{t("system.bugIntake.clientContext", "客户端上下文")}</h4>
                  <JsonBlock value={detail.clientContext} />
                </section>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
