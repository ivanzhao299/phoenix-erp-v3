'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  shareholderApi, ShrContribution, SOURCE_TYPE_LABEL, CONTRIB_STATUS_LABEL, lbl,
} from '@/lib/shareholder-api';

const row: React.CSSProperties = { display: 'flex', padding: '10px 0', borderBottom: '1px solid #eee', fontSize: 14 };
const k: React.CSSProperties = { width: 140, color: '#888' };

export default function CapitalFlowDetail() {
  const { id } = useParams<{ id: string }>();
  const [f, setF] = useState<ShrContribution | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [pmap, setPmap] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');
  useEffect(() => {
    shareholderApi.getFlow(String(id)).then(setF).catch(e => setErr(e?.message || '加载失败'));
    shareholderApi.listShareholders().then(s => setNames(Object.fromEntries(s.map(x => [x.shareholderCode, x.shareholderName])))).catch(() => {});
    shareholderApi.listProjects().then(p => setPmap(Object.fromEntries(p.map(x => [x.projectCode, x.projectName])))).catch(() => {});
  }, [id]);

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <Link href="/shareholders/capital" style={{ color: '#1F4E79', fontSize: 13, textDecoration: 'none' }}>← 返回资本流列表</Link>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1F4E79', margin: '10px 0 16px' }}>资本流详情</h1>
      {err && <div style={{ color: '#c0392b' }}>{err}</div>}
      {f && (
        <div style={{ background: '#fff', borderRadius: 10, padding: '8px 20px', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
          <div style={row}><div style={k}>资本流编号</div><div style={{ fontWeight: 600 }}>{f.capitalFlowNo || f.contributionNo}</div></div>
          <div style={row}><div style={k}>项目</div><div>{pmap[f.projectCode] || f.projectCode}</div></div>
          <div style={row}><div style={k}>股东</div><div>{names[f.shareholderCode] || f.shareholderCode}</div></div>
          <div style={row}><div style={k}>金额</div><div style={{ fontWeight: 700, color: '#1F4E79' }}>¥{Number(f.amount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })} {f.currency === 'CNY' ? '人民币' : f.currency}</div></div>
          <div style={row}><div style={k}>出资来源</div><div>{lbl(SOURCE_TYPE_LABEL, f.sourceType)}</div></div>
          <div style={row}><div style={k}>出资日期</div><div>{f.contributionDate || '—'}</div></div>
          <div style={row}><div style={k}>状态</div><div style={{ fontWeight: 600 }}>{lbl(CONTRIB_STATUS_LABEL, f.status)}</div></div>
          <div style={row}><div style={k}>附件数</div><div>{f.attachmentCount ?? 0}</div></div>
          <div style={row}><div style={k}>确认记录</div><div>{f.confirmedAt ? `已确认到账 · ${String(f.confirmedAt).slice(0, 19).replace('T', ' ')}` : '未确认'}</div></div>
          <div style={row}><div style={k}>财务桥接</div><div>{f.financeBridgeStatus === 'READ_ONLY' ? '只读（不生成凭证）' : (f.financeBridgeStatus || '—')}</div></div>
          <div style={{ ...row, borderBottom: 'none' }}><div style={k}>备注</div><div>{f.remark || '—'}</div></div>
        </div>
      )}
    </div>
  );
}
