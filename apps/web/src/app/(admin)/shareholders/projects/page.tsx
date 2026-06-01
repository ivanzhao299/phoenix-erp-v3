'use client';
import { useEffect, useState } from 'react';
import { shareholderApi, ShrProject, PROJECT_TYPE_LABEL, ORG_CODE_LABEL, lbl } from '@/lib/shareholder-api';

const CAP_LABEL: Record<string, string> = {
  PAID_IN_FULL: '已到位', PARTIALLY_PAID: '部分到位', PENDING_CONFIRMATION: '待确认',
};
const EQ_LABEL: Record<string, string> = { CONFIRMED: '已确认股权', PROVISIONAL: '暂定股权' };
const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', background: '#1F4E79', color: '#fff', fontSize: 13, fontWeight: 600 };
const td: React.CSSProperties = { padding: '9px 12px', borderBottom: '1px solid #eee', fontSize: 13.5 };

export default function ProjectsPage() {
  const [rows, setRows] = useState<ShrProject[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    shareholderApi.listProjects()
      .then(setRows).catch(e => setErr(e?.message || '加载失败')).finally(() => setLoading(false));
  }, []);
  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1F4E79', marginBottom: 16 }}>股东项目</h1>
      {err && <div style={{ color: '#c0392b', marginBottom: 12 }}>{err}</div>}
      {loading ? <div>加载中…</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
          <thead><tr>
            <th style={th}>项目名称</th><th style={th}>所属公司</th>
            <th style={th}>场区</th><th style={th}>类型</th><th style={th}>股权状态</th>
            <th style={th}>股东数</th><th style={th}>股比合计</th>
          </tr></thead>
          <tbody>
            {rows.map(p => (
              <tr key={p.projectCode}>
                <td style={{ ...td, fontWeight: 600 }}>{p.projectName}</td>
                <td style={td}>{lbl(ORG_CODE_LABEL, p.companyCode) }</td>
                <td style={td}>{lbl(ORG_CODE_LABEL, p.siteCode)}</td>
                <td style={td}>{lbl(PROJECT_TYPE_LABEL, p.projectType)}</td>
                <td style={td}>
                  <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                    background: p.equityStatus === 'CONFIRMED' ? '#e8f5e9' : '#fff4e5',
                    color: p.equityStatus === 'CONFIRMED' ? '#2e7d32' : '#e65100' }}>
                    {EQ_LABEL[p.equityStatus] || p.equityStatus}
                  </span>
                </td>
                <td style={td}>{p.holders ?? 0}</td>
                <td style={{ ...td, color: Math.abs((p.ratioSum ?? 0) - 100) <= 0.01 ? '#27ae60' : '#c0392b', fontWeight: 600 }}>
                  {(p.ratioSum ?? 0).toFixed(2)}%
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td style={td} colSpan={7}>暂无项目</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}
