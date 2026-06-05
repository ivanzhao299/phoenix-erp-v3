"use client";

import { useState, useEffect, useCallback } from "react";
import { CheckCircle, XCircle, Clock, RefreshCw, ChevronLeft, ChevronRight, Filter } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import s from "@/components/ui/admin-ui.module.css";

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

// ── 类型 ─────────────────────────────────────────────────────────────────────
interface ApprovalInstance {
  id: string;
  instanceNo: string;
  moduleCode: string;
  bizType: string;
  bizId: string;
  bizNo: string;
  totalSteps: number;
  currentStepNo: number;
  status: string;
  startedBy: string;
  startedAt: string;
  finishedAt: string;
  // Phase B 摘要字段
  amount: number | null;
  currencyCode: string | null;
  companyName: string | null;
  projectName: string | null;
  subject: string | null;
}

// ── 常量 ─────────────────────────────────────────────────────────────────────
const BIZ_TYPE_LABEL: Record<string, string> = {
  PR: "采购申请",
  PO: "采购订单",
  PAYMENT: "付款申请",
  FUND: "股东资金"
};
const STATUS_CONFIG: Record<string, {
  label: string;
  color: string;
  icon: React.ReactNode;
}> = {
  APPROVED: {
    label: "已通过",
    color: "var(--status-success)",
    icon: <CheckCircle size={14} />
  },
  REJECTED: {
    label: "已拒绝",
    color: "var(--status-danger)",
    icon: <XCircle size={14} />
  },
  CANCELLED: {
    label: "已取消",
    color: "var(--text-disabled)",
    icon: <Clock size={14} />
  }
};
const BIZ_TYPE_FILTERS = [{
  label: "全部",
  value: ""
}, {
  label: "采购申请",
  value: "PR"
}, {
  label: "采购订单",
  value: "PO"
}, {
  label: "付款申请",
  value: "PAYMENT"
}, {
  label: "股东资金",
  value: "FUND"
}];
function fmtDate(s: string) {
  if (!s) return "-";
  return new Date(s).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

// ── API ───────────────────────────────────────────────────────────────────────
async function fetchHistory(page: number, pageSize: number, bizType?: string) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize)
  });
  if (bizType) params.set("bizType", bizType);
  const res = await fetch(`/api/approval/history?${params}`, {
    headers: authHdr()
  });
  if (!res.ok) return {
    list: [],
    total: 0,
    page: 1,
    pageSize
  };
  return res.json();
}

// ── 组件 ─────────────────────────────────────────────────────────────────────
export default function ApprovalHistoryPage() {
  const [list, setList] = useState<ApprovalInstance[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [bizType, setBizType] = useState("");
  const pageSize = 20;
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchHistory(page, pageSize, bizType || undefined);
      setList(data.list ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [page, bizType]);
  useEffect(() => {
    load();
  }, [load]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const handleBizTypeChange = (val: string) => {
    setBizType(val);
    setPage(1);
  };
  return <div>
      <PageHeader title="审批历史" subtitle="查看所有已完成的审批记录" breadcrumb={["审批中心", "历史"]} />

      <section className={s.card}>
        <div className={s.cardBody} style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12
      }}>
          <div className={u.flexRow8}>
            <Filter size={14} className={u.muted} />
            <span style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            marginRight: 4
          }}>业务类型：</span>
            {BIZ_TYPE_FILTERS.map(f => <button key={f.value} onClick={() => handleBizTypeChange(f.value)} style={{
            padding: "4px 12px",
            borderRadius: 6,
            fontSize: 13,
            cursor: "pointer",
            border: "1px solid",
            borderColor: bizType === f.value ? "var(--color-accent)" : "var(--border)",
            background: bizType === f.value ? "color-mix(in srgb, var(--color-accent) 12%, transparent)" : "var(--bg-card)",
            color: bizType === f.value ? "var(--color-accent)" : "var(--text-primary)",
            fontWeight: bizType === f.value ? 600 : 400
          }}>
                {f.label}
              </button>)}
          </div>
          <button className={s.btnSecondary} onClick={load} disabled={loading}>
            <RefreshCw size={14} style={{
            marginRight: 6
          }} />刷新
          </button>
        </div>

        {loading ? <div className={s.cardBody} style={{
        textAlign: "center",
        color: "var(--text-disabled)",
        padding: 48
      }}>加载中…</div> : list.length === 0 ? <div className={s.cardBody} style={{
        textAlign: "center",
        color: "var(--text-disabled)",
        padding: 48
      }}>
            <Clock size={36} style={{
          margin: "0 auto 12px",
          opacity: 0.4
        }} />
            <p>暂无审批历史</p>
          </div> : <>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>业务类型</th>
                  <th>单据编号</th>
                  <th>主题</th>
                  <th>金额</th>
                  <th>公司</th>
                  <th>审批结果</th>
                  <th>提交时间</th>
                  <th>完成时间</th>
                </tr>
              </thead>
              <tbody>
                {list.map(inst => {
              const cfg = STATUS_CONFIG[inst.status] ?? {
                label: inst.status,
                color: "var(--text-disabled)",
                icon: null
              };
              return <tr key={inst.id}>
                      <td>{BIZ_TYPE_LABEL[inst.bizType] ?? inst.bizType}</td>
                      <td>
                        <span style={{
                    fontWeight: 600,
                    fontFamily: "monospace",
                    fontSize: 12
                  }}>{inst.bizNo || inst.bizId}</span>
                      </td>
                      <td>
                        <span style={{
                    fontSize: 12,
                    maxWidth: 120,
                    display: "block",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  }}>
                          {inst.subject || "-"}
                        </span>
                      </td>
                      <td style={{
                  fontSize: 13,
                  fontWeight: 600
                }}>
                        {inst.amount != null ? `${Number(inst.amount).toLocaleString("zh-CN", {
                    maximumFractionDigits: 0
                  })} ${inst.currencyCode ?? ""}` : "-"}
                      </td>
                      <td className={u.muted12}>{inst.companyName ?? "-"}</td>
                      <td>
                        <span style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    color: cfg.color,
                    fontWeight: 600,
                    fontSize: 13
                  }}>
                          {cfg.icon} {cfg.label}
                        </span>
                      </td>
                      <td className={u.muted12}>{fmtDate(inst.startedAt)}</td>
                      <td className={u.muted12}>{fmtDate(inst.finishedAt)}</td>
                    </tr>;
            })}
              </tbody>
            </table>

            {/* 分页 */}
            <div className={`${s.cardBody} ${u.flexBetween}`}>
              <span style={{
            fontSize: 13,
            color: "var(--text-secondary)"
          }}>共 {total} 条</span>
              <div style={{
            display: "flex",
            gap: 6
          }}>
                <button className={s.btnSecondary} onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={{
              padding: "4px 10px"
            }}>
                  <ChevronLeft size={14} />
                </button>
                <span style={{
              padding: "4px 12px",
              fontSize: 13,
              color: "var(--text-primary)"
            }}>
                  {page} / {totalPages}
                </span>
                <button className={s.btnSecondary} onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{
              padding: "4px 10px"
            }}>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>}
      </section>
    </div>;
}