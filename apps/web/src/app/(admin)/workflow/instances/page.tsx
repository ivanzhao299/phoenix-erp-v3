"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import s from "@/components/ui/admin-ui.module.css";
import { primaryActionButton, secondaryActionButton, actionPill, toolbarFilterPill } from "@/components/design-system/cockpit-styles";
import { workflowApi, type WorkflowInstance } from "@/lib/workflow-api";
import u from "@/styles/uix-utils.module.css";
import { useLanguage } from "@/contexts/LanguageContext";
const STATUS_FILTERS = [{
  label: "全部",
  value: ""
}, {
  label: "审批中",
  value: "RUNNING"
}, {
  label: "已通过",
  value: "APPROVED"
}, {
  label: "已驳回",
  value: "REJECTED"
}, {
  label: "已取消",
  value: "CANCELED"
}];
export default function WorkflowInstancesPage() {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<WorkflowInstance[]>([]);
  const [status, setStatus] = useState(searchParams.get("status") || "");
  const [loadError, setLoadError] = useState<string>("");

  // owner=me: 仅显示当前用户发起的实例（每日工作台"我的提交记录"卡片触发）
  const ownerFilter = searchParams.get("owner");
  const myUserId = typeof window !== 'undefined'
    ? (() => {
        try {
          const raw = sessionStorage.getItem('phoenix_user') || localStorage.getItem('phoenix_user');
          if (!raw) return null;
          const u = JSON.parse(raw);
          return u.userId || u.id || null;
        } catch { return null; }
      })()
    : null;

  // WF-2 P0：禁止 catch-swallow — 5xx 必须显式提示，不能伪装空
  const load = useCallback(async () => {
    setLoadError("");
    try {
      const res = await workflowApi.instances(status || undefined);
      let data = res.data || [];
      // owner=me 时前端过滤启动人
      if (ownerFilter === 'me' && myUserId) {
        data = data.filter((r: any) => String(r.startedBy || r.starterId || r.starter_id) === String(myUserId));
      }
      setRows(data);
    } catch (err) {
      console.error('[workflow/instances] load failed:', err);
      setLoadError(err instanceof Error ? `${t('ui.加载流程实例失败','加载流程实例失败')}：${err.message}` : t('ui.加载流程实例失败','加载流程实例失败'));
      setRows([]);
    }
  }, [status, ownerFilter, myUserId]);
  useEffect(() => {
    void load();
  }, [load]);
  const counts = useMemo(() => {
    const map: Record<string, number> = {
      ALL: rows.length
    };
    rows.forEach(row => {
      map[row.status] = (map[row.status] || 0) + 1;
    });
    return map;
  }, [rows]);
  return <div>
      <PageHeader title={t('ui.流程实例','流程实例')} subtitle={t('ui.查看我发起或参与过的流程，跟踪当前审批状态','查看我发起或参与过的流程，跟踪当前审批状态')} breadcrumb={[t('ui.工作流','工作流'), t('ui.流程实例','流程实例')]} actions={<Link href="/workflow/start" style={primaryActionButton}>{t('ui.发起申请','发起申请')}</Link>} />

      <section className={`${s.card} ${u.mb12}`}>
        <div className={s.cardBody} style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16
      }}>
          <div>
            <h3 className={s.cardTitle}>{t('ui.实例列表','实例列表')}</h3>
            <p className={`${s.modalDesc} ${u.mt4}`}>当前条件下共 {rows.length} 条流程。</p>
          </div>
          <div style={filterStyle}>
            {STATUS_FILTERS.map(item => <button key={item.value || "ALL"} type="button" className={`${s.tabPill} ${status === item.value ? s.tabPillActive : ""}`} onClick={() => setStatus(item.value)}>
                {item.label}
                <span>{item.value ? counts[item.value] || 0 : counts.ALL || 0}</span>
              </button>)}
          </div>
        </div>
      </section>

      {loadError && <section className={s.card} style={{
      marginBottom: 12,
      borderLeft: '4px solid var(--status-danger)'
    }}>
          <div className={s.cardBody} style={{
        color: 'var(--status-danger)'
      }}>
            <strong>⚠ {t('ui.数据加载失败','数据加载失败')}</strong>
            <div style={{
          marginTop: 4,
          fontSize: 13
        }}>{loadError}</div>
            <button type="button" onClick={() => void load()} style={{ ...secondaryActionButton, marginTop: 8 }}>{t('ui.重试','重试')}</button>
          </div>
        </section>}

      <section className={s.card}>
        {rows.length ? <table className={s.table}>
            <thead><tr><th>{t('ui.编号','编号')}</th><th>{t('ui.标题','标题')}</th><th>{t('ui.状态','状态')}</th><th>{t('ui.发起人','发起人')}</th><th>{t('ui.发起时间','发起时间')}</th><th>{t('ui.操作','操作')}</th></tr></thead>
            <tbody>{rows.map(row => <tr key={row.id}>
                <td><Link href={`/workflow/instances/${row.id}`}>{row.instance_no}</Link></td>
                <td>
                  <strong>{row.title}</strong>
                  <div style={subTextStyle}>{row.business_type || t('ui.工作流','工作流')}</div>
                </td>
                <td><span className={statusBadgeClass(row.status)}>{statusText(row.status)}</span></td>
                <td>{row.starter_name || "-"}</td>
                <td>{formatDate(row.created_at)}</td>
                <td><Link href={`/workflow/instances/${row.id}`}>{t('ui.查看详情','查看详情')}</Link></td>
              </tr>)}</tbody>
          </table> : <div className={s.emptyState}>
            <div className={s.emptyStateText}>{t('ui.当前没有流程实例，可以先发起一个申请。','当前没有流程实例，可以先发起一个申请。')}</div>
          </div>}
      </section>
    </div>;
}
function statusText(status: string) {
  if (status === "RUNNING") return "审批中";
  if (status === "APPROVED") return "已通过";
  if (status === "REJECTED") return "已驳回";
  if (status === "CANCELED") return "已取消";
  return status || "-";
}
function formatDate(value?: string) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(0, 16);
}
function statusBadgeClass(status: string) {
  if (status === "APPROVED") return `${s.badge} ${s.badgeSuccess}`;
  if (status === "RUNNING") return `${s.badge} ${s.badgeInfo}`;
  if (status === "REJECTED" || status === "CANCELED") return `${s.badge} ${s.badgeDanger}`;
  return `${s.badge} ${s.badgeNeutral}`;
}
const filterStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  justifyContent: "flex-end"
};
const subTextStyle: React.CSSProperties = {
  marginTop: 4,
  color: "var(--text-secondary)",
  fontSize: 12
};