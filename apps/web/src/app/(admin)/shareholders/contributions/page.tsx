'use client';

import { useEffect, useState } from 'react';
import { shareholderApi, ShrContribution, ShrProject, SOURCE_TYPE_LABEL, CONTRIB_STATUS_LABEL, lbl } from '@/lib/shareholder-api';
import { SummaryBar, sum, yuan } from '../SummaryBar';
import PageHeader from '@/components/PageHeader';
import u from "@/styles/uix-utils.module.css";
import { useLanguage } from "@/contexts/LanguageContext";
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
export default function ContributionsPage() {
  const { t } = useLanguage();
  const [projects, setProjects] = useState<ShrProject[]>([]);
  const [sel, setSel] = useState('');
  const [rows, setRows] = useState<ShrContribution[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const pmap = Object.fromEntries(projects.map(p => [p.projectCode, p.projectName]));
  const [err, setErr] = useState('');
  useEffect(() => {
    shareholderApi.listProjects().then(setProjects).catch(e => setErr(e?.message));
    shareholderApi.listShareholders().then(s => setNames(Object.fromEntries(s.map(x => [x.shareholderCode, x.shareholderName])))).catch(() => {});
  }, []);
  useEffect(() => {
    shareholderApi.listContributions(sel || undefined).then(setRows).catch(e => setErr(e?.message));
  }, [sel]);
  return <div className={u.p24}>
      <PageHeader title={t('ui.出资台账','出资台账')} />
      <div className={u.mb14}>
        <label style={{
        marginRight: 8,
        fontSize: 14
      }}>{t('ui.项目：','项目：')}</label>
        <select value={sel} onChange={e => setSel(e.target.value)} style={{
        padding: '6px 10px',
        borderRadius: 6,
        border: '1px solid var(--border)'
      }}>
          <option value="">{t('ui.全部','全部')}</option>
          {projects.map(p => <option key={p.projectCode} value={p.projectCode}>{p.projectName}</option>)}
        </select>
      </div>
      {err && <div style={{
      color: 'var(--status-danger)',
      marginBottom: 12
    }}>{err}</div>}
      <SummaryBar items={[{
      label: t('ui.合计出资金额','合计出资金额'),
      value: yuan(sum(rows, r => Number(r.amount || 0))),
      accent: true
    }, {
      label: t('ui.记录笔数','记录笔数'),
      value: String(rows.length)
    }]} />
      <table style={{
      width: '100%',
      borderCollapse: 'collapse',
      background: 'var(--bg-card)',
      borderRadius: 8,
      overflow: 'hidden'
    }}>
        <thead><tr>
          <th style={th}>{t('ui.出资单号','出资单号')}</th><th style={th}>{t('ui.项目','项目')}</th><th style={th}>{t('ui.股东','股东')}</th><th style={th}>{t('ui.金额','金额')}</th>
          <th style={th}>{t('ui.币种','币种')}</th><th style={th}>{t('ui.来源','来源')}</th><th style={th}>{t('ui.日期','日期')}</th><th style={th}>{t('ui.状态','状态')}</th>
        </tr></thead>
        <tbody>
          {rows.map(c => <tr key={c.id}>
              <td style={td}>{c.contributionNo}</td>
              <td style={td}>{pmap[c.projectCode] || c.projectCode}</td>
              <td style={td}>{names[c.shareholderCode] || c.shareholderCode}</td>
              <td style={{
            ...td,
            fontWeight: 600
          }}>{Number(c.amount).toLocaleString('zh-CN', {
              minimumFractionDigits: 2
            })}</td>
              <td style={td}>{c.currency === 'CNY' ? t('ui.人民币','人民币') : c.currency}</td>
              <td style={td}>{lbl(SOURCE_TYPE_LABEL, c.sourceType)}</td>
              <td style={td}>{c.contributionDate || '-'}</td>
              <td style={td}>{lbl(CONTRIB_STATUS_LABEL, c.status)}</td>
            </tr>)}
          {rows.length === 0 && <tr><td style={td} colSpan={8}>{t('ui.暂无出资记录（本阶段先建台账，历史出资款后续导入）','暂无出资记录（本阶段先建台账，历史出资款后续导入）')}</td></tr>}
        </tbody>
      </table>
    </div>;
}