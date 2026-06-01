'use client';
import { useEffect, useState } from 'react';
import {
  shareholderApi, ShrContribution, ShrProject, ShrShareholder,
  SOURCE_TYPE_LABEL, CONTRIB_STATUS_LABEL, lbl,
} from '@/lib/shareholder-api';

const th: React.CSSProperties = { textAlign: 'left', padding: '9px 10px', background: '#1F4E79', color: '#fff', fontSize: 12.5, fontWeight: 600 };
const td: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #eee', fontSize: 13 };
const inp: React.CSSProperties = { padding: '7px 10px', borderRadius: 6, border: '1px solid #ccc', fontSize: 13.5, width: '100%' };
const STATUS_COLOR: Record<string, string> = { DRAFT: '#999', SUBMITTED: '#e67e22', APPROVED: '#2980b9', CONFIRMED: '#27ae60', CANCELLED: '#aaa', REVERSED: '#c0392b' };
const SRC_OPTS = ['BANK_TRANSFER', 'DIVIDEND_OFFSET', 'SHAREHOLDER_ADVANCE', 'PERSONAL_PAYMENT', 'EQUIPMENT_INVESTMENT', 'LAND_INVESTMENT', 'OTHER'];
const money = (v?: string) => v == null ? '—' : Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2 });

export default function CapitalFlowPage() {
  const [projects, setProjects] = useState<ShrProject[]>([]);
  const [holders, setHolders] = useState<ShrShareholder[]>([]);
  const [rows, setRows] = useState<ShrContribution[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [pmap, setPmap] = useState<Record<string, string>>({});
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState<any>({ projectCode: '', shareholderCode: '', amount: '', sourceType: 'BANK_TRANSFER', contributionDate: '', remark: '' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const reload = () => shareholderApi.listFlows().then(setRows).catch(e => setErr(e?.message));
  useEffect(() => {
    shareholderApi.listProjects().then(p => { setProjects(p); setPmap(Object.fromEntries(p.map(x => [x.projectCode, x.projectName]))); });
    shareholderApi.listShareholders().then(s => { setHolders(s); setNames(Object.fromEntries(s.map(x => [x.shareholderCode, x.shareholderName]))); });
    reload();
  }, []);

  const act = async (fn: () => Promise<any>, ok: string) => {
    setErr(''); setMsg('');
    try { await fn(); setMsg(ok); reload(); } catch (e: any) { setErr(e?.message || '操作失败'); }
  };
  const create = () => act(async () => {
    if (!form.projectCode || !form.shareholderCode || !form.amount) throw new Error('请填写项目、股东、金额');
    await shareholderApi.createFlow({ ...form, amount: Number(form.amount) });
    setShowNew(false); setForm({ projectCode: '', shareholderCode: '', amount: '', sourceType: 'BANK_TRANSFER', contributionDate: '', remark: '' });
  }, '资本流草稿已创建');

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1F4E79' }}>资本流管理</h1>
        <button onClick={() => setShowNew(v => !v)} style={{ marginLeft: 'auto', padding: '8px 16px', borderRadius: 8, border: 'none', background: '#1F4E79', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
          {showNew ? '收起' : '+ 新增资本流'}
        </button>
      </div>
      <p style={{ color: '#888', fontSize: 12.5, marginBottom: 12 }}>资本变化来自业务流+审批流，仅「已确认到账」参与实缴汇总；不可直接修改余额。流程：草稿 → 提交审批 → 审批通过 → 确认到账（自动汇总）。</p>
      {msg && <div style={{ color: '#27ae60', marginBottom: 10 }}>{msg}</div>}
      {err && <div style={{ color: '#c0392b', marginBottom: 10 }}>{err}</div>}

      {showNew && (
        <div style={{ background: '#fff', borderRadius: 10, padding: 18, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,.08)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12 }}>
          <div><label style={{ fontSize: 12, color: '#666' }}>项目 *</label>
            <select style={inp} value={form.projectCode} onChange={e => setForm({ ...form, projectCode: e.target.value })}>
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
              {SRC_OPTS.map(s => <option key={s} value={s}>{lbl(SOURCE_TYPE_LABEL, s)}</option>)}
            </select></div>
          <div><label style={{ fontSize: 12, color: '#666' }}>出资日期</label>
            <input style={inp} type="date" value={form.contributionDate} onChange={e => setForm({ ...form, contributionDate: e.target.value })} /></div>
          <div><label style={{ fontSize: 12, color: '#666' }}>备注</label>
            <input style={inp} value={form.remark} onChange={e => setForm({ ...form, remark: e.target.value })} /></div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button onClick={create} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#27ae60', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>创建草稿</button>
          </div>
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
        <thead><tr>
          <th style={th}>资本流编号</th><th style={th}>项目</th><th style={th}>股东</th><th style={th}>金额</th>
          <th style={th}>来源</th><th style={th}>状态</th><th style={th}>操作</th>
        </tr></thead>
        <tbody>
          {rows.map(f => (
            <tr key={f.id}>
              <td style={td}>{f.capitalFlowNo || f.contributionNo}</td>
              <td style={td}>{pmap[f.projectCode] || f.projectCode}</td>
              <td style={td}>{names[f.shareholderCode] || f.shareholderCode}</td>
              <td style={{ ...td, fontWeight: 600 }}>{money(f.amount)}</td>
              <td style={td}>{lbl(SOURCE_TYPE_LABEL, f.sourceType)}</td>
              <td style={td}><span style={{ color: STATUS_COLOR[f.status] || '#555', fontWeight: 600 }}>{lbl(CONTRIB_STATUS_LABEL, f.status)}</span></td>
              <td style={td}>
                {f.status === 'DRAFT' && <button style={btn('#2980b9')} onClick={() => act(() => shareholderApi.submitFlow(f.id), '已提交审批')}>提交审批</button>}
                {f.status === 'APPROVED' && <button style={btn('#27ae60')} onClick={() => act(() => shareholderApi.confirmFlow(f.id), '已确认到账，实缴已汇总')}>确认到账</button>}
                {f.status === 'CONFIRMED' && <button style={btn('#c0392b')} onClick={() => { const r = prompt('冲销原因：'); if (r != null) act(() => shareholderApi.reverseFlow(f.id, r), '已冲销，实缴已反向调整'); }}>冲销</button>}
                {['SUBMITTED', 'CANCELLED', 'REVERSED'].includes(f.status) && <span style={{ color: '#bbb', fontSize: 12 }}>—</span>}
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td style={td} colSpan={7}>暂无资本流记录</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
function btn(c: string): React.CSSProperties { return { padding: '5px 12px', borderRadius: 6, border: 'none', background: c, color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }; }
