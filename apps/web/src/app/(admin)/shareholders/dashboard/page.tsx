'use client';
import { useEffect, useState } from 'react';
import { shareholderApi, ShrProject } from '@/lib/shareholder-api';

const CAP_LABEL: Record<string, string> = { PAID_IN_FULL: '已到位', PARTIALLY_PAID: '部分到位', PENDING_CONFIRMATION: '待确认' };

export default function ShareholderDashboard() {
  const [projects, setProjects] = useState<ShrProject[]>([]);
  const [scope, setScope] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    shareholderApi.dashboard()
      .then(d => { setProjects(d.projects || []); setScope(d.scope); setNote(d.note || ''); })
      .catch(e => setErr(e?.message || '加载失败')).finally(() => setLoading(false));
  }, []);
  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1F4E79', marginBottom: 4 }}>股东驾驶舱</h1>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 18 }}>
        可见范围：<b>{scope === 'ALL' ? '全部项目' : scope === 'SCOPED' ? '按授权范围' : scope === 'NONE' ? '无授权' : scope}</b>
        {note && <span style={{ color: '#c0392b', marginLeft: 12 }}>{note}</span>}
      </p>
      {err && <div style={{ color: '#c0392b', marginBottom: 12 }}>{err}</div>}
      {loading ? <div>加载中…</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }}>
          {projects.map(p => (
            <div key={p.projectCode} style={{ background: '#fff', borderRadius: 10, borderLeft: '4px solid #1F4E79', boxShadow: '0 1px 3px rgba(0,0,0,.08)', padding: 18 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#1F4E79' }}>{p.projectName}</div>
              <div style={{ fontSize: 12, color: '#999', margin: '4px 0 12px' }}>{p.companyCode} / {p.siteCode}</div>
              <div style={{ display: 'flex', gap: 18, fontSize: 13 }}>
                <div><div style={{ color: '#999' }}>出资状态</div><div style={{ fontWeight: 600 }}>{CAP_LABEL[p.capitalStatus] || p.capitalStatus}</div></div>
                <div><div style={{ color: '#999' }}>股东数</div><div style={{ fontWeight: 600 }}>{p.holders ?? 0}</div></div>
                <div><div style={{ color: '#999' }}>股比合计</div><div style={{ fontWeight: 600 }}>{(p.ratioSum ?? 0).toFixed(2)}%</div></div>
              </div>
            </div>
          ))}
          {projects.length === 0 && scope !== 'NONE' && <div style={{ color: '#666' }}>暂无可见项目</div>}
        </div>
      )}
    </div>
  );
}
