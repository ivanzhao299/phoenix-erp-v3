'use client';
import { useEffect, useState } from 'react';
import { shareholderApi, ShrProject, CapitalStats, FinanceBridge, ORG_CODE_LABEL, SOURCE_TYPE_LABEL, lbl } from '@/lib/shareholder-api';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

const EQ_LABEL: Record<string, string> = { CONFIRMED: '已确认股权', PROVISIONAL: '暂定股权' };
const money = (v: number) => v.toLocaleString('zh-CN', { minimumFractionDigits: 2 });

export default function ShareholderDashboard() {
  const [projects, setProjects] = useState<ShrProject[]>([]);
  const [scope, setScope] = useState('');
  const [note, setNote] = useState('');
  const [stats, setStats] = useState<CapitalStats | null>(null);
  const [bridge, setBridge] = useState<FinanceBridge | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [pmap, setPmap] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    shareholderApi.dashboard()
      .then(d => { setProjects(d.projects || []); setScope(d.scope); setNote(d.note || ''); })
      .catch(e => setErr(e?.message || '加载失败')).finally(() => setLoading(false));
    shareholderApi.capitalStats().then(setStats).catch(() => {});
    shareholderApi.financeBridge().then(setBridge).catch(() => {});
    shareholderApi.listShareholders().then(s => setNames(Object.fromEntries(s.map(x => [x.shareholderCode, x.shareholderName])))).catch(() => {});
    shareholderApi.listProjects().then(p => setPmap(Object.fromEntries(p.map(x => [x.projectCode, x.projectName])))).catch(() => {});
  }, []);
  const trendData = (stats?.monthlyTrend || []).map(t => ({ ym: t.ym.slice(2), total: t.total, count: t.count }));
  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1F4E79', marginBottom: 4 }}>股东驾驶舱</h1>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 18 }}>
        可见范围：<b>{scope === 'ALL' ? '全部项目' : scope === 'SCOPED' ? '按授权范围' : scope === 'NONE' ? '无授权' : scope}</b>
        {note && <span style={{ color: '#c0392b', marginLeft: 12 }}>{note}</span>}
      </p>
      {err && <div style={{ color: '#c0392b', marginBottom: 12 }}>{err}</div>}

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 16, marginBottom: 20 }}>
          <div style={{ background: '#1F4E79', color: '#fff', borderRadius: 10, padding: 18 }}>
            <div style={{ fontSize: 12, opacity: .85 }}>本月新增出资（已确认）</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>¥{money(stats.monthAdded.total)}</div>
            <div style={{ fontSize: 11, opacity: .8, marginTop: 2 }}>{stats.monthAdded.count} 笔</div>
          </div>
          <div style={{ background: '#fff', borderRadius: 10, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1F4E79', marginBottom: 8 }}>股东投入排名</div>
            {stats.shareholderRanking.slice(0, 5).map((r, i) => (
              <div key={r.shareholderCode} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '3px 0' }}>
                <span>{i + 1}. {names[r.shareholderCode] || r.shareholderCode}</span><span style={{ fontWeight: 600 }}>¥{money(r.total)}</span>
              </div>
            ))}
            {stats.shareholderRanking.length === 0 && <div style={{ color: '#999', fontSize: 12 }}>暂无数据</div>}
          </div>
          <div style={{ background: '#fff', borderRadius: 10, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1F4E79', marginBottom: 8 }}>项目投入排名</div>
            {stats.projectRanking.slice(0, 5).map((r, i) => (
              <div key={r.projectCode} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '3px 0' }}>
                <span>{i + 1}. {pmap[r.projectCode] || r.projectCode}</span><span style={{ fontWeight: 600 }}>¥{money(r.total)}</span>
              </div>
            ))}
            {stats.projectRanking.length === 0 && <div style={{ color: '#999', fontSize: 12 }}>暂无数据</div>}
          </div>
        </div>
      )}

      {/* 资本流趋势（最近12个月）+ 最近资本流 */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16, marginBottom: 20 }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1F4E79', marginBottom: 10 }}>资本流趋势（最近 12 个月 · 已确认）</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trendData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
                <XAxis dataKey="ym" tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 10000 ? `${(v / 10000).toFixed(0)}万` : String(v)} />
                <Tooltip formatter={(v: any) => [`¥${money(Number(v))}`, '出资额']} labelFormatter={(l) => `20${l}`} />
                <Bar dataKey="total" fill="#1F4E79" radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ background: '#fff', borderRadius: 10, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1F4E79', marginBottom: 8 }}>最近资本流</div>
            {(stats.recent || []).slice(0, 8).map((r) => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, padding: '5px 0', borderBottom: '1px solid #f4f4f4' }}>
                <div>
                  <div>{names[r.shareholderCode] || r.shareholderCode}</div>
                  <div style={{ color: '#999', fontSize: 11 }}>{pmap[r.projectCode] || r.projectCode} · {lbl(SOURCE_TYPE_LABEL, r.sourceType)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 600, color: '#27ae60' }}>¥{money(Number(r.amount))}</div>
                  <div style={{ color: '#999', fontSize: 11 }}>{r.contributionDate || (r.confirmedAt ? String(r.confirmedAt).slice(0, 10) : '')}</div>
                </div>
              </div>
            ))}
            {(!stats.recent || stats.recent.length === 0) && <div style={{ color: '#999', fontSize: 12 }}>暂无资本流</div>}
          </div>
        </div>
      )}

      {/* Finance Bridge 只读对账卡 */}
      {bridge && (
        <div style={{ background: '#fff', borderRadius: 10, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,.08)', marginBottom: 20, borderLeft: '4px solid #8e44ad' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#8e44ad' }}>Finance Bridge · 只读对账</div>
            <span style={{ marginLeft: 10, fontSize: 11, color: '#888', padding: '2px 8px', background: '#f3eefb', borderRadius: 10 }}>只读 · 不自动改账</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14 }}>
            <BridgeCell label="Shareholder Runtime 累计实缴" value={`¥${money(bridge.reconciliation.shrTotal)}`} sub={`${bridge.shrCapitalContributions.count} 笔`} />
            <BridgeCell label="Finance V2 股东资金" value={bridge.reconciliation.finParsed ? `¥${money(bridge.reconciliation.finTotal)}` : '无数据'} sub={`${bridge.finShareholderContributions.count} 笔`} />
            <BridgeCell label="差异金额" value={`¥${money(bridge.reconciliation.diff)}`} sub={bridge.reconciliation.diff === 0 ? '一致' : '存在差异'} color={bridge.reconciliation.diff === 0 ? '#27ae60' : '#c0392b'} />
            <BridgeCell label="桥接状态" value="READ_ONLY" sub="不生成凭证/不回写" />
          </div>
          <div style={{ fontSize: 11, color: '#999', marginTop: 10 }}>{bridge.note}</div>
        </div>
      )}

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

function BridgeCell({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: '#888' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color || '#1F4E79', marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#999', marginTop: 1 }}>{sub}</div>}
    </div>
  );
}
