'use client';
import { useEffect, useState } from 'react';
import { shareholderApi, ShrEquity, ShrProject, ShrBeneficial, EQUITY_STATUS_LABEL, PAID_IN_SOURCE_LABEL, lbl } from '@/lib/shareholder-api';

const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', background: '#1F4E79', color: '#fff', fontSize: 13, fontWeight: 600 };
const td: React.CSSProperties = { padding: '9px 12px', borderBottom: '1px solid #eee', fontSize: 13.5 };
const EQ_LABEL = EQUITY_STATUS_LABEL;
const money = (v?: string | null) => v == null ? '—' : Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2 });

export default function EquityPage() {
  const [projects, setProjects] = useState<ShrProject[]>([]);
  const [sel, setSel] = useState('');
  const [view, setView] = useState<'legal' | 'beneficial'>('legal');
  const [rows, setRows] = useState<ShrEquity[]>([]);
  const [bene, setBene] = useState<ShrBeneficial[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');
  const shName = (code: string) => names[code] || code;
  useEffect(() => {
    shareholderApi.listProjects().then(p => { setProjects(p); if (p[0]) setSel(p[0].projectCode); }).catch(e => setErr(e?.message));
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
    padding: '7px 16px', borderRadius: 8, border: '1px solid ' + (active ? '#1F4E79' : '#ccc'),
    background: active ? '#1F4E79' : '#fff', color: active ? '#fff' : '#555', fontWeight: 600, fontSize: 13.5, cursor: 'pointer',
  });

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1F4E79', marginBottom: 12 }}>股权结构 / 实益出资结构</h1>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <label style={{ fontSize: 14 }}>项目：</label>
        <select value={sel} onChange={e => setSel(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ccc' }}>
          {projects.map(p => <option key={p.projectCode} value={p.projectCode}>{p.projectName}（{EQ_LABEL[p.equityStatus] || p.equityStatus}）</option>)}
        </select>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button style={tabBtn(view === 'legal')} onClick={() => setView('legal')}>法定股东结构</button>
          <button style={tabBtn(view === 'beneficial')} onClick={() => setView('beneficial')}>实益出资结构{bene.length > 0 ? `（${bene.length}）` : ''}</button>
        </div>
      </div>

      <div style={{ background: '#eef3f9', border: '1px solid #cfe0f0', color: '#345', padding: '8px 14px', borderRadius: 8, marginBottom: 12, fontSize: 12.5 }}>
        法定股东结构用于股权管理；实益出资结构用于内部投资分析；二者可能存在差异；实益结构不代表工商登记股权结构。
      </div>
      {isProvisional && view === 'legal' && (
        <div style={{ background: '#fff4e5', border: '1px solid #ffcc80', color: '#e65100', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13.5 }}>
          ⚠ <b>股权比例为暂定</b>，仅供参考，最终股权比例以最终确认结果为准。「股权比例」与「实缴资本比例」为两套口径，请勿混淆。
        </div>
      )}
      {err && <div style={{ color: '#c0392b', marginBottom: 12 }}>{err}</div>}

      {view === 'legal' ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
          <thead>
            <tr>
              <th style={th} rowSpan={2}>股东</th>
              <th style={{ ...th, background: '#5b6b7a' }} colSpan={2}>法定股权结构</th>
              <th style={{ ...th, background: '#1F4E79' }} colSpan={3}>法定实缴资本结构（实缴口径）</th>
              <th style={th} rowSpan={2}>表决权</th>
            </tr>
            <tr>
              <th style={{ ...th, background: '#5b6b7a' }}>股权比例%</th>
              <th style={{ ...th, background: '#5b6b7a' }}>状态</th>
              <th style={{ ...th, background: '#1F4E79' }}>法定实缴</th>
              <th style={{ ...th, background: '#1F4E79' }}>实缴占比%</th>
              <th style={{ ...th, background: '#1F4E79' }}>来源</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(e => (
              <tr key={e.id}>
                <td style={td}>{shName(e.shareholderCode)}</td>
                <td style={{ ...td, fontWeight: 600 }}>{Number(e.equityRatio).toFixed(2)}</td>
                <td style={td}>
                  <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                    background: e.equityStatus === 'CONFIRMED' ? '#e8f5e9' : '#fff4e5',
                    color: e.equityStatus === 'CONFIRMED' ? '#2e7d32' : '#e65100' }}>
                    {EQ_LABEL[e.equityStatus] || e.equityStatus}
                  </span>
                </td>
                <td style={td}>{money(e.paidInCapital)}</td>
                <td style={{ ...td, fontWeight: 600, color: '#1F4E79' }}>{e.capitalRatio != null ? Number(e.capitalRatio).toFixed(2) : '—'}</td>
                <td style={{ ...td, fontSize: 12, color: '#777' }}>{lbl(PAID_IN_SOURCE_LABEL, e.paidInSource)}</td>
                <td style={td}>{e.isVotingShareholder ? '是' : '否'}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td style={td} colSpan={7}>暂无股权数据</td></tr>}
          </tbody>
        </table>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
          <thead><tr>
            <th style={th}>登记股东（名义）</th><th style={th}>实际出资人（实益）</th>
            <th style={th}>出资金额</th><th style={th}>占该名义持股%</th><th style={th}>备注</th>
          </tr></thead>
          <tbody>
            {bene.map(b => (
              <tr key={b.id}>
                <td style={td}>{shName(b.nomineeShareholderCode)}</td>
                <td style={{ ...td, fontWeight: 600 }}>{shName(b.beneficialShareholderCode)}</td>
                <td style={td}>{money(b.amount)}</td>
                <td style={{ ...td, fontWeight: 600, color: '#1F4E79' }}>{b.ownershipRatio != null ? Number(b.ownershipRatio).toFixed(2) : '—'}</td>
                <td style={{ ...td, fontSize: 12, color: '#777' }}>{b.remark || '—'}</td>
              </tr>
            ))}
            {bene.length === 0 && <tr><td style={td} colSpan={5}>该项目暂无实益出资（代持）记录</td></tr>}
          </tbody>
        </table>
      )}
      <p style={{ color: '#999', fontSize: 12, marginTop: 12 }}>
        注：「法定股权比例」为约定股比；「法定实缴」= 股东直接实缴 ÷ 项目总实缴资本；「实益出资」记录代持关系（名义股东 vs 实际出资人）。本阶段 不显示应缴/未缴/差额。
      </p>
    </div>
  );
}
