'use client';
import { useEffect, useState } from 'react';
import { shareholderApi, ShrProject, ORG_CODE_LABEL, lbl } from '@/lib/shareholder-api';

const CAP_LABEL: Record<string, string> = { PAID_IN_FULL: '已到位', PARTIALLY_PAID: '部分到位', PENDING_CONFIRMATION: '待确认' };
const EQ_LABEL: Record<string, string> = { CONFIRMED: '已确认股权', PROVISIONAL: '暂定股权' };

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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#1F4E79' }}>{p.projectName}</div>
                <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                  background: p.equityStatus === 'CONFIRMED' ? '#e8f5e9' : '#fff4e5',
                  color: p.equityStatus === 'CONFIRMED' ? '#2e7d32' : '#e65100' }}>
                  {EQ_LABEL[p.equityStatus] || p.equityStatus}
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#999', margin: '4px 0 10px' }}>{lbl(ORG_CODE_LABEL, p.companyCode)} / {lbl(ORG_CODE_LABEL, p.siteCode)}</div>
              <div style={{ background: '#f5f8fc', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
                <div style={{ color: '#999', fontSize: 12 }}>项目总实缴资本</div>
                <div style={{ fontSize: 19, fontWeight: 700, color: '#1F4E79' }}>
                  ¥{(p.paidInTotal ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                  {(p.contributionCount ?? 0) > 0
                    ? `逐笔台账 ${p.contributionCount} 笔 · 最近 ${p.lastContributionDate ? String(p.lastContributionDate).slice(0, 10) : '—'}`
                    : '来源：实收资本汇总表'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 18, fontSize: 13 }}>
                <div><div style={{ color: '#999' }}>股东数</div><div style={{ fontWeight: 600 }}>{p.holders ?? 0}</div></div>
                <div><div style={{ color: '#999' }}>股比合计</div><div style={{ fontWeight: 600 }}>{(p.ratioSum ?? 0).toFixed(2)}%</div></div>
              </div>
              <div style={{ fontSize: 11, color: '#bbb', marginTop: 10 }}>实缴口径 · 不显示应缴/未缴</div>
            </div>
          ))}
          {projects.length === 0 && scope !== 'NONE' && <div style={{ color: '#666' }}>暂无可见项目</div>}
        </div>
      )}
    </div>
  );
}
