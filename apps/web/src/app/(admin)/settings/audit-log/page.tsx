"use client";

import { useToast } from '@/contexts/ToastContext'; // G29-A: sonner → useToast
import u from "@/styles/uix-utils.module.css";
import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/PageHeader";
import { History, User, Clock, RefreshCw, Search, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import s from "@/components/ui/admin-ui.module.css";
import { primaryActionButton, secondaryActionButton, actionPill, toolbarFilterPill } from "@/components/design-system/cockpit-styles";
const tok = () => typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") || "" : "";
const hdr = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${tok()}`
});
const PAGE_SIZE = 50;
interface LogItem {
  id: number;
  doc_type: string;
  doc_id: number;
  approver_role: string;
  approver_id: number;
  action: string;
  comment: string;
  created_at: string;
  operator?: string;
}
export default function AuditLogPage() {
  const toast = useToast();
  const {
    t
  } = useLanguage();
  const ACTION_META: Record<string, {
    label: string;
    color: string;
    bg: string;
  }> = {
    APPROVED: {
      label: t('status.approved', '已审批'),
      color: "var(--status-success)",
      bg: "color-mix(in srgb, var(--status-success) 14%, transparent)"
    },
    REJECTED: {
      label: t('status.rejected', '已驳回'),
      color: "var(--status-danger)",
      bg: "color-mix(in srgb, var(--status-danger) 14%, transparent)"
    },
    SUBMIT: {
      label: t('ui.已提交', '已提交'),
      color: "var(--color-accent)",
      bg: "color-mix(in srgb, var(--color-accent) 14%, transparent)"
    },
    CANCELLED: {
      label: t('status.cancelled', '已撤回'),
      color: "var(--status-warning)",
      bg: "color-mix(in srgb, var(--status-warning) 16%, transparent)"
    },
    CREATE: {
      label: t('ui.新建', '新建'),
      color: "var(--status-special)",
      bg: "color-mix(in srgb, var(--status-special) 12%, transparent)"
    },
    UPDATE: {
      label: t('ui.修改', '修改'),
      color: "var(--color-accent)",
      bg: "color-mix(in srgb, var(--color-accent) 12%, transparent)"
    },
    DELETE: {
      label: t('common.delete', '删除'),
      color: "var(--status-danger)",
      bg: "color-mix(in srgb, var(--status-danger) 14%, transparent)"
    },
    LOGIN: {
      label: t('ui.登录', '登录'),
      color: "var(--status-success)",
      bg: "color-mix(in srgb, var(--status-success) 14%, transparent)"
    }
  };
  const DOC_TYPE_MAP: Record<string, string> = {
    ORDER: t('ui.销售订单', '销售订单'),
    PURCHASE: t('ui.采购单', '采购单'),
    INBOUND: t('ui.入库单', '入库单'),
    OUTBOUND: t('ui.出库单', '出库单'),
    GRADING: t('ui.分级任务', '分级任务'),
    BATCH: t('ui.包装批次', '包装批次'),
    USER: t('ui.用户账号', '用户账号'),
    ROLE: t('ui.角色权限', '角色权限'),
    DICT: t('ui.数据字典', '数据字典'),
    ORG: t('ui.组织架构', '组织架构'),
    PRODUCT: t('ui.商品主数据', '商品主数据'),
    TRANSFER: t('ui.调拨单', '调拨单'),
    STOCKTAKE: t('ui.盘点单', '盘点单'),
    CREDIT: t('ui.信用台账', '信用台账'),
    RECEIVABLE: t('ui.应收账款', '应收账款'),
    PAYABLE: t('ui.应付账款', '应付账款')
  };
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const load = useCallback(async (pg = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((pg - 1) * PAGE_SIZE),
        sort: "id",
        order: "desc"
      });
      if (actionFilter !== "ALL") params.set("action", actionFilter);
      if (search.trim()) params.set("q", search.trim());
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const r = await fetch(`/api/crud/sys_approval_log?${params}`, {
        headers: hdr()
      });
      const data = await r.json();
      setLogs(data.data ?? []);
      setTotal(data.total ?? 0);
      setPage(pg);
    } finally {
      setLoading(false);
    }
  }, [actionFilter, search, dateFrom, dateTo]);
  useEffect(() => {
    load(1);
  }, [actionFilter]);
  const handleSearch = () => load(1);
  const totalPages = Math.ceil(total / PAGE_SIZE);
  return <div className="animate-fade-in">
      <PageHeader title={t('ui.审计日志', '审计日志')} subtitle={t('ui.系统操作轨迹与审批行为全量记录支持按操作类型日期范围查询', '系统操作轨迹与审批行为全量记录，支持按操作类型、日期范围查询')} breadcrumb={[t('ui.系统设置', '系统设置'), t('ui.审计日志', '审计日志')]} actions={<div style={{
      display: "flex",
      gap: 8
    }}>
            <button type="button" onClick={() => load(page)} style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "7px 14px",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        background: "var(--bg-card)",
        cursor: "pointer",
        fontSize: 13,
        color: "var(--text-primary)"
      }}>
              <RefreshCw size={13} /> {t('common.refresh', '刷新')}
            </button>
            <button type="button" onClick={() => toast.error(t('ui.导出功能开发中', '导出功能开发中'))} style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "7px 14px",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        background: "var(--bg-card)",
        cursor: "pointer",
        fontSize: 13,
        color: "var(--text-secondary)"
      }}>
              <Download size={13} /> {t('common.export', '导出')}
            </button>
          </div>} />

      {/* 搜索与筛选栏 */}
      <div style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      padding: "16px 20px",
      marginBottom: 16,
      display: "flex",
      gap: 12,
      flexWrap: "wrap",
      alignItems: "flex-end"
    }}>
        <div style={{
        flex: 1,
        minWidth: 180
      }}>
          <label style={{
          display: "block",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-secondary)",
          marginBottom: 6
        }}>{t('ui.关键词搜索', '关键词搜索')}</label>
          <div style={{
          position: "relative"
        }}>
            <Search size={13} style={{
            position: "absolute",
            left: 10,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--text-secondary)"
          }} />
            <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearch()} placeholder={t('ui.单据类型操作人', '单据类型 / 操作人…')} style={{
            width: "100%",
            padding: "8px 10px 8px 30px",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 13,
            background: "var(--bg-page)",
            color: "var(--text-primary)",
            boxSizing: "border-box"
          }} />
          </div>
        </div>
        <div style={{
        minWidth: 140
      }}>
          <label style={{
          display: "block",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-secondary)",
          marginBottom: 6
        }}>{t('ui.开始日期', '开始日期')}</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{
          padding: "8px 10px",
          border: "1px solid var(--border)",
          borderRadius: 8,
          fontSize: 13,
          background: "var(--bg-page)",
          color: "var(--text-primary)",
          width: "100%"
        }} />
        </div>
        <div style={{
        minWidth: 140
      }}>
          <label style={{
          display: "block",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-secondary)",
          marginBottom: 6
        }}>{t('ui.结束日期', '结束日期')}</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{
          padding: "8px 10px",
          border: "1px solid var(--border)",
          borderRadius: 8,
          fontSize: 13,
          background: "var(--bg-page)",
          color: "var(--text-primary)",
          width: "100%"
        }} />
        </div>
        <button type="button" onClick={handleSearch} style={{
        padding: "8px 20px",
        background: "var(--color-primary)",
        color: "white",
        border: "none",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        height: 36
      }}>
          {t('common.search', '查询')}
        </button>
        {(search || dateFrom || dateTo) && <button type="button" onClick={() => {
        setSearch("");
        setDateFrom("");
        setDateTo("");
        setTimeout(() => load(1), 0);
      }} style={{
        padding: "8px 14px",
        border: "1px solid var(--border)",
        background: "var(--bg-page)",
        borderRadius: 8,
        fontSize: 13,
        cursor: "pointer",
        color: "var(--text-secondary)",
        height: 36
      }}>
            {t('ui.重置', '重置')}
          </button>}
      </div>

      {/* 操作类型 Tab */}
      <div style={{
      display: "flex",
      gap: 8,
      marginBottom: 16,
      flexWrap: "wrap"
    }}>
        <button type="button" onClick={() => setActionFilter("ALL")} style={{
        padding: "6px 14px",
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        border: "1.5px solid",
        background: actionFilter === "ALL" ? "var(--color-primary)" : "var(--bg-card)",
        color: actionFilter === "ALL" ? "white" : "var(--text-secondary)",
        borderColor: actionFilter === "ALL" ? "var(--color-primary)" : "var(--border)"
      }}>
          {t('ui.全部', '全部')}
        </button>
        {Object.entries(ACTION_META).map(([k, m]) => <button type="button" key={k} onClick={() => setActionFilter(k)} style={{
        padding: "6px 14px",
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        border: `1.5px solid ${actionFilter === k ? m.color : "var(--border)"}`,
        background: actionFilter === k ? m.bg : "var(--bg-card)",
        color: actionFilter === k ? m.color : "var(--text-secondary)"
      }}>
            {m.label}
          </button>)}
      </div>

      {/* 日志表格 */}
      {loading ? <div style={{
      padding: 60,
      textAlign: "center",
      color: "var(--text-secondary)"
    }}>{t('common.loading', '加载中...')}</div> : logs.length === 0 ? <div style={{
      padding: 60,
      textAlign: "center",
      color: "var(--text-secondary)",
      background: "var(--bg-card)",
      borderRadius: "var(--radius-lg)",
      border: "1px solid var(--border)"
    }}>
          <History size={40} style={{
        opacity: 0.2,
        display: "block",
        margin: "0 auto 12px"
      }} />
          {t('ui.暂无符合条件的审计记录', '暂无符合条件的审计记录')}
        </div> : <div style={{
      background: "var(--bg-card)",
      borderRadius: "var(--radius-lg)",
      border: "1px solid var(--border)",
      overflow: "hidden"
    }}>
          <table className={s.table}>
            <thead>
              <tr>
                {[t('ui.操作类型', '操作类型'), t('ui.单据类型', '单据类型'), t('ui.单据号', '单据号'), t('ui.操作者', '操作者'), t('common.remark', '备注'), t('ui.时间', '时间')].map(h => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {logs.map(log => {
            const m = ACTION_META[log.action] ?? {
              label: log.action,
              color: "var(--text-secondary)",
              bg: "var(--bg-muted)"
            };
            const docLabel = DOC_TYPE_MAP[log.doc_type] || log.doc_type;
            return <tr key={log.id}>
                    <td>
                      <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: 20,
                  background: m.bg,
                  color: m.color
                }}>{m.label}</span>
                    </td>
                    <td style={{
                color: "var(--text-primary)"
              }}>
                      {docLabel}
                    </td>
                    <td>
                      <span style={{
                  fontFamily: "monospace",
                  fontSize: 12,
                  color: "var(--color-primary)"
                }}>#{log.doc_id}</span>
                    </td>
                    <td>
                      <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  color: "var(--text-primary)"
                }}>
                        <User size={13} />
                        <span className={u.fs12}>{log.operator || log.approver_role}</span>
                        {log.approver_id && <span style={{
                    fontSize: 11,
                    color: "var(--text-secondary)"
                  }}>(#{log.approver_id})</span>}
                      </div>
                    </td>
                    <td style={{
                color: "var(--text-secondary)",
                fontSize: 12,
                maxWidth: 200
              }}>
                      {log.comment || <span style={{
                  opacity: 0.4
                }}>—</span>}
                    </td>
                    <td>
                      <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  color: "var(--text-secondary)",
                  fontSize: 12
                }}>
                        <Clock size={12} />{new Date(log.created_at).toLocaleString("zh-CN")}
                      </div>
                    </td>
                  </tr>;
          })}
            </tbody>
          </table>
        </div>}

      {/* 分页 */}
      <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 16
    }}>
        <span style={{
        fontSize: 13,
        color: "var(--text-secondary)"
      }}>{t('common.total', '共')} {total} {t('ui.条记录', '条记录')}</span>
        {totalPages > 1 && <div className={u.flexRow8}>
            <button type="button" onClick={() => load(Math.max(1, page - 1))} disabled={page <= 1} style={{
          padding: "6px 12px",
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--bg-card)",
          cursor: page <= 1 ? "not-allowed" : "pointer",
          opacity: page <= 1 ? 0.4 : 1,
          display: "flex",
          alignItems: "center",
          gap: 4,
          fontSize: 13
        }}>
              <ChevronLeft size={14} /> {t('ui.上一页', '上一页')}
            </button>
            <span style={{
          fontSize: 13,
          color: "var(--text-secondary)",
          padding: "0 8px"
        }}>
              {t('ui.第页共页', '第')} {page} / {totalPages} {t('ui.页', '页')}
            </span>
            <button type="button" onClick={() => load(page + 1)} disabled={page >= totalPages} style={{
          padding: "6px 12px",
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--bg-card)",
          cursor: page >= totalPages ? "not-allowed" : "pointer",
          opacity: page >= totalPages ? 0.4 : 1,
          display: "flex",
          alignItems: "center",
          gap: 4,
          fontSize: 13
        }}>
              {t('ui.下一页', '下一页')} <ChevronRight size={14} />
            </button>
          </div>}
      </div>
    </div>;
}