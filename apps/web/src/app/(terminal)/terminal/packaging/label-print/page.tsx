'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { useLabelConfig, LABEL_SIZE_PRESETS } from '@/hooks/useLabelConfig';
import { useTerminalContext } from '@/hooks/useTerminalContext';
import { packagingApi } from '@/lib/packaging-api';

const BG='#0f172a', CARD='#1e293b', BOR='#334155';
const ACC='#f59e0b', TXT='#f1f5f9', MUT='#94a3b8', GRN='#22c55e', RED='#ef4444';

const REPRINT_REASONS = ['标签损坏','打印不清晰','信息有误需重打','客户要求补打','其他'];

const FALLBACK_BOXES = [
  { code:'BOX-20260516-001', grade:'A大码', spec:'30枚/箱', printed:true,  verified:true  },
  { code:'BOX-20260516-002', grade:'A大码', spec:'30枚/箱', printed:true,  verified:false },
  { code:'BOX-20260516-003', grade:'A中码', spec:'30枚/箱', printed:false, verified:false },
  { code:'BOX-20260516-004', grade:'A中码', spec:'30枚/箱', printed:false, verified:false },
];

export default function LabelPrintPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const { cfg, setCfg } = useLabelConfig();
  const { ctx } = useTerminalContext();

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const generated = (ctx.packingBatches || []).flatMap((batch, bi) =>
    Array.from({ length: batch.boxes }, (_, j) => ({
      code: `BOX-${today}-${String(bi * 100 + j + 1).padStart(3, '0')}`,
      grade: batch.grade,
      spec: batch.spec,
      printed: false,
      verified: false,
    }))
  );

  const [boxes, setBoxes] = useState(() => generated.length > 0 ? generated : FALLBACK_BOXES);
  const [printing, setPrinting] = useState<string|null>(null);
  const [reprintTarget, setReprintTarget] = useState<string|null>(null);
  const [reprintReason, setReprintReason] = useState('');
  const [verifyInput, setVerifyInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  const handlePrint = async (code: string) => {
    setPrinting(code);
    await new Promise(r=>setTimeout(r,1200));
    setBoxes(prev=>prev.map(b=>b.code===code?{...b,printed:true}:b));
    setPrinting(null);
    await packagingApi.recordPrintLog({
      boxCode: code,
      packingCode: ctx.packingCode,
      printType: 'NORMAL',
    }).catch(console.error);
  };

  const handleVerify = (code: string) => {
    if (verifyInput.trim() === code) {
      setBoxes(prev=>prev.map(b=>b.code===code?{...b,verified:true}:b));
      setVerifyInput('');
    }
  };

  const handleReprint = async () => {
    if (!reprintTarget || !reprintReason) return;
    setPrinting(reprintTarget);
    await new Promise(r=>setTimeout(r,1200));
    setPrinting(null);
    await packagingApi.recordPrintLog({
      boxCode: reprintTarget,
      packingCode: ctx.packingCode,
      printType: 'REPRINT',
      reprintReason: reprintReason,
    }).catch(console.error);
    setReprintTarget(null); setReprintReason('');
  };

  const allDone = boxes.every(b=>b.printed&&b.verified);

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', background:BG, overflow:'hidden' }}>
      <div style={{ background:CARD, borderBottom:`1px solid ${BOR}`, padding:'14px 24px', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <span style={{ fontSize:24 }}>🏷️</span>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:18, fontWeight:700, color:TXT }}>{t('terminal.label_print', '标签打印')}</div>
          <div style={{ fontSize:12, color:MUT }}>{t('ui.打印后扫码校验全部校验通过后可入库', '打印后扫码校验，全部校验通过后可入库')}</div>
        </div>
        <button onClick={()=>setShowSettings(v=>!v)}
          style={{ padding:'8px 16px', borderRadius:8, border:`1px solid ${BOR}`,
            background:'rgba(255,255,255,0.05)', color:MUT, fontSize:13, cursor:'pointer' }}>
          ⚙️ {t('ui.标签设置', '标签设置')}
        </button>
      </div>

      {showSettings && (
        <div style={{ background:'#0d1e35', borderBottom:`1px solid ${BOR}`, padding:'12px 24px', display:'flex', gap:16, alignItems:'center', flexWrap:'wrap' }}>
          <div style={{ fontSize:12, color:MUT }}>{t('ui.尺寸', '尺寸')}：</div>
          {LABEL_SIZE_PRESETS.map(p=>(
            <button key={p.label} onClick={()=>setCfg({labelW:p.w,labelH:p.h})}
              style={{ padding:'6px 14px', borderRadius:6, fontSize:12, cursor:'pointer',
                border:`1px solid ${cfg.labelW===p.w&&cfg.labelH===p.h ? ACC : BOR}`,
                background: cfg.labelW===p.w&&cfg.labelH===p.h ? 'rgba(245,158,11,0.15)' : 'transparent',
                color: cfg.labelW===p.w&&cfg.labelH===p.h ? ACC : MUT }}>
              {p.label}
            </button>
          ))}
          {(['showBatch','showDate','showExpiry','showQr'] as const).map(key=>(
            <label key={key} style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:12, color:MUT }}>
              <input type="checkbox" checked={cfg[key]} onChange={e=>setCfg({[key]:e.target.checked})} />
              {key==='showBatch' ? t('ui.批次号', '批次号')
                : key==='showDate' ? t('ui.生产日期', '生产日期')
                : key==='showExpiry' ? t('ui.食用期', '食用期')
                : t('ui.二维码', '二维码')}
            </label>
          ))}
        </div>
      )}

      <div style={{ flex:1, overflow:'auto', padding:16 }}>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {boxes.map(box => (
            <div key={box.code} style={{ background:CARD, borderRadius:12, padding:16,
              border:`1px solid ${box.verified?'rgba(34,197,94,0.3)':BOR}`,
              display:'flex', alignItems:'center', gap:16 }}>
              {/* 状态标志 */}
              <div style={{ width:48, height:48, borderRadius:10, flexShrink:0,
                background: box.verified ? 'rgba(34,197,94,0.15)' : box.printed ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)',
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>
                {box.verified ? '✅' : box.printed ? '🏷️' : '⬜'}
              </div>

              {/* 箱码信息 */}
              <div style={{ flex:1 }}>
                <div style={{ fontSize:15, fontWeight:700, color:TXT, fontFamily:'monospace' }}>{box.code}</div>
                <div style={{ fontSize:12, color:MUT }}>{box.grade} · {box.spec}</div>
                <div style={{ fontSize:11, marginTop:4, color: box.verified?GRN:box.printed?ACC:MUT }}>
                  {box.verified
                    ? t('ui.已打印已校验', '已打印 · 已校验')
                    : box.printed
                      ? t('ui.已打印待扫码校验', '已打印 · 待扫码校验')
                      : t('ui.待打印', '待打印')}
                </div>
              </div>

              {/* 操作区 */}
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                {box.printed && !box.verified && (
                  <div style={{ display:'flex', gap:6 }}>
                    <input value={verifyInput} onChange={e=>setVerifyInput(e.target.value)}
                      onKeyDown={e=>e.key==='Enter'&&handleVerify(box.code)}
                      placeholder={t('ui.扫码校验', '扫码校验...')}
                      style={{ width:180, background:'rgba(255,255,255,0.05)', border:`1px solid ${BOR}`,
                        borderRadius:6, padding:'8px 12px', color:TXT, fontSize:13 }} />
                    <button onClick={()=>handleVerify(box.code)}
                      style={{ padding:'8px 14px', borderRadius:6, border:'none',
                        background:GRN, color:'#0f172a', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                      {t('ui.校验', '校验')}
                    </button>
                  </div>
                )}
                {!box.printed && (
                  <button onClick={()=>handlePrint(box.code)} disabled={printing===box.code}
                    style={{ padding:'12px 24px', borderRadius:8, border:'none',
                      background:ACC, color:'#0f172a', fontSize:14, fontWeight:700,
                      cursor:'pointer', opacity:printing===box.code?0.7:1 }}>
                    {printing===box.code ? t('ui.打印中', '打印中...') : `🖨️ ${t('common.print', '打印')}`}
                  </button>
                )}
                {box.printed && (
                  <button onClick={()=>setReprintTarget(box.code)}
                    style={{ padding:'8px 14px', borderRadius:6, border:`1px solid ${BOR}`,
                      background:'transparent', color:MUT, fontSize:12, cursor:'pointer' }}>
                    {t('ui.补打', '补打')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 补打原因弹窗 */}
      {reprintTarget && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'flex',
          alignItems:'center', justifyContent:'center', zIndex:200 }}>
          <div style={{ background:CARD, borderRadius:16, padding:32, width:400, border:`1px solid ${BOR}` }}>
            <div style={{ fontSize:16, fontWeight:700, color:TXT, marginBottom:4 }}>{t('ui.补打原因', '补打原因')}</div>
            <div style={{ fontSize:12, color:MUT, marginBottom:20 }}>{t('ui.补打必须选择原因', '补打')} {reprintTarget} {t('ui.必须选择原因', '必须选择原因')}</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:20 }}>
              {REPRINT_REASONS.map(r=>(
                <button key={r} onClick={()=>setReprintReason(r)}
                  style={{ padding:'12px 16px', borderRadius:8, cursor:'pointer', textAlign:'left',
                    border:`2px solid ${reprintReason===r?ACC:BOR}`,
                    background: reprintReason===r?'rgba(245,158,11,0.15)':'rgba(255,255,255,0.03)',
                    color: reprintReason===r?ACC:TXT, fontSize:14 }}>
                  {r}
                </button>
              ))}
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={()=>{setReprintTarget(null);setReprintReason('');}}
                style={{ flex:1, padding:'14px', background:'transparent', border:`1px solid ${BOR}`,
                  borderRadius:8, color:MUT, fontSize:15, cursor:'pointer' }}>{t('common.cancel', '取消')}</button>
              <button onClick={handleReprint} disabled={!reprintReason||!!printing}
                style={{ flex:2, padding:'14px', background:reprintReason?ACC:BOR, border:'none',
                  borderRadius:8, color:reprintReason?'#0f172a':MUT, fontSize:15, fontWeight:700,
                  cursor:reprintReason?'pointer':'not-allowed' }}>
                {printing ? t('ui.打印中', '打印中...') : t('ui.确认补打', '确认补打')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ background:CARD, borderTop:`1px solid ${BOR}`, padding:'16px 24px',
        display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <button onClick={()=>router.push('/terminal/packaging/packing')}
          style={{ padding:'14px 28px', borderRadius:10, border:`1px solid ${BOR}`,
            background:'transparent', color:MUT, fontSize:15, cursor:'pointer' }}>{t('common.back', '返回')}</button>
        <div style={{ flex:1, fontSize:13, color:MUT }}>
          {allDone
            ? `✅ ${t('ui.全部标签已打印并校验', '全部标签已打印并校验')}`
            : `${t('ui.还剩', '还剩')} ${boxes.filter(b=>!b.verified).length} ${t('ui.个箱码待校验', '个箱码待校验')}`}
        </div>
        <button onClick={()=>router.push('/terminal/packaging/warehouse-handover')} disabled={!allDone}
          style={{ padding:'14px 40px', borderRadius:10, border:'none',
            background:allDone?GRN:BOR, color:allDone?'#0f172a':MUT,
            fontSize:16, fontWeight:700, cursor:allDone?'pointer':'not-allowed' }}>
          → {t('ui.前往入库', '前往入库')}
        </button>
      </div>
    </div>
  );
}
