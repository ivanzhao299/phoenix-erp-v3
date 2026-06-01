'use client';
import { useEffect, useState } from 'react';
import { shareholderApi, ShrEquity, ShrProject } from '@/lib/shareholder-api';

const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', background: '#1F4E79', color: '#fff', fontSize: 13, fontWeight: 600 };
const td: React.CSSProperties = { padding: '9px 12px', borderBottom: '1px solid #eee', fontSize: 13.5 };
const EQ_LABEL: Record<string, string> = { CONFIRMED: '已确认股权', PROVISIONAL: '暂定股权' };

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
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1F4E79', marginBottom: 12 }}>股权结构</h1>
      <div style={{ marginBottom: 14 }}>
        <label style={{ marginRight: 8, fontSize: 14 }}>项目：</label>
        <select value={sel} onChange={e => setSel(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ccc' }}>
          {projects.map(p => <option key={p.projectCode} value={p.projectCode}>{p.projectName}（{EQ_LABEL[p.equityStatus] || p.equityStatus}）</option>)}
        </select>
      </div>
      {isProvisional && (
        <div style={{ background: '#fff4e5', border: '1px solid #ffcc80', color: '#e65100', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13.5 }}>
          ⚠ 当前股权比例为<b>暂定</b>，仅供参考，最终股权以最终确认结果为准。本阶段仅反映真实实缴出资，不计算应缴/未缴。
        </div>
      )}
      {err && <div style={{ color: '#c0392b', marginBottom: 12 }}>{err}</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
        <thead><tr>
          <th style={th}>股东编码</th><th style={th}>股比 %</th><th style={th}>股权状态</th><th style={th}>表决权</th>
        </tr></thead>
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
              <td style={td}>{e.isVotingShareholder ? '是' : '否'}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td style={td} colSpan={4}>暂无股权数据</td></tr>}
        </tbody>
      </table>
      <p style={{ color: '#999', fontSize: 12, marginTop: 12 }}>注：Phase 2A 采用实缴口径，不显示应缴/未缴/差额；累计实缴见股东驾驶舱。</p>
    </div>
  );
}
