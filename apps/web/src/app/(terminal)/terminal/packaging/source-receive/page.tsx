'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { packagingApi } from '@/lib/packaging-api';

const BG='#0f172a', CARD='#1e293b', BOR='#334155';
const ACC='#f59e0b', TXT='#f1f5f9', MUT='#94a3b8', GRN='#22c55e', RED='#ef4444';

export default function SourceReceivePage() {
  const router = useRouter();
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [scanCode, setScanCode] = useState('');
  const [batch, setBatch] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ receivedQty:'', receivedWeight:'', containerCount:'', varianceReason:'' });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [pendingBatches, setPendingBatches] = useState<Record<string, any>[]>([]);
  useEffect(() => {
    packagingApi.getPendingSourceBatches()
      .then(data => setPendingBatches(Array.isArray(data) ? data : []))
      .catch(() => setPendingBatches([]));
  }, []);

  const handleScan = async () => {
    const code = scanCode.trim();
    if (!code) return;
    setError('');
    const raw = pendingBatches.find((b: any) => b.code === code || b.batch_code === code || b.inbound_no === code);
    if (!raw) { setError(`${t('ui.未找到待接收批次', '未找到待接收批次')}：${code}，${t('ui.请确认编号', '请确认编号')}`); return; }
    // 规范化 snake_case → camelCase，兼容 wms_inbound 和 pkg_source_batches 两种来源
    const found: Record<string, any> = {
      ...raw,
      code:           raw.batch_code ?? raw.code,
      houseName:      raw.house_name ?? raw.house_code,
      houseCode:      raw.house_code,
      flockName:      raw.flock_name ?? raw.flock_code,
      flockCode:      raw.flock_code,
      layDate:        raw.lay_date ? new Date(raw.lay_date).toLocaleDateString('zh-CN') : '',
      collectionTime: raw.received_at ? new Date(raw.received_at).toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' }) : '',
      expectedQty:    Number(raw.expected_qty ?? raw.expectedQty ?? 0),
      expectedWeight: Number(raw.expected_weight ?? raw.expectedWeight ?? 0),
      containerCount: Number(raw.container_count ?? raw.containerCount ?? 0),
      status:         raw.batch_status ?? raw.status,
    };
    setBatch(found as any);
    setForm({
      receivedQty:    String(found.expectedQty || ''),
      receivedWeight: String(found.expectedWeight || ''),
      containerCount: String(found.containerCount || ''),
      varianceReason: '',
    });
  };

  const variance = batch && form.receivedQty
    ? Math.abs(Number(form.receivedQty) - (batch.expectedQty || 0))
    : 0;
  const variancePct = batch?.expectedQty ? variance / batch.expectedQty * 100 : 0;
  const needReason = variancePct > 2;

  const canSubmit = batch && form.receivedQty && (!needReason || form.varianceReason);

  const handleSubmit = async () => {
    if (!canSubmit || !batch) return;
    setSubmitting(true);
    try {
      await packagingApi.receiveBatch({
        batchCode: (batch as any).code || (batch as any).batch_code || (batch as any).inbound_no,
        receivedQty: Number(form.receivedQty),
        receivedWeight: Number(form.receivedWeight),
        containerCount: Number(form.containerCount),
        varianceReason: form.varianceReason,
        houseCode: (batch as any).house_code || (batch as any).houseId,
        layDate: (batch as any).layDate || (batch as any).lay_date,
        expectedQty: (batch as any).expectedQty || (batch as any).expected_qty,
        expectedWeight: (batch as any).expectedWeight || (batch as any).expected_weight,
      });
      setDone(true);
      setTimeout(() => router.push('/terminal/packaging/qc-inspection'), 1500);
    } finally { setSubmitting(false); }
  };

  if (done) return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:BG, gap:16 }}>
      <div style={{ fontSize:64 }}>✅</div>
      <div style={{ fontSize:24, fontWeight:700, color:GRN }}>{t('ui.接收成功', '接收成功')}</div>
      <div style={{ color:MUT }}>{t('ui.批次状态已更新为待首检跳转中', '批次状态已更新为「待首检」，跳转中...')}</div>
    </div>
  );

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', background:BG, overflow:'hidden' }}>
      <div style={{ background:CARD, borderBottom:`1px solid ${BOR}`, padding:'14px 24px', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <span style={{ fontSize:24 }}>📥</span>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:TXT }}>{t('terminal.source_receive', '来源批次接收')}</div>
          <div style={{ fontSize:12, color:MUT }}>{t('ui.扫描批次码或手动输入确认接收数量', '扫描批次码或手动输入，确认接收数量')}</div>
        </div>
      </div>

      <div style={{ flex:1, overflow:'auto', padding:24 }}>
        {/* 扫码区 */}
        <div style={{ background:CARD, borderRadius:12, padding:20, border:`1px solid ${BOR}`, marginBottom:16 }}>
          <div style={{ fontSize:13, color:MUT, marginBottom:12, fontWeight:600 }}>{t('ui.扫描来源批次码', '扫描来源批次码')}</div>
          <div style={{ display:'flex', gap:10 }}>
            <input ref={inputRef} value={scanCode} onChange={e=>setScanCode(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&handleScan()}
              placeholder={t('ui.扫描条码或输入批次号', '扫描条码 或 输入批次号（如 SB-20260516-002）')}
              autoFocus
              style={{ flex:1, background:'rgba(255,255,255,0.05)', border:`1px solid ${BOR}`,
                borderRadius:8, padding:'14px 16px', color:TXT, fontSize:15 }} />
            <button onClick={handleScan}
              style={{ padding:'14px 28px', background:ACC, color:'#0f172a', border:'none',
                borderRadius:8, fontSize:15, fontWeight:700, cursor:'pointer' }}>
              {t('common.confirm', '确认')}
            </button>
          </div>
          {/* 快捷选择（开发阶段） */}
          <div style={{ marginTop:10, display:'flex', gap:8, flexWrap:'wrap' }}>
            {pendingBatches.map((b: any) => (
              <button key={b.id || b.batch_code || b.inbound_no} onClick={()=>{setScanCode(b.code || b.batch_code || b.inbound_no);}}
                style={{ padding:'6px 14px', background:'rgba(245,158,11,0.1)',
                  border:`1px solid rgba(245,158,11,0.3)`, borderRadius:6,
                  color:ACC, fontSize:12, cursor:'pointer' }}>
                {b.code || b.batch_code || b.inbound_no}
              </button>
            ))}
          </div>
          {error && <div style={{ marginTop:10, color:RED, fontSize:13 }}>⚠️ {error}</div>}
        </div>

        {/* 批次信息 */}
        {batch && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            {/* 系统信息 */}
            <div style={{ background:CARD, borderRadius:12, padding:20, border:`1px solid ${BOR}` }}>
              <div style={{ fontSize:13, color:MUT, marginBottom:12, fontWeight:600 }}>{t('ui.批次信息系统', '批次信息（系统）')}</div>
              {[
                [t('ui.批次号', '批次号'), batch.code],
                [t('ui.场区', '场区'), batch.siteName],
                [t('ui.鸡舍', '鸡舍'), batch.houseName],
                [t('ui.鸡群', '鸡群'), batch.flockName],
                [t('ui.产蛋日期', '产蛋日期'), batch.layDate],
                [t('ui.集蛋时间', '集蛋时间'), batch.collectionTime||'—'],
                [t('ui.预计数量', '预计数量'), `${batch.expectedQty?.toLocaleString()} ${t('ui.枚', '枚')}`],
                [t('ui.预计重量', '预计重量'), `${batch.expectedWeight} kg`],
              ].map(([k,v]) => (
                <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0',
                  borderBottom:`1px solid rgba(255,255,255,0.04)`, fontSize:13 }}>
                  <span style={{ color:MUT }}>{k}</span>
                  <span style={{ color:TXT, fontWeight:500 }}>{v}</span>
                </div>
              ))}
            </div>

            {/* 实收录入 */}
            <div style={{ background:CARD, borderRadius:12, padding:20, border:`1px solid ${BOR}` }}>
              <div style={{ fontSize:13, color:MUT, marginBottom:12, fontWeight:600 }}>{t('ui.实收数量确认', '实收数量确认')}</div>
              {[
                { key:'receivedQty', label: t('ui.实收数量枚', '实收数量（枚）'), type:'number', unit: t('ui.枚', '枚') },
                { key:'receivedWeight', label: t('ui.实收重量kg', '实收重量（kg）'), type:'number', unit:'kg' },
                { key:'containerCount', label: t('ui.容器数筐', '容器数（筐）'), type:'number', unit: t('ui.筐', '筐') },
              ].map(field => (
                <div key={field.key} style={{ marginBottom:12 }}>
                  <div style={{ fontSize:11, color:MUT, marginBottom:4 }}>{field.label}</div>
                  <input type={field.type}
                    value={(form as any)[field.key]} onChange={e=>setForm(p=>({...p,[field.key]:e.target.value}))}
                    style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:`1px solid ${BOR}`,
                      borderRadius:8, padding:'12px 14px', color:TXT, fontSize:16,
                      fontWeight:600, boxSizing:'border-box' }} />
                </div>
              ))}

              {needReason && (
                <div>
                  <div style={{ fontSize:12, color:'#fbbf24', marginBottom:6 }}>
                    ⚠️ {t('ui.差异超过阈值必须填写原因', `差异 ${variancePct.toFixed(1)}%，超过 2% 阈值，必须填写原因`)}
                  </div>
                  <textarea value={form.varianceReason} onChange={e=>setForm(p=>({...p,varianceReason:e.target.value}))}
                    placeholder={t('ui.请说明差异原因', '请说明差异原因...')}
                    rows={3}
                    style={{ width:'100%', background:'rgba(251,191,36,0.05)', border:`1px solid rgba(251,191,36,0.3)`,
                      borderRadius:8, padding:'10px 12px', color:TXT, fontSize:13,
                      resize:'none', boxSizing:'border-box' }} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div style={{ background:CARD, borderTop:`1px solid ${BOR}`, padding:'16px 24px',
        display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <div style={{ flex:1, fontSize:13, color:MUT }}>
          {batch
            ? `${t('ui.批次', '批次')} ${batch.code} ${t('ui.已加载请确认实收数量', '已加载，请确认实收数量')}`
            : t('ui.等待扫描批次码', '等待扫描批次码...')}
        </div>
        <button onClick={()=>router.push('/terminal/packaging/dashboard')}
          style={{ padding:'14px 28px', borderRadius:10, border:`1px solid ${BOR}`,
            background:'transparent', color:MUT, fontSize:15, cursor:'pointer' }}>{t('common.back', '返回')}</button>
        <button onClick={handleSubmit} disabled={!canSubmit || submitting}
          style={{ padding:'14px 40px', borderRadius:10, border:'none',
            background: canSubmit ? GRN : BOR, color: canSubmit ? '#0f172a' : MUT,
            fontSize:16, fontWeight:700, cursor: canSubmit ? 'pointer' : 'not-allowed',
            opacity: submitting ? 0.7 : 1, transition:'all 0.15s' }}>
          {submitting ? t('ui.提交中', '提交中...') : t('ui.确认接收', '确认接收')}
        </button>
      </div>
    </div>
  );
}
