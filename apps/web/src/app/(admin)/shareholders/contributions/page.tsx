'use client';
import { useEffect, useState } from 'react';
import { shareholderApi, ShrContribution, ShrProject } from '@/lib/shareholder-api';

const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', background: '#1F4E79', color: '#fff', fontSize: 13, fontWeight: 600 };
const td: React.CSSProperties = { padding: '9px 12px', borderBottom: '1px solid #eee', fontSize: 13.5 };
const STATUS_LABEL: Record<string, string> = { DRAFT: '草稿', CONFIRMED: '已确认', CANCELLED: '已取消' };

export default function ContributionsPage() {
  const [projects, setProjects] = useState<ShrProject[]>([]);
  const [sel, setSel] = useState('');
  const [rows, setRows] = useState<ShrContribution[]>([]);
  const [err, setErr] = useState('');
  useEffect(() => { shareholderApi.listProjects().then(setProjects).catch(e => setErr(e?.message)); }, []);
  useEffect(() => { shareholderApi.listContributions(sel || undefined).then(setRows).catch(e => setErr(e?.message)); }, [sel]);
  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1F4E79', marginBottom: 12 }}>出资台账</h1>
      <div style={{ marginBottom: 14 }}>
        <label style={{ marginRight: 8, fontSize: 14 }}>项目：</label>
        <select value={sel} onChange={e => setSel(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ccc' }}>
          <option value="">全部</option>
          {projects.map(p => <option key={p.projectCode} value={p.projectCode}>{p.projectName}</option>)}
        </select>
      </div>
      {err && <div style={{ color: '#c0392b', marginBottom: 12 }}>{err}</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
        <thead><tr>
          <th style={th}>出资单号</th><th style={th}>项目</th><th style={th}>股东</th><th style={th}>金额</th>
          <th style={th}>币种</th><th style={th}>来源</th><th style={th}>日期</th><th style={th}>状态</th>
        </tr></thead>
        <tbody>
          {rows.map(c => (
            <tr key={c.id}>
              <td style={td}>{c.contributionNo}</td>
              <td style={td}>{c.projectCode}</td>
              <td style={td}>{c.shareholderCode}</td>
              <td style={{ ...td, fontWeight: 600 }}>{Number(c.amount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</td>
              <td style={td}>{c.currency}</td>
              <td style={td}>{c.sourceType}</td>
              <td style={td}>{c.contributionDate || '-'}</td>
              <td style={td}>{STATUS_LABEL[c.status] || c.status}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td style={td} colSpan={8}>暂无出资记录（本阶段先建台账，历史出资款后续导入）</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
