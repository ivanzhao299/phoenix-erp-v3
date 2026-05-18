'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTerminalContext } from '@/hooks/useTerminalContext';
import { packagingApi } from '@/lib/packaging-api';
import { T } from '@/styles/terminal-theme';


export default function WarehouseHandoverPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const { ctx } = useTerminalContext();

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const pendingBoxes = (ctx.packingBatches || []).flatMap((batch, bi) =>
    Array.from({ length: batch.boxes }, (_, j) => ({
      code: `BOX-${today}-${String(bi * 100 + j + 1).padStart(3, '0')}`,
      grade: batch.grade,
      qty: batch.eggs / batch.boxes,
    }))
  );
  const [scanInput, setScanInput] = useState('');
  const [scanned, setScanned] = useState<string[]>([]);
  const [palletCode, setPalletCode] = useState('');
  const [location, setLocation] = useState('');
  const [receiver, setReceiver] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleScan = (manualCode?: string) => {
    const code = (manualCode ?? scanInput).trim();
    if (!code) return;
    if (scanned.includes(code)) { setError(`${code} ${t('ui.已扫描', '已扫描')}`); return; }
    const found = pendingBoxes.find(b=>b.code===code);
    if (!found) { setError(`${t('ui.未找到箱码', '未找到箱码')}：${code}`); return; }
    setScanned(prev=>[...prev, code]);
    setScanInput('');
    setError('');
  };

  const handleConfirmAll = () => {
    setScanned(pendingBoxes.map(b=>b.code));
    setError('');
  };

  const totalQty = scanned.reduce((a,c)=>{
    const b = pendingBoxes.find(b=>b.code===c);
    return a + (b?.qty||0);
  },0);

  const allScanned = pendingBoxes.every(b=>scanned.includes(b.code));
  const canSubmit = allScanned && receiver && location;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await packagingApi.confirmHandover({
        shiftId: ctx.currentShift?.id,
        packingCode: ctx.packingCode,
        boxes: scanned,
        palletCode,
        location,
        receiver,
        productionDate: new Date().toISOString().slice(0, 10),
      });
    } catch (e) {
      console.error('入库确认失败', e);
    }
    setDone(true);
    setTimeout(() => router.push('/terminal/packaging/shift-close'), 2000);
    setSubmitting(false);
  };

  if (pendingBoxes.length === 0) return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:T.BG, gap:16 }}>
      <div style={{ fontSize:48 }}>📦</div>
      <div style={{ fontSize:18, fontWeight:700, color:T.TXT }}>{t('ui.暂无待入库包装批次', '暂无待入库包装批次')}</div>
      <div style={{ fontSize:13, color:T.MUT }}>{t('ui.请先完成包装作业', '请先完成包装作业')}</div>
      <button type="button" onClick={() => router.push('/terminal/packaging/packing')}
        style={{ marginTop:8, padding:'12px 28px', borderRadius:10, background:T.ACC, color:'#0f172a', border:'none', fontSize:14, fontWeight:700, cursor:'pointer' }}>
        → {t('terminal.packing', '前往包装')}
      </button>
    </div>
  );

  if (done) return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:T.BG, gap:16 }}>
      <div style={{ fontSize:64 }}>🏭</div>
      <div style={{ fontSize:24, fontWeight:700, color:T.GRN }}>{t('ui.入库成功', '入库成功')}</div>
      <div style={{ color:T.MUT }}>{scanned.length} {t('ui.箱', '箱')} · {totalQty} {t('ui.枚已入库跳转交班', '枚已入库，跳转交班...')}</div>
    </div>
  );

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', background:T.BG, overflow:'hidden' }}>
      <div style={{ background:T.CARD, borderBottom:`1px solid ${T.BOR}`, padding:'14px 24px', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <span style={{ fontSize:24 }}>🏭</span>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:T.TXT }}>{t('terminal.warehouse_handover', '成品入库')}</div>
          <div style={{ fontSize:12, color:T.MUT }}>{t('ui.逐箱扫码核验仓库确认接收', '逐箱扫码核验，仓库确认接收')}</div>
        </div>
      </div>

      <div style={{ flex:1, overflow:'auto', padding:24, display:'flex', gap:16 }}>
        {/* 左：扫码区 */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ background:T.CARD, borderRadius:12, padding:20, border:`1px solid ${T.BOR}` }}>
            <div style={{ fontSize:13, color:T.MUT, marginBottom:12, fontWeight:600 }}>{t('ui.扫描箱码入库', '扫描箱码入库')}</div>
            <div style={{ display:'flex', gap:10, marginBottom:12 }}>
              <input value={scanInput} onChange={e=>setScanInput(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&handleScan()}
                placeholder={t('ui.扫描箱码如BOX', '扫描箱码（如 BOX-20260516-001）')}
                autoFocus
                style={{ flex:1, background:'rgba(255,255,255,0.05)', border:`1px solid ${T.BOR}`,
                  borderRadius:8, padding:'14px 16px', color:T.TXT, fontSize:15 }} />
              <button type="button" onClick={()=>handleScan()}
                style={{ padding:'14px 24px', background:T.ACC, color:'#0f172a', border:'none',
                  borderRadius:8, fontSize:15, fontWeight:700, cursor:'pointer' }}>{t('ui.扫入', '扫入')}</button>
              {!allScanned && (
                <button type="button" onClick={handleConfirmAll}
                  style={{ padding:'14px 20px', background:'rgba(34,197,94,0.15)', color:T.GRN,
                    border:`1px solid rgba(34,197,94,0.3)`, borderRadius:8, fontSize:13,
                    fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>{t('ui.全部确认', '全部确认')}</button>
              )}
            </div>
            {error && <div style={{ color:T.RED, fontSize:13 }}>⚠️ {error}</div>}

            {/* 待扫列表 */}
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {pendingBoxes.map(box=>{
                const isDone = scanned.includes(box.code);
                return (
                  <div key={box.code} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px',
                    borderRadius:8, background: isDone?'rgba(34,197,94,0.08)':'rgba(255,255,255,0.03)',
                    border:`1px solid ${isDone?'rgba(34,197,94,0.3)':T.BOR}` }}>
                    <span style={{ fontSize:18 }}>{isDone?'✅':'⬜'}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:isDone?T.GRN:T.TXT, fontFamily:'monospace' }}>{box.code}</div>
                      <div style={{ fontSize:11, color:T.MUT }}>{box.grade} · {box.qty}{t('ui.枚', '枚')}</div>
                    </div>
                    {!isDone && (
                      <button type="button" onClick={()=>handleScan(box.code)}
                        style={{ padding:'6px 12px', borderRadius:6, border:`1px solid ${T.BOR}`,
                          background:'transparent', color:T.MUT, fontSize:12, cursor:'pointer' }}>
                        {t('ui.手动确认', '手动确认')}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 托盘/库位信息 */}
          <div style={{ background:T.CARD, borderRadius:12, padding:20, border:`1px solid ${T.BOR}` }}>
            <div style={{ fontSize:13, color:T.MUT, marginBottom:12, fontWeight:600 }}>{t('ui.托盘库位信息', '托盘 & 库位信息')}</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
              {[
                { key:'palletCode', state:palletCode, set:setPalletCode, label: t('ui.托盘码', '托盘码'), ph: t('ui.扫码或输入', '扫码或输入') },
                { key:'location', state:location, set:setLocation, label: t('ui.库位', '库位'), ph: t('ui.如A0103', '如 A-01-03') },
                { key:'receiver', state:receiver, set:setReceiver, label: t('ui.仓管员', '仓管员'), ph: t('ui.接收人姓名', '接收人姓名') },
              ].map(f=>(
                <div key={f.key}>
                  <div style={{ fontSize:11, color:T.MUT, marginBottom:4 }}>{f.label}</div>
                  <input value={f.state} onChange={e=>f.set(e.target.value)} placeholder={f.ph}
                    style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:`1px solid ${T.BOR}`,
                      borderRadius:8, padding:'12px 14px', color:T.TXT, fontSize:14, boxSizing:'border-box' }} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 右：汇总 */}
        <div style={{ width:220, flexShrink:0 }}>
          <div style={{ background:T.CARD, borderRadius:12, padding:20, border:`1px solid ${T.BOR}` }}>
            <div style={{ fontSize:13, color:T.MUT, marginBottom:12, fontWeight:600 }}>{t('ui.入库汇总', '入库汇总')}</div>
            {[
              { label: t('ui.待入箱数', '待入箱数'), value:`${pendingBoxes.length} ${t('ui.箱', '箱')}` },
              { label: t('ui.已扫箱数', '已扫箱数'), value:`${scanned.length} ${t('ui.箱', '箱')}`, color:T.GRN },
              { label: t('ui.总枚数', '总枚数'),   value:`${totalQty} ${t('ui.枚', '枚')}` },
            ].map(item=>(
              <div key={item.label} style={{ padding:'10px 0', borderBottom:`1px solid rgba(255,255,255,0.05)` }}>
                <div style={{ fontSize:11, color:T.MUT }}>{item.label}</div>
                <div style={{ fontSize:20, fontWeight:700, color:item.color||T.TXT }}>{item.value}</div>
              </div>
            ))}
            <div style={{ marginTop:12, padding:'8px', borderRadius:8,
              background: allScanned?'rgba(34,197,94,0.1)':'rgba(245,158,11,0.1)',
              textAlign:'center', fontSize:12,
              color:allScanned?T.GRN:'#fbbf24' }}>
              {allScanned
                ? `✅ ${t('ui.全部箱码已扫', '全部箱码已扫')}`
                : `${t('ui.还剩', '还剩')} ${pendingBoxes.length - scanned.length} ${t('ui.箱未扫', '箱未扫')}`}
            </div>
          </div>
        </div>
      </div>

      <div style={{ background:T.CARD, borderTop:`1px solid ${T.BOR}`, padding:'16px 24px',
        display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <button type="button" onClick={()=>router.push('/terminal/packaging/label-print')}
          style={{ padding:'14px 28px', borderRadius:10, border:`1px solid ${T.BOR}`,
            background:'transparent', color:T.MUT, fontSize:15, cursor:'pointer' }}>{t('common.back', '返回')}</button>
        <div style={{ flex:1 }} />
        <button type="button" onClick={()=>setShowConfirm(true)} disabled={!canSubmit||submitting}
          style={{ padding:'14px 40px', borderRadius:10, border:'none',
            background:canSubmit?T.GRN:T.BOR, color:canSubmit?'#0f172a':T.MUT,
            fontSize:16, fontWeight:700, cursor:canSubmit?'pointer':'not-allowed' }}>
          ✓ {t('ui.确认入库', '确认入库')}
        </button>
      </div>

      {showConfirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'flex',
          alignItems:'center', justifyContent:'center', zIndex:200 }}>
          <div style={{ background:T.CARD, borderRadius:16, padding:32, width:360, border:`1px solid ${T.BOR}`, textAlign:'center' }}>
            <div style={{ fontSize:48, marginBottom:12 }}>🏭</div>
            <div style={{ fontSize:18, fontWeight:700, color:T.TXT, marginBottom:8 }}>{t('ui.确认入库', '确认入库？')}</div>
            <div style={{ fontSize:13, color:T.MUT, marginBottom:24 }}>
              {scanned.length} {t('ui.箱', '箱')} · {totalQty} {t('ui.枚', '枚')} → {location || t('ui.待定库位', '待定库位')}<br/>
              {t('ui.接收人', '接收人')}：{receiver}
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button type="button" onClick={()=>setShowConfirm(false)}
                style={{ flex:1, padding:'14px', background:'transparent', border:`1px solid ${T.BOR}`,
                  borderRadius:8, color:T.MUT, fontSize:15, cursor:'pointer' }}>{t('common.cancel', '取消')}</button>
              <button type="button" onClick={()=>{setShowConfirm(false);handleSubmit();}}
                style={{ flex:2, padding:'14px', background:T.GRN, border:'none',
                  borderRadius:8, color:'#0f172a', fontSize:15, fontWeight:700, cursor:'pointer' }}>
                {t('ui.确认入库', '确认入库')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
