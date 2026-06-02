'use client';
import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  shareholderApi, ShrContribution, ShrProject, ShrShareholder, ShrEquity, ShrBeneficial, CapitalStats,
  SOURCE_TYPE_LABEL, SOURCE_TYPE_OPTIONS, CONTRIB_STATUS_LABEL, lbl,
} from '@/lib/shareholder-api';
import { SummaryBar, sum, yuan } from '../SummaryBar';
import { KpiCard } from '@/components/ui/KpiCard';
import { KPI_GRID } from '@/lib/design-tokens';
import { FileUploadInput } from '@/components/ui/FileUploadInput';
import { Wallet, TrendingUp, Clock, CheckCircle2, CalendarPlus, CalendarClock } from 'lucide-react';

const th: React.CSSProperties = { textAlign: 'left', padding: '9px 10px', background: '#1F4E79', color: '#fff', fontSize: 12.5, fontWeight: 600 };
const td: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #eee', fontSize: 13 };
const inp: React.CSSProperties = { padding: '7px 10px', borderRadius: 6, border: '1px solid #ccc', fontSize: 13.5, width: '100%' };
const STATUS_COLOR: Record<string, string> = { DRAFT: '#999', SUBMITTED: '#e67e22', APPROVED: '#2980b9', CONFIRMED: '#27ae60', CANCELLED: '#aaa', REVERSED: '#c0392b' };
const money = (v?: string | number | null) => v == null ? '—' : Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2 });

export default function CapitalFlowPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ShrProject[]>([]);
  const [holders, setHolders] = useState<ShrShareholder[]>([]);
  const [rows, setRows] = useState<ShrContribution[]>([]);
  const [stats, setStats] = useState<CapitalStats | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [pmap, setPmap] = useState<Record<string, string>>({});
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState<any>({ projectCode: '', shareholderCode: '', amount: '', sourceType: 'BANK_TRANSFER', contributionDate: '', remark: '', attachmentUrls: [] as string[] });
  const [equity, setEquity] = useState<ShrEquity[]>([]);
  const [bene, setBene] = useState<ShrBeneficial[]>([]);
  const [projContribs, setProjContribs] = useState<ShrContribution[]>([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const reload = () => shareholderApi.listFlows().then(setRows).catch(e => setErr(e?.message));
  useEffect(() => {
    shareholderApi.listProjects().then(p => { setProjects(p); setPmap(Object.fromEntries(p.map(x => [x.projectCode, x.projectName]))); });
    shareholderApi.listShareholders().then(s => { setHolders(s); setNames(Object.fromEntries(s.map(x => [x.shareholderCode, x.shareholderName]))); });
    shareholderApi.capitalStats().then(setStats).catch(() => {});
    reload();
  }, []);

  // 选择项目后加载该项目股权/实益/出资，用于股东信息联动卡
  useEffect(() => {
    if (!form.projectCode) { setEquity([]); setBene([]); setProjContribs([]); return; }
    shareholderApi.listEquity(form.projectCode).then(setEquity).catch(() => setEquity([]));
    shareholderApi.listBeneficial(form.projectCode).then(setBene).catch(() => setBene([]));
    shareholderApi.listContributions(form.projectCode).then(setProjContribs).catch(() => setProjContribs([]));
  }, [form.projectCode]);

  // 当前选中股东的联动信息
  const linkInfo = useMemo(() => {
    if (!form.projectCode || !form.shareholderCode) return null;
    const eq = equity.find(e => e.shareholderCode === form.shareholderCode);
    const beneAmt = sum(bene.filter(b => b.beneficialShareholderCode === form.shareholderCode), b => Number(b.amount || 0));
    const myContribs = projContribs.filter(c => c.shareholderCode === form.shareholderCode && c.status === 'CONFIRMED');
    const last = myContribs.slice().sort((a, b) => (b.contributionDate || '').localeCompare(a.contributionDate || ''))[0];
    return {
      name: names[form.shareholderCode] || form.shareholderCode,
      projectName: pmap[form.projectCode] || form.projectCode,
      equityRatio: eq ? Number(eq.equityRatio) : null,
      equityStatus: eq?.equityStatus,
      paidIn: eq?.paidInCapital != null ? Number(eq.paidInCapital) : null,
      capitalRatio: eq?.capitalRatio != null ? Number(eq.capitalRatio) : null,
      beneAmt,
      lastDate: last?.contributionDate || null,
      lastAmount: last ? Number(last.amount) : null,
    };
  }, [form.projectCode, form.shareholderCode, equity, bene, projContribs, names, pmap]);

  const act = async (fn: () => Promise<any>, ok: string) => {
    setErr(''); setMsg('');
    try { await fn(); setMsg(ok); reload(); } catch (e: any) { setErr(e?.message || '操作失败'); }
  };
  const create = () => act(async () => {
    if (!form.projectCode || !form.shareholderCode || !form.amount) throw new Error('请填写项目、股东、金额');
    await shareholderApi.createFlow({ ...form, amount: Number(form.amount), attachmentUrls: form.attachmentUrls });
    setShowNew(false);
    setForm({ projectCode: '', shareholderCode: '', amount: '', sourceType: 'BANK_TRANSFER', contributionDate: '', remark: '', attachmentUrls: [] });
  }, '资本流草稿已创建');

  // KPI 计算
  const kpis = useMemo(() => {
    const totalProjectPaidIn = sum(projects, p => Number(p.totalPaidInCapital || p.paidInTotal || 0));
    const confirmedTotal = sum(rows.filter(r => r.status === 'CONFIRMED'), r => Number(r.amount || 0));
    const pendingApproval = sum(rows.filter(r => r.status === 'SUBMITTED'), r => Number(r.amount || 0));
    const pendingConfirm = sum(rows.filter(r => r.status === 'APPROVED'), r => Number(r.amount || 0));
    const monthAdded = stats?.monthAdded?.total ?? 0;
    const lastDate = rows.map(r => r.contributionDate || (r.createdAt || '').slice(0, 10)).filter(Boolean).sort().slice(-1)[0] || '—';
    return { totalProjectPaidIn, confirmedTotal, pendingApproval, pendingConfirm, monthAdded, lastDate };
  }, [projects, rows, stats]);

  const addAttachment = (url: string) => { if (url) setForm((f: any) => ({ ...f, attachmentUrls: [...f.attachmentUrls, url] })); };
  const removeAttachment = (i: number) => setForm((f: any) => ({ ...f, attachmentUrls: f.attachmentUrls.filter((_: string, idx: number) => idx !== i) }));

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1F4E79' }}>资本流管理</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={() => router.push('/shareholders/capital/import')} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #1F4E79', background: '#fff', color: '#1F4E79', fontWeight: 600, cursor: 'pointer' }}>
            导入资本流
          </button>
          <button onClick={() => setShowNew(v => !v)} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#1F4E79', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
            {showNew ? '收起' : '+ 新增资本流'}
          </button>
        </div>
      </div>

      {/* KPI 区 */}
      <div style={{ ...KPI_GRID, marginBottom: 16 }}>
        <KpiCard label="项目总实缴资本" value={`¥${money(kpis.totalProjectPaidIn)}`} subValue={`共 ${projects.length} 个项目`} icon={Wallet} accentColor="blue" />
        <KpiCard label="股东累计实缴(已确认)" value={`¥${money(kpis.confirmedTotal)}`} icon={CheckCircle2} accentColor="green" />
        <KpiCard label="待审批资本流金额" value={`¥${money(kpis.pendingApproval)}`} icon={Clock} accentColor="amber" />
        <KpiCard label="待确认资本流金额" value={`¥${money(kpis.pendingConfirm)}`} icon={CalendarClock} accentColor="violet" />
        <KpiCard label="本月新增资本流" value={`¥${money(kpis.monthAdded)}`} subValue={`${stats?.monthAdded?.count ?? 0} 笔`} icon={CalendarPlus} accentColor="teal" />
        <KpiCard label="最近资本流日期" value={kpis.lastDate} icon={TrendingUp} accentColor="indigo" />
      </div>

      <p style={{ color: '#888', fontSize: 12.5, marginBottom: 12 }}>资本变化来自业务流+审批流，仅「已确认到账」参与实缴汇总；不可直接修改余额。流程：草稿 → 提交审批 → 审批通过 → 确认到账（自动汇总）。</p>
      {msg && <div style={{ color: '#27ae60', marginBottom: 10 }}>{msg}</div>}
      {err && <div style={{ color: '#c0392b', marginBottom: 10 }}>{err}</div>}

      {showNew && (
        <div style={{ background: '#fff', borderRadius: 10, padding: 18, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12 }}>
            <div><label style={{ fontSize: 12, color: '#666' }}>项目 *</label>
              <select style={inp} value={form.projectCode} onChange={e => setForm({ ...form, projectCode: e.target.value, shareholderCode: '' })}>
                <option value="">请选择</option>{projects.map(p => <option key={p.projectCode} value={p.projectCode}>{p.projectName}</option>)}
              </select></div>
            <div><label style={{ fontSize: 12, color: '#666' }}>股东 *</label>
              <select style={inp} value={form.shareholderCode} onChange={e => setForm({ ...form, shareholderCode: e.target.value })}>
                <option value="">请选择</option>{holders.map(h => <option key={h.shareholderCode} value={h.shareholderCode}>{h.shareholderName}</option>)}
              </select></div>
            <div><label style={{ fontSize: 12, color: '#666' }}>金额（元）*</label>
              <input style={inp} type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="如 500000" /></div>
            <div><label style={{ fontSize: 12, color: '#666' }}>出资来源</label>
              <select style={inp} value={form.sourceType} onChange={e => setForm({ ...form, sourceType: e.target.value })}>
                {SOURCE_TYPE_OPTIONS.map(s => <option key={s} value={s}>{lbl(SOURCE_TYPE_LABEL, s)}</option>)}
              </select></div>
            <div><label style={{ fontSize: 12, color: '#666' }}>出资日期</label>
              <input style={inp} type="date" value={form.contributionDate} onChange={e => setForm({ ...form, contributionDate: e.target.value })} /></div>
            <div><label style={{ fontSize: 12, color: '#666' }}>备注</label>
              <input style={inp} value={form.remark} onChange={e => setForm({ ...form, remark: e.target.value })} /></div>
          </div>

          {/* 股东信息联动只读卡 */}
          {linkInfo && (
            <div style={{ marginTop: 14, padding: '12px 16px', background: '#eef3f9', border: '1px solid #cfe0f0', borderRadius: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10 }}>
              <div style={{ gridColumn: '1 / -1', fontWeight: 700, color: '#1F4E79', fontSize: 14 }}>
                {linkInfo.name} · {linkInfo.projectName}
              </div>
              <KV k="股权比例" v={linkInfo.equityRatio != null ? `${linkInfo.equityRatio.toFixed(2)}%` : '—'} />
              <KV k="股权状态" v={linkInfo.equityStatus === 'CONFIRMED' ? '已确认股权' : linkInfo.equityStatus === 'PROVISIONAL' ? '暂定股权' : '—'} />
              <KV k="累计实缴" v={linkInfo.paidIn != null ? `¥${money(linkInfo.paidIn)}` : '—'} />
              <KV k="实缴占比" v={linkInfo.capitalRatio != null ? `${linkInfo.capitalRatio.toFixed(2)}%` : '—'} />
              <KV k="实益出资占比" v={linkInfo.beneAmt > 0 ? `¥${money(linkInfo.beneAmt)}` : '无代持'} />
              <KV k="最近出资日期" v={linkInfo.lastDate || '—'} />
              <KV k="最近出资金额" v={linkInfo.lastAmount != null ? `¥${money(linkInfo.lastAmount)}` : '—'} />
            </div>
          )}

          {/* 附件上传 */}
          <div style={{ marginTop: 14 }}>
            <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 6 }}>附件（银行回单 / 付款截图 / 投资协议 / 分红决议 / 土地协议 / 设备采购单等，PDF/图片 ≤15MB）</label>
            {form.attachmentUrls.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                {form.attachmentUrls.map((u: string, i: number) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: '#f5f7fa', border: '1px solid #ddd', borderRadius: 6, fontSize: 12.5 }}>
                    <a href={u} target="_blank" rel="noreferrer" style={{ color: '#2980b9' }}>附件{i + 1}</a>
                    <button onClick={() => removeAttachment(i)} style={{ border: 'none', background: 'none', color: '#c0392b', cursor: 'pointer', fontSize: 14 }}>×</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ maxWidth: 380 }}>
              <FileUploadInput value="" onChange={addAttachment} label="+ 上传附件" />
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <button onClick={create} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#27ae60', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>创建草稿</button>
          </div>
        </div>
      )}

      <SummaryBar items={[
        { label: '合计金额', value: yuan(sum(rows, r => Number(r.amount || 0))), accent: true },
        { label: '已确认到账合计', value: yuan(sum(rows.filter(r => r.status === 'CONFIRMED'), r => Number(r.amount || 0))) },
        { label: '记录笔数', value: String(rows.length) },
      ]} />
      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
        <thead><tr>
          <th style={th}>资本流编号</th><th style={th}>项目</th><th style={th}>股东</th><th style={th}>金额</th>
          <th style={th}>来源</th><th style={th}>附件</th><th style={th}>状态</th><th style={th}>操作</th>
        </tr></thead>
        <tbody>
          {rows.map(f => (
            <tr key={f.id}>
              <td style={td}><Link href={`/shareholders/capital/${f.id}`} style={{ color: '#2980b9', fontWeight: 600 }}>{f.capitalFlowNo || f.contributionNo}</Link></td>
              <td style={td}>{pmap[f.projectCode] || f.projectCode}</td>
              <td style={td}>{names[f.shareholderCode] || f.shareholderCode}</td>
              <td style={{ ...td, fontWeight: 600 }}>{money(f.amount)}</td>
              <td style={td}>{lbl(SOURCE_TYPE_LABEL, f.sourceType)}</td>
              <td style={td}>{f.attachmentCount ? `📎 ${f.attachmentCount}` : '—'}</td>
              <td style={td}><span style={{ color: STATUS_COLOR[f.status] || '#555', fontWeight: 600 }}>{lbl(CONTRIB_STATUS_LABEL, f.status)}</span></td>
              <td style={td}>
                <Link href={`/shareholders/capital/${f.id}`} style={{ color: '#1F4E79', fontSize: 12.5, marginRight: 8 }}>查看</Link>
                {f.status === 'DRAFT' && <button style={btn('#2980b9')} onClick={() => act(() => shareholderApi.submitFlow(f.id), '已提交审批')}>提交审批</button>}
                {f.status === 'APPROVED' && <button style={btn('#27ae60')} onClick={() => act(() => shareholderApi.confirmFlow(f.id), '已确认到账，实缴已汇总')}>确认到账</button>}
                {f.status === 'CONFIRMED' && <button style={btn('#c0392b')} onClick={() => { const r = prompt('冲销原因：'); if (r != null) act(() => shareholderApi.reverseFlow(f.id, r), '已冲销，实缴已反向调整'); }}>冲销</button>}
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td style={td} colSpan={8}>暂无资本流记录</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
function KV({ k, v }: { k: string; v: string }) {
  return <div><div style={{ fontSize: 11.5, color: '#7a8aa0' }}>{k}</div><div style={{ fontSize: 14, fontWeight: 600, color: '#1F4E79', marginTop: 2 }}>{v}</div></div>;
}
function btn(c: string): React.CSSProperties { return { padding: '5px 12px', borderRadius: 6, border: 'none', background: c, color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }; }
