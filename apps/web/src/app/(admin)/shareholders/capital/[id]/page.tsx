'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  shareholderApi, ShrContribution, ShrProject, ShrShareholder,
  SOURCE_TYPE_LABEL, CONTRIB_STATUS_LABEL, lbl,
} from '@/lib/shareholder-api';

const row: React.CSSProperties = { display: 'flex', padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 14 };
const k: React.CSSProperties = { width: 140, color: 'var(--text-secondary)', flexShrink: 0 };
const STATUS_COLOR: Record<string, string> = { DRAFT: 'var(--text-disabled)', SUBMITTED: 'var(--status-warning)', APPROVED: 'var(--color-accent)', CONFIRMED: 'var(--status-success)', CANCELLED: 'var(--text-disabled)', REVERSED: 'var(--status-danger)' };
const money = (v?: string | null) => v == null ? '—' : Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2 });
const fmtTime = (s?: string | null) => s ? new Date(s).toLocaleString('zh-CN') : null;

export default function CapitalFlowDetail() {
  const { id } = useParams<{ id: string }>();
  const [f, setF] = useState<ShrContribution | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [pmap, setPmap] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');
  useEffect(() => {
    shareholderApi.getFlow(String(id)).then(setF).catch(e => setErr(e?.message || '加载失败'));
    shareholderApi.listShareholders().then(s => setNames(Object.fromEntries(s.map((x: ShrShareholder) => [x.shareholderCode, x.shareholderName])))).catch(() => {});
    shareholderApi.listProjects().then(p => setPmap(Object.fromEntries(p.map((x: ShrProject) => [x.projectCode, x.projectName])))).catch(() => {});
  }, [id]);

  const timeline = f ? buildTimeline(f) : [];

  return (
    <div style={{ padding: 24, maxWidth: 880 }}>
      <Link href="/shareholders/capital" style={{ color: 'var(--color-primary)', fontSize: 13, textDecoration: 'none' }}>← 返回资本流列表</Link>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-primary)', margin: '10px 0 16px' }}>资本流详情</h1>
      {err && <div style={{ color: 'var(--status-danger)' }}>{err}</div>}
      {f && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20, alignItems: 'start' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: '8px 20px 16px', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
            <div style={row}><div style={k}>资本流编号</div><div style={{ fontWeight: 600 }}>{f.capitalFlowNo || f.contributionNo}</div></div>
            <div style={row}><div style={k}>项目</div><div>{pmap[f.projectCode] || f.projectCode}</div></div>
            <div style={row}><div style={k}>股东</div><div>{names[f.shareholderCode] || f.shareholderCode}</div></div>
            <div style={row}><div style={k}>金额</div><div style={{ fontWeight: 700, color: 'var(--color-primary)', fontSize: 16 }}>¥{money(f.amount)} <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 400 }}>{f.currency === 'CNY' ? '人民币' : f.currency}</span></div></div>
            <div style={row}><div style={k}>出资来源</div><div>{lbl(SOURCE_TYPE_LABEL, f.sourceType)}</div></div>
            <div style={row}><div style={k}>出资日期</div><div>{f.contributionDate || '—'}</div></div>
            <div style={row}><div style={k}>状态</div><div><span style={{ color: STATUS_COLOR[f.status] || 'var(--text-secondary)', fontWeight: 600 }}>{lbl(CONTRIB_STATUS_LABEL, f.status)}</span></div></div>
            <div style={row}><div style={k}>确认记录</div><div>{f.confirmedAt ? `已确认到账 · ${fmtTime(f.confirmedAt)}${f.confirmedBy ? ` · 确认人 #${f.confirmedBy}` : ''}` : '未确认'}</div></div>
            <div style={row}><div style={k}>审批实例</div><div>{f.wfInstanceId ? `#${f.wfInstanceId}` : '—'}</div></div>
            <div style={row}><div style={k}>财务桥接</div><div>{f.financeBridgeStatus === 'READ_ONLY' ? '只读（不生成凭证）' : (f.financeBridgeStatus || '—')}</div></div>
            <div style={{ ...row, borderBottom: 'none' }}><div style={k}>备注</div><div>{f.remark || '—'}</div></div>

            <div style={{ marginTop: 14 }}>
              <div style={{ fontWeight: 600, color: 'var(--color-primary)', marginBottom: 8 }}>
                附件（{f.attachmentCount ?? f.attachmentUrls?.length ?? 0}）
                {f.status !== 'DRAFT' && <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 400 }}> · 审批后只读</span>}
              </div>
              {(f.attachmentUrls && f.attachmentUrls.length > 0) ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {f.attachmentUrls.map((u, i) => {
                    const isImg = /\.(png|jpe?g|webp)$/i.test(u);
                    return (
                      <a key={i} href={u} target="_blank" rel="noreferrer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: 8, border: '1px solid var(--border)', borderRadius: 8, textDecoration: 'none', color: 'var(--color-accent)', fontSize: 12 }}>
                        {isImg
                          ? <img src={u} alt={`附件${i + 1}`} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6 }} />
                          : <div style={{ width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-muted)', borderRadius: 6, fontSize: 24 }}>📄</div>}
                        <span>附件{i + 1} ↓</span>
                      </a>
                    );
                  })}
                </div>
              ) : <div style={{ color: 'var(--text-disabled)', fontSize: 13 }}>{f.attachmentCount ? '附件数已记录，URL 未持久化（历史数据）' : '无附件'}</div>}
            </div>
          </div>

          <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
            <div style={{ fontWeight: 600, color: 'var(--color-primary)', marginBottom: 14 }}>资本流时间轴</div>
            <div style={{ position: 'relative', paddingLeft: 20 }}>
              {timeline.map((t, i) => (
                <div key={i} style={{ position: 'relative', paddingBottom: i === timeline.length - 1 ? 0 : 18 }}>
                  {i !== timeline.length - 1 && <div style={{ position: 'absolute', left: -13, top: 14, bottom: 0, width: 2, background: 'var(--border)' }} />}
                  <div style={{ position: 'absolute', left: -18, top: 2, width: 12, height: 12, borderRadius: '50%', background: t.color, border: '2px solid var(--bg-card)', boxShadow: '0 0 0 1px ' + t.color }} />
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>{t.title}</div>
                  {t.time && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{t.time}</div>}
                  {t.desc && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{t.desc}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function buildTimeline(f: ShrContribution) {
  const items: { title: string; time?: string | null; desc?: string; color: string }[] = [];
  items.push({ title: '草稿创建', time: fmtTime(f.createdAt), color: 'var(--text-disabled)' });
  if (['SUBMITTED', 'APPROVED', 'CONFIRMED', 'REVERSED'].includes(f.status))
    items.push({ title: '提交审批', desc: f.wfInstanceId ? `审批实例 #${f.wfInstanceId}` : undefined, color: 'var(--status-warning)' });
  if (['APPROVED', 'CONFIRMED', 'REVERSED'].includes(f.status))
    items.push({ title: '审批通过', color: 'var(--color-accent)' });
  if (['CONFIRMED', 'REVERSED'].includes(f.status))
    items.push({ title: '确认到账（自动汇总实缴）', time: fmtTime(f.confirmedAt), desc: f.confirmedBy ? `确认人 #${f.confirmedBy}` : undefined, color: 'var(--status-success)' });
  if (f.status === 'REVERSED') items.push({ title: '已冲销（保留审计轨迹）', color: 'var(--status-danger)' });
  if (f.status === 'CANCELLED') items.push({ title: '已取消', color: 'var(--text-disabled)' });
  return items;
}
