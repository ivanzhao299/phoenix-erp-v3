"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, BellOff, Archive, CheckCheck, RefreshCw, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import s from "@/components/ui/admin-ui.module.css";
import { primaryActionButton, secondaryActionButton, actionPill, toolbarFilterPill } from "@/components/design-system/cockpit-styles";

// ── Auth helper ───────────────────────────────────────────────────────────────
import u from "@/styles/uix-utils.module.css";
function getToken() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || '';
}
function authHdr(extra?: Record<string, string>) {
  return {
    Authorization: `Bearer ${getToken()}`,
    'Content-Type': 'application/json',
    ...extra
  };
}
interface Notification {
  id: string;
  userId: string;
  notificationType: string;
  title: string;
  content: string;
  linkType: string | null;
  linkId: string | null;
  bizType: string | null;
  bizNo: string | null;
  status: string;
  readAt: string | null;
  createdAt: string;
}
interface NotifListResp {
  items: Notification[];
  total: number;
}
const TYPE_LABEL: Record<string, string> = {
  WORKFLOW_TASK: "审批任务",
  APPROVAL_RESULT: "审批结果",
  SYSTEM: "系统消息"
};
function fmtDate(s: string) {
  if (!s) return "-";
  return new Date(s).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
async function fetchNotifications(params: {
  page: number;
  pageSize: number;
  status?: string;
  keyword?: string;
}): Promise<NotifListResp> {
  const p = new URLSearchParams();
  p.set("page", String(params.page));
  p.set("pageSize", String(params.pageSize));
  if (params.status) p.set("status", params.status);
  if (params.keyword) p.set("keyword", params.keyword);
  const res = await fetch(`/api/notifications?${p.toString()}`, {
    headers: authHdr()
  });
  if (!res.ok) return {
    items: [],
    total: 0
  };
  return res.json();
}
async function markRead(id: string) {
  await fetch(`/api/notifications/${id}/read`, {
    method: "POST",
    headers: authHdr()
  });
}
async function markAllRead() {
  await fetch("/api/notifications/read-all", {
    method: "POST",
    headers: authHdr()
  });
}
async function archiveNotification(id: string) {
  await fetch(`/api/notifications/${id}/archive`, {
    method: "POST",
    headers: authHdr()
  });
}
export default function NotificationsPage() {
  const toast = useToast();
  const { t } = useLanguage();
  const router = useRouter();
  const [resp, setResp] = useState<NotifListResp>({
    items: [],
    total: 0
  });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const load = useCallback(async (overrides?: {
    status?: string;
    keyword?: string;
    page?: number;
  }) => {
    setLoading(true);
    try {
      const r = await fetchNotifications({
        page: overrides?.page ?? page,
        pageSize: PAGE_SIZE,
        status: overrides?.status !== undefined ? overrides.status : status || undefined,
        keyword: overrides?.keyword !== undefined ? overrides.keyword : keyword || undefined
      });
      setResp(r);
    } finally {
      setLoading(false);
    }
  }, [page, status, keyword]);
  useEffect(() => {
    load();
  }, [load]);
  const handleMarkRead = async (n: Notification) => {
    if (n.status !== "UNREAD") return;
    await markRead(n.id);
    load();
  };
  const handleMarkAllRead = async () => {
    await markAllRead();
    toast.success(t('notif.allMarkedRead', '已全部标为已读'));
    load();
  };
  const handleArchive = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await archiveNotification(id);
    toast.success(t('notif.archived', '已归档'));
    load();
  };
  const handleClick = (n: Notification) => {
    handleMarkRead(n);
    if (n.linkType === "APPROVAL_INSTANCE") {
      // 深链带 instanceId，直接打开该审批实例详情，避免落到通用待办列表后查无此条
      router.push(n.linkId ? `/workflow/todos?instanceId=${encodeURIComponent(n.linkId)}` : "/workflow/todos");
    }
  };
  const applyFilter = () => {
    setPage(1);
    load({
      page: 1,
      status,
      keyword
    });
  };
  const resetFilter = () => {
    setStatus("");
    setKeyword("");
    setPage(1);
    load({
      page: 1,
      status: "",
      keyword: ""
    });
  };
  const unreadCount = resp.items.filter(n => n.status === "UNREAD").length;
  return <div>
      <PageHeader title={t('notif.title', '通知中心')} subtitle={`${t('notif.subtitle', '站内消息通知')}${unreadCount > 0 ? `（${unreadCount} ${t('notif.unreadCount', '条未读）')}` : ""}`} breadcrumb={[t('notif.approvalCenter', '审批中心'), t('notif.breadcrumb', '通知')]} />

      <section className={s.card}>
        {/* 工具栏 */}
        <div className={s.cardBody} style={{
        borderBottom: "1px solid var(--slate-100)",
        paddingBottom: 12,
        display: "flex",
        gap: 12,
        flexWrap: "wrap",
        alignItems: "center"
      }}>
          <select value={status} onChange={e => setStatus(e.target.value)} className={s.select} style={{
          minWidth: 120
        }}>
            <option value="">{t('notif.allStatus', '全部状态')}</option>
            <option value="UNREAD">{t('notif.unread', '未读')}</option>
            <option value="READ">{t('notif.read', '已读')}</option>
            <option value="ARCHIVED">{t('notif.archivedStatus', '已归档')}</option>
          </select>

          <div style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flex: 1,
          minWidth: 180
        }}>
            <Search size={14} style={{
            color: "var(--gray-400)"
          }} />
            <input type="text" value={keyword} onChange={e => setKeyword(e.target.value)} onKeyDown={e => e.key === "Enter" && applyFilter()} placeholder={t('notif.searchPlaceholder', '搜索通知标题…')} className={`${s.input} ${u.flex1}`} />
          </div>

          <button className={`${s.btnPrimary} ${u.fs12}`} onClick={applyFilter}>{t('notif.search', '搜索')}</button>
          <button onClick={resetFilter} style={{ ...secondaryActionButton, fontSize: 12 }}>{t('notif.reset', '重置')}</button>

          <button onClick={handleMarkAllRead} style={{ ...secondaryActionButton, fontSize: 12, marginLeft: "auto" }}>
            <CheckCheck size={13} />{t('notif.markAllRead', '全部已读')}
          </button>
          <button className={`${s.btnSecondary} ${u.fs12}`} onClick={() => load()} disabled={loading}>
            <RefreshCw size={13} style={{
            marginRight: 5
          }} />{t('notif.refresh', '刷新')}
          </button>
        </div>

        {/* 列表 */}
        {loading ? <div className={s.cardBody} style={{
        textAlign: "center",
        color: "var(--gray-400)",
        padding: 48
      }}>{t('notif.loading', '加载中…')}</div> : resp.items.length === 0 ? <div className={s.cardBody} style={{
        textAlign: "center",
        color: "var(--gray-400)",
        padding: 48
      }}>
            <BellOff size={36} style={{
          margin: "0 auto 12px",
          opacity: 0.4
        }} />
            <p>{t('notif.empty', '暂无通知')}</p>
          </div> : <div style={{
        display: "flex",
        flexDirection: "column"
      }}>
            {resp.items.map(n => <div key={n.id} onClick={() => handleClick(n)} style={{
          padding: "14px 20px",
          borderBottom: "1px solid var(--slate-100)",
          cursor: n.linkType ? "pointer" : "default",
          background: n.status === "UNREAD" ? "var(--status-info-bg-page)" : "transparent",
          display: "flex",
          gap: 14,
          alignItems: "flex-start",
          transition: "background 0.15s"
        }} onMouseEnter={e => e.currentTarget.style.background = "var(--status-info-bg-light)"} onMouseLeave={e => e.currentTarget.style.background = n.status === "UNREAD" ? "var(--status-info-bg-page)" : "transparent"}>
                {/* 未读标记点 */}
                <div style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: n.status === "UNREAD" ? "var(--status-info)" : "transparent",
            flexShrink: 0,
            marginTop: 6
          }} />

                <div style={{
            flex: 1,
            minWidth: 0
          }}>
                  <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 4
            }}>
                    <span style={{
                fontWeight: n.status === "UNREAD" ? 700 : 500,
                fontSize: 14,
                color: "var(--gray-800)"
              }}>
                      {n.title}
                    </span>
                    <span style={{
                fontSize: 11,
                color: "var(--gray-400)",
                whiteSpace: "nowrap",
                marginLeft: 12
              }}>
                      {fmtDate(n.createdAt)}
                    </span>
                  </div>

                  <p style={{
              fontSize: 12,
              color: "var(--gray-500)",
              margin: "0 0 6px",
              lineHeight: 1.6
            }}>
                    {n.content}
                  </p>

                  <div className={u.flexRow8}>
                    <span style={{
                fontSize: 10,
                padding: "1px 6px",
                borderRadius: 4,
                fontWeight: 600,
                background: "var(--slate-100)",
                color: "var(--slate-500)"
              }}>
                      {t(`notif.type.${n.notificationType}`, TYPE_LABEL[n.notificationType] ?? n.notificationType)}
                    </span>
                    {n.bizType && <span style={{
                fontSize: 10,
                padding: "1px 6px",
                borderRadius: 4,
                background: "var(--status-warning-bg-faint)",
                color: "var(--status-warning-dark)"
              }}>
                        {n.bizType}{n.bizNo ? ` ${n.bizNo}` : ""}
                      </span>}
                  </div>
                </div>

                {/* 操作按钮 */}
                <div style={{
            display: "flex",
            gap: 6,
            flexShrink: 0
          }}>
                  {n.status !== "ARCHIVED" && <button title={t('notif.archive', '归档')} onClick={e => handleArchive(n.id, e)} style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              border: "1px solid var(--slate-200)",
              background: "var(--bg-card)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--slate-400)"
            }}>
                      <Archive size={13} />
                    </button>}
                </div>
              </div>)}
          </div>}

        {/* 分页 */}
        {resp.total > PAGE_SIZE && <div className={s.cardBody} style={{
        display: "flex",
        justifyContent: "flex-end",
        gap: 8,
        paddingTop: 12
      }}>
            <button className={`${s.btnSecondary} ${u.fs12}`} onClick={() => {
          const p = Math.max(1, page - 1);
          setPage(p);
          load({
            page: p
          });
        }} disabled={page <= 1}>{t('notif.prevPage', '上一页')}</button>
            <span style={{
          fontSize: 12,
          lineHeight: "30px",
          color: "var(--gray-500)"
        }}>
              {t('notif.page', '第')} {page} / {Math.ceil(resp.total / PAGE_SIZE)} {t('notif.pageOf', '页，共')} {resp.total} {t('notif.itemUnit', '条')}
            </span>
            <button className={`${s.btnSecondary} ${u.fs12}`} onClick={() => {
          const p = page + 1;
          setPage(p);
          load({
            page: p
          });
        }} disabled={page >= Math.ceil(resp.total / PAGE_SIZE)}>{t('notif.nextPage', '下一页')}</button>
          </div>}
      </section>
    </div>;
}