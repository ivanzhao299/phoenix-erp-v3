'use client';
import { useEffect, useState } from 'react';
import { shareholderApi, ShrEquity, ShrProject } from '@/lib/shareholder-api';

const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', background: '#1F4E79', color: '#fff', fontSize: 13, fontWeight: 600 };
const td: React.CSSProperties = { padding: '9px 12px', borderBottom: '1px solid #eee', fontSize: 13.5 };
const EQ_LABEL: Record<string, string> = { CONFIRMED: '已确认股权', PROVISIONAL: '暂定股权' };
const SRC_LABEL: Record<string, string> = { LEDGER: '逐笔台账', CAPITAL_SUMMARY_IMPORT: '资本汇总表' };
const money = (v?: string | null) => v == null ? '—' : Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2 });

export default function EquityPage() {
  const [projects, setProjects] = useState<ShrProject[]>([]);
  const [sel, setSel] = useState('');
  const [rows, setRows] = useState<ShrEquity[]>([]);
  const [err, setErr] = useState('');
  useEffect(() => { shareholderApi.listProjects().then(p => { setProjects(p); if (p[0]) setSel(p[0].projectCode); }).catch(e => setErr(e?.message)); }, []);
  useEffect(() => { if (sel) shareholderApi.listEquity(sel).then(setRows).catch(e => setErr(e?.message)); }, [sel]);
  const curProject = projects.find(p => p.projectCode === sel);
  const isProvisional = (rows[0]?.equityStatus || curProject?.equityStatus) === 'PROVISIONAL';

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1F4E79', marginBottom: 12 }}>股权结构 / 实缴资本结构</h1>
      <div style={{ marginBottom: 14 }}>
        <label style={{ marginRight: 8, fontSize: 14 }}>项目：</label>
        <select value={sel} onChange={e => setSel(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ccc' }}>
          {projects.map(p => <option key={p.projectCode} value={p.projectCode}>{p.projectName}（{EQ_LABEL[p.equityStatus] || p.equityStatus}）</option>)}
        </select>
      </div>
      {isProvisional && (
        <div style={{ background: '#fff4e5', border: '1px solid #ffcc80', color: '#e65100', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13.5 }}>
          ⚠ <b>股权比例为暂定</b>，仅供参考，最终股权比例以最终确认结果为准。下表「股权比例」与「实缴资本比例」为两套口径，请勿混淆。
        </div>
      )}
      {err && <div style={{ color: '#c0392b', marginBottom: 12 }}>{err}</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
        <thead>
          <tr>
            <th style={th} rowSpan={2}>股东</th>
            <th style={{ ...th, background: '#5b6b7a' }} colSpan={2}>股权结构（暂定）</th>
            <th style={{ ...th, background: '#1F4E79' }} colSpan={3}>实缴资本结构（PAID-IN）</th>
            <th style={th} rowSpan={2}>表决权</th>
          </tr>
          <tr>
            <th style={{ ...th, background: '#5b6b7a' }}>股权比例%</th>
            <th style={{ ...th, background: '#5b6b7a' }}>状态</th>
            <th style={{ ...th, background: '#1F4E79' }}>实缴金额</th>
            <th style={{ ...th, background: '#1F4E79' }}>实缴占比%</th>
            <th style={{ ...th, background: '#1F4E79' }}>来源</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(e => (
            <tr key={e.id}>
              <td style={td}>{e.shareholderCode}</td>
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
              <td style={{ ...td, fontSize: 12, color: '#777' }}>{e.paidInSource ? (SRC_LABEL[e.paidInSource] || e.paidInSource) : '—'}</td>
              <td style={td}>{e.isVotingShareholder ? '是' : '否'}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td style={td} colSpan={7}>暂无股权数据</td></tr>}
        </tbody>
      </table>
      <p style={{ color: '#999', fontSize: 12, marginTop: 12 }}>
        注：「股权比例」为约定股比（暂定/已确认）；「实缴资本比例」= 股东实缴 ÷ 项目总实缴资本（真实实缴口径，自动计算）。Phase 2A/2B 不显示应缴/未缴/差额。
      </p>
    </div>
  );
}
