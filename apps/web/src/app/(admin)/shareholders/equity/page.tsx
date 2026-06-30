'use client';

import { useEffect, useState } from 'react';
import u from "@/styles/uix-utils.module.css";
import { shareholderApi, ShrEquity, ShrProject, ShrBeneficial, EQUITY_STATUS_LABEL, PAID_IN_SOURCE_LABEL, lbl } from '@/lib/shareholder-api';
import { useLanguage } from "@/contexts/LanguageContext";
import { SummaryBar, sum, yuan } from '../SummaryBar';
import PageHeader from '@/components/PageHeader';
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
const EQ_LABEL = EQUITY_STATUS_LABEL;
const money = (v?: string | null) => v == null ? '—' : Number(v).toLocaleString('zh-CN', {
  minimumFractionDigits: 2
});
export default function EquityPage() {
  const { t } = useLanguage();
  const [projects, setProjects] = useState<ShrProject[]>([]);
  const [sel, setSel] = useState('');
  const [view, setView] = useState<'legal' | 'beneficial'>('legal');
  const [rows, setRows] = useState<ShrEquity[]>([]);
  const [bene, setBene] = useState<ShrBeneficial[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');
  const shName = (code: string) => names[code] || code;
  useEffect(() => {
    shareholderApi.listProjects().then(p => {
      setProjects(p);
      if (p[0]) setSel(p[0].projectCode);
    }).catch(e => setErr(e?.message));
    shareholderApi.listShareholders().then(s => setNames(Object.fromEntries(s.map(x => [x.shareholderCode, x.shareholderName])))).catch(() => {});
  }, []);
  useEffect(() => {
    if (!sel) return;
    shareholderApi.listEquity(sel).then(setRows).catch(e => setErr(e?.message));
    shareholderApi.listBeneficial(sel).then(setBene).catch(() => setBene([]));
  }, [sel]);
  const curProject = projects.find(p => p.projectCode === sel);
  const isProvisional = (rows[0]?.equityStatus || curProject?.equityStatus) === 'PROVISIONAL';
  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: '7px 16px',
    borderRadius: 8,
    border: '1px solid ' + (active ? 'var(--color-primary)' : 'var(--border)'),
    background: active ? 'var(--color-primary)' : 'var(--bg-card)',
    color: active ? 'var(--bg-card)' : 'var(--text-secondary)',
    fontWeight: 600,
    fontSize: 13.5,
    cursor: 'pointer'
  });
  return <div className={u.p24}>
      <PageHeader title={t('ui.股权结构 / 实益出资结构','股权结构 / 实益出资结构')} />
      <div style={{
      display: 'flex',
      gap: 12,
      alignItems: 'center',
      marginBottom: 12
    }}>
        <label className={u.fs14}>{t('ui.项目：','项目：')}</label>
        <select value={sel} onChange={e => setSel(e.target.value)} style={{
        padding: '6px 10px',
        borderRadius: 6,
        border: '1px solid var(--border)'
      }}>
          {projects.map(p => <option key={p.projectCode} value={p.projectCode}>{p.projectName}（{EQ_LABEL[p.equityStatus] || p.equityStatus}）</option>)}
        </select>
        <div style={{
        marginLeft: 'auto',
        display: 'flex',
        gap: 8
      }}>
          <button style={tabBtn(view === 'legal')} onClick={() => setView('legal')}>{t('ui.法定股东结构','法定股东结构')}</button>
          <button style={tabBtn(view === 'beneficial')} onClick={() => setView('beneficial')}>{t('ui.实益出资结构','实益出资结构')}{bene.length > 0 ? `（${bene.length}）` : ''}</button>
        </div>
      </div>

      <div style={{
      background: 'var(--bg-muted)',
      border: '1px solid var(--border)',
      color: 'var(--text-secondary)',
      padding: '8px 14px',
      borderRadius: 8,
      marginBottom: 12,
      fontSize: 12.5
    }}>
        {t('ui.法定股东结构用于股权管理；实益出资结构用于内部投资分析；二者可能存在差异；实益结构不代表工商登记股权结构。','法定股东结构用于股权管理；实益出资结构用于内部投资分析；二者可能存在差异；实益结构不代表工商登记股权结构。')}
      </div>
      {isProvisional && view === 'legal' && <div style={{
      background: 'color-mix(in srgb, var(--status-warning) 14%, transparent)',
      border: '1px solid var(--status-warning)',
      color: 'var(--status-warning)',
      padding: '10px 14px',
      borderRadius: 8,
      marginBottom: 14,
      fontSize: 13.5
    }}>
          ⚠ <b>{t('ui.股权比例为暂定','股权比例为暂定')}</b>{t('ui.，仅供参考，最终股权比例以最终确认结果为准。「股权比例」与「实缴资本比例」为两套口径，请勿混淆。','，仅供参考，最终股权比例以最终确认结果为准。「股权比例」与「实缴资本比例」为两套口径，请勿混淆。')}
        </div>}
      {err && <div style={{
      color: 'var(--status-danger)',
      marginBottom: 12
    }}>{err}</div>}

      {view === 'legal' ? <SummaryBar items={[{
      label: t('ui.项目总实缴资本','项目总实缴资本'),
      value: yuan(curProject?.totalPaidInCapital ?? sum(rows, r => Number(r.paidInCapital || 0))),
      accent: true
    }, {
      label: t('ui.法定实缴合计','法定实缴合计'),
      value: yuan(sum(rows, r => Number(r.paidInCapital || 0)))
    }, {
      label: t('ui.股权比例合计','股权比例合计'),
      value: sum(rows, r => Number(r.equityRatio || 0)).toFixed(2) + '%'
    }, {
      label: t('ui.实缴占比合计','实缴占比合计'),
      value: sum(rows, r => Number(r.capitalRatio || 0)).toFixed(2) + '%'
    }, {
      label: t('ui.股东人数','股东人数'),
      value: String(rows.length)
    }]} /> : <SummaryBar items={[{
      label: t('ui.实益出资合计','实益出资合计'),
      value: yuan(sum(bene, b => Number(b.amount || 0))),
      accent: true
    }, {
      label: t('ui.代持记录数','代持记录数'),
      value: String(bene.length)
    }]} />}

      {view === 'legal' ? <table style={{
      width: '100%',
      borderCollapse: 'collapse',
      background: 'var(--bg-card)',
      borderRadius: 8,
      overflow: 'hidden'
    }}>
          <thead>
            <tr>
              <th style={th} rowSpan={2}>{t('ui.股东','股东')}</th>
              <th style={{
            ...th,
            background: 'var(--text-secondary)'
          }} colSpan={2}>{t('ui.法定股权结构','法定股权结构')}</th>
              <th style={{
            ...th,
            background: 'var(--color-primary)'
          }} colSpan={3}>{t('ui.法定实缴资本结构（实缴口径）','法定实缴资本结构（实缴口径）')}</th>
              <th style={th} rowSpan={2}>{t('ui.表决权','表决权')}</th>
            </tr>
            <tr>
              <th style={{
            ...th,
            background: 'var(--text-secondary)'
          }}>{t('ui.股权比例%','股权比例%')}</th>
              <th style={{
            ...th,
            background: 'var(--text-secondary)'
          }}>{t('ui.状态','状态')}</th>
              <th style={{
            ...th,
            background: 'var(--color-primary)'
          }}>{t('ui.法定实缴','法定实缴')}</th>
              <th style={{
            ...th,
            background: 'var(--color-primary)'
          }}>{t('ui.实缴占比%','实缴占比%')}</th>
              <th style={{
            ...th,
            background: 'var(--color-primary)'
          }}>{t('ui.来源','来源')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(e => <tr key={e.id}>
                <td style={td}>{shName(e.shareholderCode)}</td>
                <td style={{
            ...td,
            fontWeight: 600
          }}>{Number(e.equityRatio).toFixed(2)}</td>
                <td style={td}>
                  <span style={{
              padding: '2px 8px',
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 600,
              background: e.equityStatus === 'CONFIRMED' ? 'color-mix(in srgb, var(--status-success) 14%, transparent)' : 'color-mix(in srgb, var(--status-warning) 14%, transparent)',
              color: e.equityStatus === 'CONFIRMED' ? 'var(--status-success)' : 'var(--status-warning)'
            }}>
                    {EQ_LABEL[e.equityStatus] || e.equityStatus}
                  </span>
                </td>
                <td style={td}>{money(e.paidInCapital)}</td>
                <td style={{
            ...td,
            fontWeight: 600,
            color: 'var(--color-primary)'
          }}>{e.capitalRatio != null ? Number(e.capitalRatio).toFixed(2) : '—'}</td>
                <td style={{
            ...td,
            fontSize: 12,
            color: 'var(--text-secondary)'
          }}>{lbl(PAID_IN_SOURCE_LABEL, e.paidInSource)}</td>
                <td style={td}>{e.isVotingShareholder ? t('ui.是','是') : t('ui.否','否')}</td>
              </tr>)}
            {rows.length === 0 && <tr><td style={td} colSpan={7}>{t('ui.暂无股权数据','暂无股权数据')}</td></tr>}
          </tbody>
        </table> : <table style={{
      width: '100%',
      borderCollapse: 'collapse',
      background: 'var(--bg-card)',
      borderRadius: 8,
      overflow: 'hidden'
    }}>
          <thead><tr>
            <th style={th}>{t('ui.登记股东（名义）','登记股东（名义）')}</th><th style={th}>{t('ui.实际出资人（实益）','实际出资人（实益）')}</th>
            <th style={th}>{t('ui.出资金额','出资金额')}</th><th style={th}>{t('ui.占该名义持股%','占该名义持股%')}</th><th style={th}>{t('ui.备注','备注')}</th>
          </tr></thead>
          <tbody>
            {bene.map(b => <tr key={b.id}>
                <td style={td}>{shName(b.nomineeShareholderCode)}</td>
                <td style={{
            ...td,
            fontWeight: 600
          }}>{shName(b.beneficialShareholderCode)}</td>
                <td style={td}>{money(b.amount)}</td>
                <td style={{
            ...td,
            fontWeight: 600,
            color: 'var(--color-primary)'
          }}>{b.ownershipRatio != null ? Number(b.ownershipRatio).toFixed(2) : '—'}</td>
                <td style={{
            ...td,
            fontSize: 12,
            color: 'var(--text-secondary)'
          }}>{b.remark || '—'}</td>
              </tr>)}
            {bene.length === 0 && <tr><td style={td} colSpan={5}>{t('ui.该项目暂无实益出资（代持）记录','该项目暂无实益出资（代持）记录')}</td></tr>}
          </tbody>
        </table>}
      <p style={{
      color: 'var(--text-disabled)',
      fontSize: 12,
      marginTop: 12
    }}>
        {t('ui.注：「法定股权比例」为约定股比；「法定实缴」= 股东直接实缴 ÷ 项目总实缴资本；「实益出资」记录代持关系（名义股东 vs 实际出资人）。本阶段 不显示应缴/未缴/差额。','注：「法定股权比例」为约定股比；「法定实缴」= 股东直接实缴 ÷ 项目总实缴资本；「实益出资」记录代持关系（名义股东 vs 实际出资人）。本阶段 不显示应缴/未缴/差额。')}
      </p>
    </div>;
}