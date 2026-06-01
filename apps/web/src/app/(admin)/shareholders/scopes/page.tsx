'use client';
import { useEffect, useState } from 'react';
import { shareholderApi, ShrScope } from '@/lib/shareholder-api';

const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', background: '#1F4E79', color: '#fff', fontSize: 13, fontWeight: 600 };
const td: React.CSSProperties = { padding: '9px 12px', borderBottom: '1px solid #eee', fontSize: 13.5 };

export default function ScopesPage() {
  const [rows, setRows] = useState<ShrScope[]>([]);
  const [err, setErr] = useState('');
  useEffect(() => { shareholderApi.listScopes().then(setRows).catch(e => setErr(e?.message)); }, []);
  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1F4E79', marginBottom: 6 }}>股东查看范围</h1>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 16 }}>股东查看权限按项目/公司/场区授权，不依赖单一角色。无 scope 的用户在驾驶舱看不到任何项目。</p>
      {err && <div style={{ color: '#c0392b', marginBottom: 12 }}>{err}</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
        <thead><tr>
          <th style={th}>用户ID</th><th style={th}>股东编码</th><th style={th}>范围类型</th>
          <th style={th}>范围编码</th><th style={th}>项目</th><th style={th}>可审批</th><th style={th}>状态</th>
        </tr></thead>
        <tbody>
          {rows.map(s => (
            <tr key={s.id}>
              <td style={td}>{s.userId}</td>
              <td style={td}>{s.shareholderCode || '-'}</td>
              <td style={td}>{s.scopeType}</td>
              <td style={td}>{s.scopeCode || '-'}</td>
              <td style={td}>{s.projectCode || '-'}</td>
              <td style={td}>{s.canApprove ? '是' : '否'}</td>
              <td style={td}>{s.status}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td style={td} colSpan={7}>暂无范围绑定</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
