'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { useLabelConfig, LABEL_SIZE_PRESETS } from '@/hooks/useLabelConfig';
import { useTerminalContext } from '@/hooks/useTerminalContext';
import { packagingApi } from '@/lib/packaging-api';
import { printLabel, buildLabelCss } from '@/components/packaging/printLabel';
import { T } from '@/styles/terminal-theme';


const REPRINT_REASON_KEYS = [
  'label_print.reprint.damaged',
  'label_print.reprint.unclear',
  'label_print.reprint.wrong_info',
  'label_print.reprint.customer_request',
  'label_print.reprint.other',
] as const;

export default function LabelPrintPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const { cfg, setCfg } = useLabelConfig();
  const { ctx } = useTerminalContext();

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  // 用全局累计序号生成箱码，避免 bi*100+j 导致的编号空间冲突
  const generated = (ctx.packingBatches || []).flatMap((batch, bi) => {
    const startIdx = (ctx.packingBatches || [])
      .slice(0, bi)
      .reduce((s, b) => s + (b.boxes || 0), 0);
    return Array.from({ length: batch.boxes }, (_, j) => ({
      code: `BOX-${today}-${String(startIdx + j + 1).padStart(3, '0')}`,
      grade: batch.grade,
      spec: batch.spec,
      printed: false,
      verified: false,
    }));
  });

  const [boxes, setBoxes] = useState(() => generated);
  const [printing, setPrinting] = useState<string|null>(null);
  const [reprintTarget, setReprintTarget] = useState<string|null>(null);
  const [reprintReason, setReprintReason] = useState('');
  const [verifyInput, setVerifyInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  const buildLabelHtml = (code: string, grade: string, spec: string) => {
    const batchNo = ctx.packingCode ?? '';
    const prodDate = new Date().toLocaleDateString('zh-CN');
    return (
      `<div class="label">` +
        `<div class="hdr"><span class="brand">🥚 ${t('ui.brand_name', '凤凰农业')}</span><span class="badge">${grade}</span></div>` +
        `<div class="bar-text">${code}</div>` +
        `<div class="info">` +
          `<div class="row"><span class="l">${t('ui.规格', '规格')}：</span><span class="v ell">${spec}</span></div>` +
          (cfg.showBatch ? `<div class="row"><span class="l">${t('ui.批次号', '批次号')}：</span><span class="v">${batchNo}</span></div>` : '') +
          (cfg.showDate  ? `<div class="row"><span class="l">${t('ui.生产日期', '生产日期')}：</span><span class="v">${prodDate}</span></div>` : '') +
        `</div>` +
      `</div>`
    );
  };

  const handlePrint = async (code: string) => {
    const box = boxes.find(b => b.code === code);
    if (!box) return;
    setPrinting(code);
    try {
      await printLabel({
        singleLabelHtml: buildLabelHtml(code, box.grade, box.spec),
        css: buildLabelCss(cfg.labelW, cfg.labelH),
        copies: 1,
        title: code,
      });
      setBoxes(prev => prev.map(b => b.code === code ? { ...b, printed: true } : b));
      await packagingApi.recordPrintLog({
        boxCode: code,
        packingCode: ctx.packingCode,
        printType: 'NORMAL',
      }).catch(console.error);
    } finally {
      setPrinting(null);
    }
  };

  const handleVerify = (code: string) => {
    if (verifyInput.trim() === code) {
      setBoxes(prev => prev.map(b => b.code === code ? { ...b, verified: true } : b));
      setVerifyInput('');
    }
  };

  const handleReprint = async () => {
    if (!reprintTarget || !reprintReason) return;
    const box = boxes.find(b => b.code === reprintTarget);
    if (!box) return;
    setPrinting(reprintTarget);
    try {
      await printLabel({
        singleLabelHtml: buildLabelHtml(reprintTarget, box.grade, box.spec),
        css: buildLabelCss(cfg.labelW, cfg.labelH),
        copies: 1,
        title: `${reprintTarget}-REPRINT`,
      });
      await packagingApi.recordPrintLog({
        boxCode: reprintTarget,
        packingCode: ctx.packingCode,
        printType: 'REPRINT',
        reprintReason,
      }).catch(console.error);
    } finally {
      setPrinting(null);
    }
    setReprintTarget(null);
    setReprintReason('');
  };

  const allDone = boxes.length > 0 && boxes.every(b => b.printed && b.verified);

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', background:T.BG, overflow:'hidden' }}>
      <div style={{ background:T.CARD, borderBottom:`1px solid ${T.BOR}`, padding:'14px 24px', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <span style={{ fontSize:24 }}>🏷️</span>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:18, fontWeight:700, color:T.TXT }}>{t('terminal.label_print', '标签打印')}</div>
          <div style={{ fontSize:12, color:T.MUT }}>{t('ui.打印后扫码校验全部校验通过后可入库', '打印后扫码校验，全部校验通过后可入库')}</div>
        </div>
        <button type="button" onClick={() => setShowSettings(v => !v)}
          style={{ padding:'8px 16px', borderRadius:8, border:`1px solid ${T.BOR}`,
            background:'rgba(255,255,255,0.05)', color:T.MUT, fontSize:13, cursor:'pointer' }}>
          ⚙️ {t('ui.标签设置', '标签设置')}
        </button>
      </div>

      {showSettings && (
        <div style={{ background:'#0d1e35', borderBottom:`1px solid ${T.BOR}`, padding:'12px 24px', display:'flex', gap:16, alignItems:'center', flexWrap:'wrap' }}>
          <div style={{ fontSize:12, color:T.MUT }}>{t('ui.尺寸', '尺寸')}：</div>
          {LABEL_SIZE_PRESETS.map(p => (
            <button type="button" key={p.label} onClick={() => setCfg({ labelW: p.w, labelH: p.h })}
              style={{ padding:'6px 14px', borderRadius:6, fontSize:12, cursor:'pointer',
                border:`1px solid ${cfg.labelW === p.w && cfg.labelH === p.h ? T.ACC : T.BOR}`,
                background: cfg.labelW === p.w && cfg.labelH === p.h ? 'rgba(245,158,11,0.15)' : 'transparent',
                color: cfg.labelW === p.w && cfg.labelH === p.h ? T.ACC : T.MUT }}>
              {p.label}
            </button>
          ))}
          {(['showBatch','showDate','showExpiry','showQr'] as const).map(key => (
            <label key={key} style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:12, color:T.MUT }}>
              <input type="checkbox" checked={cfg[key]} onChange={e => setCfg({ [key]: e.target.checked })} />
              {key === 'showBatch' ? t('ui.批次号', '批次号')
                : key === 'showDate' ? t('ui.生产日期', '生产日期')
                : key === 'showExpiry' ? t('ui.食用期', '食用期')
                : t('ui.二维码', '二维码')}
            </label>
          ))}
        </div>
      )}

      <div style={{ flex:1, overflow:'auto', padding:16 }}>
        {boxes.length === 0 ? (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            height:'100%', gap:12, color:T.MUT }}>
            <div style={{ fontSize:48 }}>📦</div>
            <div style={{ fontSize:16, fontWeight:600 }}>{t('ui.暂无待打印标签', '暂无待打印标签')}</div>
            <div style={{ fontSize:13 }}>{t('ui.请先完成包装作业', '请先完成包装作业，再返回此页打印标签')}</div>
            <button type="button" onClick={() => router.push('/terminal/packaging/packing')}
              style={{ marginTop:8, padding:'10px 24px', borderRadius:8, border:`1px solid ${T.BOR}`,
                background:'rgba(255,255,255,0.05)', color:T.MUT, fontSize:14, cursor:'pointer' }}>
              ← {t('ui.前往包装', '前往包装')}
            </button>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {boxes.map(box => (
              <div key={box.code} style={{ background:T.CARD, borderRadius:12, padding:16,
                border:`1px solid ${box.verified ? 'rgba(34,197,94,0.3)' : T.BOR}`,
                display:'flex', alignItems:'center', gap:16 }}>
                <div style={{ width:48, height:48, borderRadius:10, flexShrink:0,
                  background: box.verified ? 'rgba(34,197,94,0.15)' : box.printed ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)',
                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>
                  {box.verified ? '✅' : box.printed ? '🏷️' : '⬜'}
                </div>

                <div style={{ flex:1 }}>
                  <div style={{ fontSize:15, fontWeight:700, color:T.TXT, fontFamily:'monospace' }}>{box.code}</div>
                  <div style={{ fontSize:12, color:T.MUT }}>{box.grade} · {box.spec}</div>
                  <div style={{ fontSize:11, marginTop:4, color: box.verified ? T.GRN : box.printed ? T.ACC : T.MUT }}>
                    {box.verified
                      ? t('ui.已打印已校验', '已打印 · 已校验')
                      : box.printed
                        ? t('ui.已打印待扫码校验', '已打印 · 待扫码校验')
                        : t('ui.待打印', '待打印')}
                  </div>
                </div>

                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  {box.printed && !box.verified && (
                    <div style={{ display:'flex', gap:6 }}>
                      <input value={verifyInput} onChange={e => setVerifyInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleVerify(box.code)}
                        placeholder={t('ui.扫码校验', '扫码校验...')}
                        style={{ width:180, background:'rgba(255,255,255,0.05)', border:`1px solid ${T.BOR}`,
                          borderRadius:6, padding:'8px 12px', color:T.TXT, fontSize:13 }} />
                      <button type="button" onClick={() => handleVerify(box.code)}
                        style={{ padding:'8px 14px', borderRadius:6, border:'none',
                          background:T.GRN, color:'#0f172a', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                        {t('ui.校验', '校验')}
                      </button>
                    </div>
                  )}
                  {!box.printed && (
                    <button type="button" onClick={() => handlePrint(box.code)} disabled={printing === box.code}
                      style={{ padding:'12px 24px', borderRadius:8, border:'none',
                        background:T.ACC, color:'#0f172a', fontSize:14, fontWeight:700,
                        cursor:'pointer', opacity: printing === box.code ? 0.7 : 1 }}>
                      {printing === box.code ? t('ui.打印中', '打印中...') : `🖨️ ${t('common.print', '打印')}`}
                    </button>
                  )}
                  {box.printed && (
                    <button type="button" onClick={() => setReprintTarget(box.code)}
                      style={{ padding:'8px 14px', borderRadius:6, border:`1px solid ${T.BOR}`,
                        background:'transparent', color:T.MUT, fontSize:12, cursor:'pointer' }}>
                      {t('ui.补打', '补打')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 补打原因弹窗 */}
      {reprintTarget && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'flex',
          alignItems:'center', justifyContent:'center', zIndex:200 }}>
          <div style={{ background:T.CARD, borderRadius:16, padding:32, width:400, border:`1px solid ${T.BOR}` }}>
            <div style={{ fontSize:16, fontWeight:700, color:T.TXT, marginBottom:4 }}>{t('ui.补打原因', '补打原因')}</div>
            <div style={{ fontSize:12, color:T.MUT, marginBottom:20 }}>{t('ui.补打必须选择原因', '补打')} {reprintTarget} {t('ui.必须选择原因', '必须选择原因')}</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:20 }}>
              {REPRINT_REASON_KEYS.map(key => {
                const label = t(key, key.split('.').pop() ?? key);
                return (
                  <button type="button" key={key} onClick={() => setReprintReason(label)}
                    style={{ padding:'12px 16px', borderRadius:8, cursor:'pointer', textAlign:'left',
                      border:`2px solid ${reprintReason === label ? T.ACC : T.BOR}`,
                      background: reprintReason === label ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.03)',
                      color: reprintReason === label ? T.ACC : T.TXT, fontSize:14 }}>
                    {label}
                  </button>
                );
              })}
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button type="button" onClick={() => { setReprintTarget(null); setReprintReason(''); }}
                style={{ flex:1, padding:'14px', background:'transparent', border:`1px solid ${T.BOR}`,
                  borderRadius:8, color:T.MUT, fontSize:15, cursor:'pointer' }}>{t('common.cancel', '取消')}</button>
              <button type="button" onClick={handleReprint} disabled={!reprintReason || !!printing}
                style={{ flex:2, padding:'14px', background: reprintReason ? T.ACC : T.BOR, border:'none',
                  borderRadius:8, color: reprintReason ? '#0f172a' : T.MUT, fontSize:15, fontWeight:700,
                  cursor: reprintReason ? 'pointer' : 'not-allowed' }}>
                {printing ? t('ui.打印中', '打印中...') : t('ui.确认补打', '确认补打')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ background:T.CARD, borderTop:`1px solid ${T.BOR}`, padding:'16px 24px',
        display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <button type="button" onClick={() => router.push('/terminal/packaging/packing')}
          style={{ padding:'14px 28px', borderRadius:10, border:`1px solid ${T.BOR}`,
            background:'transparent', color:T.MUT, fontSize:15, cursor:'pointer' }}>{t('common.back', '返回')}</button>
        <div style={{ flex:1, fontSize:13, color:T.MUT }}>
          {allDone
            ? `✅ ${t('ui.全部标签已打印并校验', '全部标签已打印并校验')}`
            : boxes.length > 0
              ? `${t('ui.还剩', '还剩')} ${boxes.filter(b => !b.verified).length} ${t('ui.个箱码待校验', '个箱码待校验')}`
              : ''}
        </div>
        <button type="button" onClick={() => router.push('/terminal/packaging/warehouse-handover')} disabled={!allDone}
          style={{ padding:'14px 40px', borderRadius:10, border:'none',
            background: allDone ? T.GRN : T.BOR, color: allDone ? '#0f172a' : T.MUT,
            fontSize:16, fontWeight:700, cursor: allDone ? 'pointer' : 'not-allowed' }}>
          → {t('ui.前往入库', '前往入库')}
        </button>
      </div>
    </div>
  );
}
