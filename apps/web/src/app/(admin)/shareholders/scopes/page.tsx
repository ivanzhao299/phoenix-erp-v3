'use client';
import { useEffect, useState } from 'react';
import { shareholderApi, ShrScope, SCOPE_TYPE_LABEL, ORG_CODE_LABEL, lbl } from '@/lib/shareholder-api';
import { SummaryBar, sum, yuan } from '../SummaryBar';

const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', background: 'var(--color-primary)', color: 'var(--text-on-dark)', fontSize: 13, fontWeight: 600 };
const td: React.CSSProperties = { padding: '9px 12px', borderBottom: '1px solid var(--border)', fontSize: 13.5 };

export default function ScopesPage() {
  const [rows, setRows] = useState<ShrScope[]>([]);
  const [names, setNames] = useState<Record<string,string>>({});
  const [pmap, setPmap] = useState<Record<string,string>>({});
  const [err, setErr] = useState('');
  useEffect(() => { shareholderApi.listScopes().then(setRows).catch(e => setErr(e?.message)); shareholderApi.listShareholders().then(s=>setNames(Object.fromEntries(s.map(x=>[x.shareholderCode,x.shareholderName])))).catch(()=>{}); shareholderApi.listProjects().then(p=>setPmap(Object.fromEntries(p.map(x=>[x.projectCode,x.projectName])))).catch(()=>{}); }, []);
  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-primary)', marginBottom: 6 }}>股东查看范围</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>股东查看权限按项目/公司/场区授权，不依赖单一角色。无 scope 的用户在驾驶舱看不到任何项目。</p>
      {err && <div style={{ color: 'var(--status-danger)', marginBottom: 12 }}>{err}</div>}
      <SummaryBar items={[
        { label: '查看范围绑定数', value: String(rows.length), accent: true },
        { label: '可审批', value: String(rows.filter(r=>r.canApprove).length) },
      ]} />
      <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg-card)', borderRadius: 8, overflow: 'hidden' }}>
        <thead><tr>
          <th style={th}>用户ID</th><th style={th}>股东</th><th style={th}>范围类型</th>
          <th style={th}>范围对象</th><th style={th}>项目</th><th style={th}>可审批</th><th style={th}>状态</th>
        </tr></thead>
        <tbody>
          {rows.map(s => (
            <tr key={s.id}>
              <td style={td}>{s.userId}</td>
              <td style={td}>{s.shareholderCode ? (names[s.shareholderCode]||s.shareholderCode) : '—'}</td>
              <td style={td}>{lbl(SCOPE_TYPE_LABEL, s.scopeType)}</td>
              <td style={td}>{s.scopeCode ? (ORG_CODE_LABEL[s.scopeCode]||s.scopeCode) : '—'}</td>
              <td style={td}>{s.projectCode ? (pmap[s.projectCode]||s.projectCode) : '—'}</td>
              <td style={td}>{s.canApprove ? '是' : '否'}</td>
              <td style={td}>{s.status === 'ACTIVE' ? '启用' : s.status}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td style={td} colSpan={7}>暂无范围绑定</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
