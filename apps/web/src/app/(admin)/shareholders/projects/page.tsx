'use client';

import { useEffect, useState } from 'react';
import { shareholderApi, ShrProject, PROJECT_TYPE_LABEL, ORG_CODE_LABEL, lbl } from '@/lib/shareholder-api';
import { SummaryBar, sum, yuan } from '../SummaryBar';
import PageHeader from '@/components/PageHeader';
import u from "@/styles/uix-utils.module.css";
import { useLanguage } from "@/contexts/LanguageContext";
const CAP_LABEL: Record<string, string> = {
  PAID_IN_FULL: '已到位',
  PARTIALLY_PAID: '部分到位',
  PENDING_CONFIRMATION: '待确认'
};
const EQ_LABEL: Record<string, string> = {
  CONFIRMED: '已确认股权',
  PROVISIONAL: '暂定股权'
};
const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  background: 'var(--color-primary)',
  color: 'var(--text-on-dark)',
  fontSize: 13,
  fontWeight: 600
};
const td: React.CSSProperties = {
  padding: '9px 12px',
  borderBottom: '1px solid var(--border)',
  fontSize: 13.5
};
export default function ProjectsPage() {
  const { t } = useLanguage();
  const [rows, setRows] = useState<ShrProject[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    shareholderApi.listProjects().then(setRows).catch(e => setErr(e?.message || t('ui.加载失败','加载失败'))).finally(() => setLoading(false));
  }, []);
  return <div className={u.p24}>
      <PageHeader title={t('ui.股东项目','股东项目')} />
      {err && <div style={{
      color: 'var(--status-danger)',
      marginBottom: 12
    }}>{err}</div>}
      <SummaryBar items={[{
      label: t('ui.项目总数','项目总数'),
      value: String(rows.length),
      accent: true
    }, {
      label: t('ui.各项目总实缴合计','各项目总实缴合计'),
      value: yuan(sum(rows, r => Number((r as any).totalPaidInCapital || 0)))
    }, {
      label: t('ui.股东人次合计','股东人次合计'),
      value: String(sum(rows, r => Number(r.holders || 0)))
    }]} />
      {loading ? <div>{t('ui.加载中…','加载中…')}</div> : <table style={{
      width: '100%',
      borderCollapse: 'collapse',
      background: 'var(--bg-card)',
      borderRadius: 8,
      overflow: 'hidden'
    }}>
          <thead><tr>
            <th style={th}>{t('ui.项目名称','项目名称')}</th><th style={th}>{t('ui.所属公司','所属公司')}</th>
            <th style={th}>{t('ui.场区','场区')}</th><th style={th}>{t('ui.类型','类型')}</th><th style={th}>{t('ui.股权状态','股权状态')}</th>
            <th style={th}>{t('ui.股东数','股东数')}</th><th style={th}>{t('ui.股比合计','股比合计')}</th>
          </tr></thead>
          <tbody>
            {rows.map(p => <tr key={p.projectCode}>
                <td style={{
            ...td,
            fontWeight: 600
          }}>{p.projectName}</td>
                <td style={td}>{lbl(ORG_CODE_LABEL, p.companyCode)}</td>
                <td style={td}>{lbl(ORG_CODE_LABEL, p.siteCode)}</td>
                <td style={td}>{lbl(PROJECT_TYPE_LABEL, p.projectType)}</td>
                <td style={td}>
                  <span style={{
              padding: '2px 8px',
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 600,
              background: p.equityStatus === 'CONFIRMED' ? 'color-mix(in srgb, var(--status-success) 14%, transparent)' : 'color-mix(in srgb, var(--status-warning) 14%, transparent)',
              color: p.equityStatus === 'CONFIRMED' ? 'var(--status-success)' : 'var(--status-warning)'
            }}>
                    {EQ_LABEL[p.equityStatus] || p.equityStatus}
                  </span>
                </td>
                <td style={td}>{p.holders ?? 0}</td>
                <td style={{
            ...td,
            color: Math.abs((p.ratioSum ?? 0) - 100) <= 0.01 ? 'var(--status-success)' : 'var(--status-danger)',
            fontWeight: 600
          }}>
                  {(p.ratioSum ?? 0).toFixed(2)}%
                </td>
              </tr>)}
            {rows.length === 0 && <tr><td style={td} colSpan={7}>{t('ui.暂无项目','暂无项目')}</td></tr>}
          </tbody>
        </table>}
    </div>;
}