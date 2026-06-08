"use client";

import { useState, useEffect, useCallback } from "react";
import { Clock, RefreshCw, ExternalLink } from "lucide-react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { usePermission } from "@/hooks/usePermission";
import { EmptyState, LoadingSkeleton } from "@/components/design-system";
import request from "@/lib/api-client";

/**
 * 主数据待审批（G3-B）
 * 汇总展示客户/供应商/项目/资金账户中处于「待审批」状态的主数据。
 * 实际审批在「审批中心」待办完成（Workflow 2.0）。
 */
import u from "@/styles/uix-utils.module.css";
import s from '@/components/ui/admin-ui.module.css'; // G29-B
const TYPES = [{
  type: "customer",
  label: "客户",
  codeKey: "customer_no",
  nameKey: "customer_name"
}, {
  type: "supplier",
  label: "供应商",
  codeKey: "supplier_code",
  nameKey: "supplier_name"
}, {
  type: "project",
  label: "项目公司",
  codeKey: "project_code",
  nameKey: "project_name"
}, {
  type: "cash-account",
  label: "资金账户",
  codeKey: "account_code",
  nameKey: "account_name"
}];
export default function MasterDataPendingPage() {
  const {
    canView
  } = usePermission("MENU_MASTER_DATA");
  const [data, setData] = useState<Record<string, Record<string, any>[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const results = await Promise.allSettled(TYPES.map(t => request<Record<string, any>[]>(`/master-data/runtime/${t.type}?status=PENDING_APPROVAL`)));
      const map: Record<string, Record<string, any>[]> = {};
      TYPES.forEach((t, i) => {
        map[t.type] = results[i].status === "fulfilled" ? (results[i] as PromiseFulfilledResult<any>).value : [];
      });
      setData(map);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (canView) load();
  }, [canView, load]);
  if (!canView) return <div className={u.emptyPad40}>无权限访问</div>;
  const total = Object.values(data).reduce((s, arr) => s + arr.length, 0);
  return <div className="animate-fade-in" style={{
    padding: "24px 32px",
    maxWidth: 1100
  }}>
      <PageHeader title="主数据待审批" subtitle="待审批主数据汇总 · 审批在「审批中心」待办完成（通过后自动生效）" breadcrumb={["主数据中心", "主数据待审批"]} />

      <div style={{
      display: "flex",
      gap: 10,
      alignItems: "center",
      marginBottom: 18
    }}>
        <button onClick={load} disabled={loading} className="bg-bg-muted border border-border text-text-muted" style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 16px",
        borderRadius: 8,
        fontSize: 13,
        cursor: "pointer"
      }}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> 刷新
        </button>
        <Link href="/workflow/tasks/todo" style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 16px",
        borderRadius: 8,
        background: "var(--color-primary)",
        color: "white",
        fontSize: 13,
        fontWeight: 600,
        textDecoration: "none",
        marginLeft: "auto"
      }}>
          <ExternalLink size={14} /> 前往审批中心
        </Link>
      </div>

      {error && <div style={{
      padding: "10px 14px",
      borderRadius: 8,
      marginBottom: 14,
      background: "var(--status-danger-bg)",
      border: "1px solid var(--status-danger-border)",
      color: "var(--status-danger)",
      fontSize: 13
    }}>{error}</div>}

      {loading ? <div style={{
      padding: 16
    }}><LoadingSkeleton variant="card" rows={3} /></div> : total === 0 ? <EmptyState title="暂无待审批主数据" description="所有主数据均已审批生效" /> : <div style={{
      display: "flex",
      flexDirection: "column",
      gap: 18
    }}>
            {TYPES.map(t => data[t.type]?.length > 0 && <div key={t.type}>
                <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
          fontSize: 14,
          fontWeight: 600,
          color: "var(--text-primary)"
        }}>
                  <Clock size={15} style={{
            color: "var(--status-warning)"
          }} /> {t.label}
                  <span style={{
            fontSize: 11,
            fontWeight: 400,
            color: "var(--text-secondary)",
            background: "var(--status-warning-bg, var(--bg-muted))",
            padding: "1px 8px",
            borderRadius: 10
          }}>{data[t.type].length} 待审批</span>
                </div>
                <div style={{
          borderRadius: 10,
          border: "1px solid var(--border)",
          overflow: "hidden",
          background: "var(--bg-card)"
        }}>
                  <table className={s.table}>
                    <thead><tr style={{
                background: "var(--bg-muted)",
                color: "var(--text-secondary)"
              }}>
                      <th style={{
                  textAlign: "left",
                  padding: "9px 14px"
                }}>编码</th>
                      <th style={{
                  textAlign: "left",
                  padding: "9px 14px"
                }}>名称</th>
                    </tr></thead>
                    <tbody>
                      {data[t.type].map(r => <tr key={r[t.codeKey]} style={{
                borderTop: "1px solid var(--border)"
              }}>
                          <td style={{
                  padding: "9px 14px",
                  fontFamily: "monospace",
                  color: "var(--color-primary)"
                }}>{r[t.codeKey]}</td>
                          <td style={{
                  padding: "9px 14px"
                }}>{r[t.nameKey]}</td>
                        </tr>)}
                    </tbody>
                  </table>
                </div>
              </div>)}
          </div>}
    </div>;
}