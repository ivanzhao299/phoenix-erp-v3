'use client';
import { useEffect, useState } from 'react';
import { shareholderApi, ShrEquity, ShrProject } from '@/lib/shareholder-api';

const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', background: '#1F4E79', color: '#fff', fontSize: 13, fontWeight: 600 };
const td: React.CSSProperties = { padding: '9px 12px', borderBottom: '1px solid #eee', fontSize: 13.5 };
const money = (v?: string) => v == null ? '-' : Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2 });

export default function EquityPage() {
  const [projects, setProjects] = useState<ShrProject[]>([]);
  const [sel, setSel] = useState('');
  const [rows, setRows] = useState<ShrEquity[]>([]);
  const [err, setErr] = useState('');
  useEffect(() => { shareholderApi.listProjects().then(p => { setProjects(p); if (p[0]) setSel(p[0].projectCode); }).catch(e => setErr(e?.message)); }, []);
  useEffect(() => { if (sel) shareholderApi.listEquity(sel).then(setRows).catch(e => setErr(e?.message)); }, [sel]);
  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1F4E79', marginBottom: 12 }}>股权结构</h1>
      <div style={{ marginBottom: 14 }}>
        <label style={{ marginRight: 8, fontSize: 14 }}>项目：</label>
        <select value={sel} onChange={e => setSel(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ccc' }}>
          {projects.map(p => <option key={p.projectCode} value={p.projectCode}>{p.projectName}（{p.projectCode}）</option>)}
        </select>
      </div>
      {err && <div style={{ color: '#c0392b', marginBottom: 12 }}>{err}</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
        <thead><tr>
          <th style={th}>股东编码</th><th style={th}>股比 %</th><th style={th}>应缴</th>
          <th style={th}>实缴</th><th style={th}>未缴</th><th style={th}>出资状态</th><th style={th}>表决权</th>
        </tr></thead>
        <tbody>
          {rows.map(e => (
            <tr key={e.id}>
              <td style={td}>{e.shareholderCode}</td>
              <td style={{ ...td, fontWeight: 600 }}>{Number(e.equityRatio).toFixed(2)}</td>
              <td style={td}>{money(e.subscribedCapital)}</td>
              <td style={td}>{money(e.paidInCapital)}</td>
              <td style={{ ...td, color: Number(e.unpaidCapital || 0) > 0 ? '#c0392b' : '#27ae60' }}>{money(e.unpaidCapital)}</td>
              <td style={td}>{e.capitalStatus}</td>
              <td style={td}>{e.isVotingShareholder ? '是' : '否'}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td style={td} colSpan={7}>暂无股权数据</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
