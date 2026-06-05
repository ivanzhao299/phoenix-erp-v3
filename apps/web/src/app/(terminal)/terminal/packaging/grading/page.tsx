'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import u from "@/styles/uix-utils.module.css";
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTerminalContext } from '@/hooks/useTerminalContext';
import { packagingApi } from '@/lib/packaging-api';
import { usePackagingDicts, buildGradeMap, FALLBACK_DICTS, getDictLabel } from '@/hooks/usePackagingDicts';
import { T } from '@/styles/terminal-theme';
import TerminalNumPadPanel from '@/components/terminal/TerminalNumPadPanel';

const GRADING_WIP_DATE = new Date().toISOString().slice(0, 10);
const GRADING_WIP_KEY  = `phoenix_grading_wip3_${GRADING_WIP_DATE}`;
const SALEABLE_PALETTE = ['var(--status-special)', 'var(--color-accent)', 'var(--status-success)', 'var(--status-warning)', 'var(--status-warning)', 'var(--status-special)', 'var(--status-success)'];
const TOAST_MS = 2500;

type SourceBatch = {
  id: number;
  house_code: string;
  house_name: string;
  received_qty: number;
  dirty_qty: number;
  cracked_qty: number;
  available: number;
};

// One row per chicken house, aggregating all its batches
type HouseGroup = {
  house_code: string;
  house_name: string;
  received_qty: number;
  dirty_qty: number;
  cracked_qty: number;
  available: number;
  batch_ids: number[];
};

export default function GradingPage() {
  const router = useRouter();
  const { t, lang, setAppLanguage } = useLanguage();
  const { setGradingResult, ctx } = useTerminalContext();

  const { dicts } = usePackagingDicts(['PKG_EGG_GRADE', 'PKG_EGG_DEFECT']);
  const saleableItems = dicts.PKG_EGG_GRADE ?? FALLBACK_DICTS.PKG_EGG_GRADE;
  const defectItems   = dicts.PKG_EGG_DEFECT ?? FALLBACK_DICTS.PKG_EGG_DEFECT;
  const gradeMap = buildGradeMap([...saleableItems, ...defectItems]);
  const allGradeKeys = useMemo(
    () => [...saleableItems, ...defectItems].map(d => d.code),
    [saleableItems, defectItems],
  );
  const allGradeKeysStr = useMemo(() => allGradeKeys.join(','), [allGradeKeys]);
  const emptyOutputs = useMemo(
    () => Object.fromEntries(allGradeKeys.map(k => [k, 0])),
    [allGradeKeysStr], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ── Source batches ─────────────────────────────────────────────────────────
  const [batches, setBatches] = useState<SourceBatch[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const sourcePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSource = useRef(async () => {
    try {
      const data = await packagingApi.getTodaySourceBatches();
      const list = Array.isArray(data) ? data : [];
      const parsed: SourceBatch[] = list.map((b, idx) => {
        const received = Number(b.received_qty ?? b.receivedQty ?? 0);
        const dirty    = Number(b.dirty_qty ?? b.dirty_count ?? b.dirtyQty ?? 0);
        const cracked  = Number(b.cracked_qty ?? b.cracked_count ?? b.crackedQty ?? 0);
        return {
          id:           Number(b.id ?? b.batch_id ?? idx + 1),
          house_code:   String(b.house_code ?? b.houseCode ?? ''),
          house_name:   String(b.house_name ?? b.houseName ?? b.house_code ?? `#${idx + 1}`),
          received_qty: received,
          dirty_qty:    dirty,
          cracked_qty:  cracked,
          available:    Math.max(0, received - dirty - cracked),
        };
      });
      setBatches(parsed);
    } catch { /* 保留上次 */ }
    finally { setSummaryLoading(false); }
  });

  useEffect(() => {
    void fetchSource.current();
    sourcePollRef.current = setInterval(() => void fetchSource.current(), 5000);
    return () => { if (sourcePollRef.current) clearInterval(sourcePollRef.current); };
  }, []);

  // ── 按鸡舍聚合（与集蛋页同步，每舍一行）──────────────────────────────────
  const houses = useMemo<HouseGroup[]>(() => {
    const map = new Map<string, HouseGroup>();
    for (const b of batches) {
      if (!map.has(b.house_code)) {
        map.set(b.house_code, {
          house_code: b.house_code,
          house_name: b.house_name,
          received_qty: 0, dirty_qty: 0, cracked_qty: 0, available: 0,
          batch_ids: [],
        });
      }
      const h = map.get(b.house_code)!;
      h.received_qty += b.received_qty;
      h.dirty_qty    += b.dirty_qty;
      h.cracked_qty  += b.cracked_qty;
      h.available    += b.available;
      h.batch_ids.push(b.id);
    }
    return Array.from(map.values());
  }, [batches]);

  // ── Per-house grade outputs ────────────────────────────────────────────────
  const [houseOutputsMap, setHouseOutputsMap] = useState<Record<string, Record<string, number>>>(() => {
    try {
      const raw = localStorage.getItem(GRADING_WIP_KEY);
      if (raw) return JSON.parse(raw) as Record<string, Record<string, number>>;
    } catch { /* ignore */ }
    return {};
  });

  const [activeHouseCode, setActiveHouseCode] = useState<string | null>(null);
  const [submittedHouses, setSubmittedHouses] = useState<Set<string>>(new Set());
  const [editKey, setEditKey]     = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [toast, setToast] = useState<{ code: string; total: number; houseName: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-select first pending house
  useEffect(() => {
    if (houses.length > 0 && activeHouseCode === null) {
      const first = houses.find(h => !submittedHouses.has(h.house_code) && h.available > 0);
      if (first) setActiveHouseCode(first.house_code);
    }
  }, [houses]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ensure all grade keys exist when dict loads or house changes
  useEffect(() => {
    if (activeHouseCode === null || allGradeKeys.length === 0) return;
    setHouseOutputsMap(prev => {
      const cur = prev[activeHouseCode] ?? {};
      const validKeys = new Set(allGradeKeys);
      const updated: Record<string, number> = Object.fromEntries(allGradeKeys.map(k => [k, cur[k] ?? 0]));
      const hasChange = Object.keys(cur).some(k => !validKeys.has(k)) || allGradeKeys.some(k => !(k in cur));
      return hasChange ? { ...prev, [activeHouseCode]: updated } : prev;
    });
    if (editKey === null || !allGradeKeys.includes(editKey)) {
      setEditKey(allGradeKeys[0] ?? null);
    }
  }, [allGradeKeysStr, activeHouseCode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset editKey when switching houses
  useEffect(() => {
    setEditKey(allGradeKeys[0] ?? null);
  }, [activeHouseCode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist WIP
  useEffect(() => {
    try { localStorage.setItem(GRADING_WIP_KEY, JSON.stringify(houseOutputsMap)); } catch { /* ignore */ }
  }, [houseOutputsMap]);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // ── Derived values ──────────────────────────────────────────────────────────
  const activeHouse    = houses.find(h => h.house_code === activeHouseCode) ?? null;
  const outputs        = activeHouseCode !== null ? (houseOutputsMap[activeHouseCode] ?? emptyOutputs) : emptyOutputs;
  const houseAvailable = activeHouse?.available ?? 0;
  const totalOutput    = Object.values(outputs).reduce((a, b) => a + b, 0);
  const balanceOk      = totalOutput <= houseAvailable;
  const canSubmit      = !submitting && activeHouse !== null && totalOutput > 0 && balanceOk;
  const totalAvailable = houses.reduce((s, h) => s + h.available, 0);
  const allDone        = houses.length > 0 && houses.filter(h => h.available > 0).every(h => submittedHouses.has(h.house_code));
  const selectedInfo   = editKey ? gradeMap[editKey] : null;
  const selectedColor  = (selectedInfo?.color as string) ?? T.ACC;
  const numpadInitial  = editKey && outputs[editKey] > 0 ? String(outputs[editKey]) : '';

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!canSubmit || !activeHouse) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await packagingApi.submitGrading({
        productionDate: new Date().toISOString().slice(0, 10),
        outputs,
        totalInput:     houseAvailable,
        houseCode:      activeHouse.house_code,
        sourceBatchIds: activeHouse.batch_ids,
        shiftId:        ctx.currentShift?.id ?? null,
      });

      const newSubmittedHouses = new Set([...submittedHouses, activeHouse.house_code]);
      setSubmittedHouses(newSubmittedHouses);

      // Cumulative outputs across all submitted houses → packing context
      const cumulative = Object.fromEntries(allGradeKeys.map(k => [k, 0]));
      for (const hc of newSubmittedHouses) {
        const ho = houseOutputsMap[hc] ?? {};
        for (const [k, v] of Object.entries(ho)) cumulative[k] = (cumulative[k] ?? 0) + v;
      }
      setGradingResult(res.code, cumulative);

      setToast({ code: res.code, total: totalOutput, houseName: activeHouse.house_name });
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => {
        setToast(null);
        const next = houses.find(h => h.house_code !== activeHouse.house_code && !newSubmittedHouses.has(h.house_code) && h.available > 0);
        if (next) setActiveHouseCode(next.house_code);
      }, TOAST_MS);
    } catch (e) {
      setSubmitError((e as { message?: string })?.message || t('ui.提交失败请重试', '提交失败，请重试'));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  const otherTotal = editKey
    ? Object.entries(outputs).filter(([k]) => k !== editKey).reduce((s, [, v]) => s + v, 0)
    : totalOutput;
  const numpadMax = activeHouse ? Math.max(0, houseAvailable - otherTotal) : undefined;
  const numpadWarning = activeHouse && numpadMax === 0
    ? t('ui.已达可分级上限', '已达可分级上限')
    : undefined;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.BG, overflow: 'hidden' }}>

      <style>{`
        @keyframes _grading_blink { 0%,49% { opacity:1; } 50%,100% { opacity:0; } }
        ._grading_cursor { display:inline-block; width:3px; margin-left:4px; border-radius:2px; flex-shrink:0; }
        ._grading_cursor._active { animation: _grading_blink 1s step-end infinite; }
        @keyframes _toast_slide { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
      `}</style>

      {/* Header */}
      <div style={{ position:'relative', background:T.CARD, borderBottom:`1px solid ${T.BOR}`, padding:'12px 20px', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
        <span style={{ fontSize:22 }}>📊</span>
        <div style={{ flex:1, overflow:'hidden' }}>
          <div style={{ fontSize:17, fontWeight:700, color:T.TXT, whiteSpace:'nowrap', overflow:'hidden' }}>{t('terminal.grading', '分级作业')}</div>
          <div style={{ fontSize:12, color:T.MUT, whiteSpace:'nowrap', overflow:'hidden' }}>
            {activeHouse ? activeHouse.house_name : t('ui.分级作业说明', '点击左侧鸡舍开始分级')}
          </div>
        </div>
        <div style={{ textAlign:'right', flexShrink:0, minWidth:90 }}>
          <div style={{ fontSize:22, fontWeight:800, color:T.GRN, fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap' }}>
            {summaryLoading ? '…' : totalAvailable > 0 ? totalAvailable.toLocaleString() : '—'}
          </div>
          <div style={{ fontSize:11, color:T.MUT, whiteSpace:'nowrap' }}>{t('ui.今日可分级枚', '今日可分级（枚）')}</div>
        </div>
        <div style={{ display:'flex', borderRadius:8, overflow:'hidden', border:`1px solid ${T.BOR}`, flexShrink:0 }}>
          {(['zh', 'en', 'lo'] as const).map((l, i) => (
            <button key={l} type="button" onPointerDown={e => { e.preventDefault(); setAppLanguage(l); }}
              style={{ padding:'5px 0', width:38, border:'none', borderLeft: i>0 ? `1px solid ${T.BOR}` : 'none', background: lang===l ? T.ACC : 'transparent', color: lang===l ? 'var(--bg-page)' : T.MUT, fontSize:12, fontWeight:700, cursor:'pointer', WebkitTapHighlightColor:'transparent', transition:'background 0.15s, color 0.15s', textAlign:'center', flexShrink:0 }}>
              {l==='zh' ? '中' : l==='en' ? 'EN' : 'ລາວ'}
            </button>
          ))}
        </div>
        {toast && (
          <div style={{ position:'absolute', top:0, left:0, right:0, bottom:0, display:'flex', alignItems:'center', justifyContent:'center', gap:12, background:'rgba(10,22,40,0.82)', animation:'_toast_slide 0.2s ease-out', pointerEvents:'none' }}>
            <span style={{ fontSize:22 }}>✅</span>
            <span style={{ fontSize:16, fontWeight:700, color:T.GRN }}>{toast.houseName}</span>
            <span style={{ fontSize:13, color:T.MUT }}>{toast.code}</span>
            <span style={{ fontSize:22, fontWeight:900, color:T.GRN, fontVariantNumeric:'tabular-nums', marginLeft:8 }}>{toast.total.toLocaleString()} {t('ui.枚', '枚')}</span>
          </div>
        )}
      </div>

      {/* ── 三列主布局 ── */}
      <div style={{ flex:1, overflow:'hidden', display:'flex', minHeight:0 }}>

        {/* ① 左栏：鸡舍列表（每舍一行，与集蛋页同步） */}
        <div style={{ width:280, flexShrink:0, borderRight:`1px solid ${T.BOR}`, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ padding:'10px 14px 6px', fontSize:11, color:T.MUT, fontWeight:700, letterSpacing:1.4, textTransform:'uppercase', flexShrink:0 }}>
            {t('ui.今日投入', '今日投入')} {houses.length > 0 && `— ${houses.length} ${t('ui.舍', '舍')}`}
          </div>

          <div style={{ flex:1, overflowY:'auto', padding:'0 8px 8px' }}>
            {summaryLoading ? (
              <div style={{ color:T.MUT, fontSize:13, padding:'16px 6px' }}>…</div>
            ) : houses.length === 0 ? (
              <div style={{ color:T.MUT, fontSize:13, padding:'16px 6px', lineHeight:1.6 }}>
                {t('ui.今日尚未录入集蛋数据', '今日尚未录入集蛋数据')}<br/>
                <span className={u.fs11}>{t('ui.可先录入集蛋再返回分级', '可先录入集蛋再返回')}</span>
              </div>
            ) : houses.map(h => {
              const isActive  = h.house_code === activeHouseCode;
              const isDone    = submittedHouses.has(h.house_code);
              const ho        = houseOutputsMap[h.house_code] ?? {};
              const hoTotal   = Object.values(ho).reduce((s, v) => s + v, 0);
              const remaining = h.available - hoTotal;
              const statusColor = isDone ? T.GRN : isActive ? T.ACC : T.MUT;
              return (
                <button type="button" key={h.house_code}
                  onPointerDown={() => { if (!isDone) setActiveHouseCode(h.house_code); }}
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'10px 10px', borderRadius:10, marginBottom:4, border:`1px solid ${isActive ? T.ACC : isDone ? 'var(--status-success-bg-strong-2)' : T.BOR}`, background: isActive ? `${T.ACC}18` : isDone ? 'var(--status-success-bg-faint)' : T.CARD, cursor: isDone ? 'default' : 'pointer', textAlign:'left', WebkitTapHighlightColor:'transparent', transition:'border-color 0.15s, background 0.15s', boxSizing:'border-box' }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', flexShrink:0, background:statusColor }} />
                  <div style={{ flex:1, overflow:'hidden' }}>
                    <div style={{ fontSize:13, fontWeight:700, color: isActive ? T.ACC : isDone ? T.GRN : T.TXT, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {h.house_name}
                    </div>
                    <div style={{ fontSize:10, color:T.MUT, marginTop:1, whiteSpace:'nowrap' }}>
                      {h.dirty_qty > 0 && <span style={{ color:'var(--status-warning)', marginRight:5 }}>{t('ui.脏', '脏')} {h.dirty_qty.toLocaleString()}</span>}
                      {h.cracked_qty > 0 && <span style={{ color:'var(--status-warning)', marginRight:5 }}>{t('ui.裂', '裂')} {h.cracked_qty.toLocaleString()}</span>}
                      {t('ui.采集', '采集')} {h.received_qty.toLocaleString()}
                    </div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0, minWidth:72 }}>
                    <div style={{ fontSize:15, fontWeight:800, color: hoTotal > 0 ? (isDone && remaining === 0 ? T.GRN : T.ACC) : T.MUT, fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap' }}>
                      {hoTotal > 0 ? hoTotal.toLocaleString() : '—'}
                      {isDone && remaining === 0 && <span style={{ fontSize:10, fontWeight:400, marginLeft:3, color:T.GRN }}>✓</span>}
                    </div>
                    <div style={{ fontSize:10, fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap', color: remaining < 0 ? T.RED : remaining === 0 ? T.GRN : 'var(--status-warning)' }}>
                      {remaining < 0
                        ? `${t('ui.超出', '超出')} ${Math.abs(remaining).toLocaleString()}`
                        : `${t('ui.剩余', '剩余')} ${remaining.toLocaleString()}`}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {houses.length > 0 && (
            <div style={{ borderTop:`1px solid ${T.BOR}`, padding:'10px 18px', flexShrink:0 }}>
              <div style={{ fontSize:11, color:T.MUT, whiteSpace:'nowrap' }}>{t('ui.合计', '今日合计')}</div>
              <div style={{ fontSize:20, fontWeight:800, color:T.GRN, fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap' }}>
                {totalAvailable.toLocaleString()} <span style={{ fontSize:12, fontWeight:400, color:T.MUT }}>{t('ui.枚', '枚')}</span>
              </div>
            </div>
          )}
        </div>

        {/* ② 中间栏：等级录入区 */}
        <div style={{ flex:1, overflow:'hidden', padding:'10px 10px 10px 12px', display:'flex', flexDirection:'column', gap:8, minHeight:0 }}>

          {!activeHouse && (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12, color:T.MUT }}>
              <span style={{ fontSize:36 }}>←</span>
              <span style={{ fontSize:15 }}>{t('ui.点击鸡舍开始分级', '点击左侧鸡舍开始分级')}</span>
            </div>
          )}

          {activeHouse && (
            <div style={{ flex:2, minHeight:0, display:'flex', flexDirection:'column', gap:0 }}>
              <div style={{ fontSize:12, color:T.MUT, fontWeight:700, marginBottom:6, letterSpacing:1.5, textTransform:'uppercase', flexShrink:0, whiteSpace:'nowrap', overflow:'hidden' }}>
                {t('ui.可售等级', 'Saleable Grades')}
              </div>
              <div style={{ flex:1, minHeight:0, display:'grid', gridTemplateColumns:'1fr 1fr', gridAutoRows:'1fr', gap:6 }}>
                {saleableItems.map((d, i) => {
                  const tc = d.code;
                  const qty = outputs[tc] ?? 0;
                  const color = (d.color as string) || SALEABLE_PALETTE[i % SALEABLE_PALETTE.length];
                  const isSelected = editKey === tc;
                  return (
                    <button type="button" key={tc} onPointerDown={() => setEditKey(tc)}
                      style={{ width:'100%', height:'100%', background: isSelected?`${color}14`:qty>0?`${color}07`:T.CARD, borderRadius:12, border:`1px solid ${isSelected?color:qty>0?`${color}40`:T.BOR}`, cursor:'pointer', transition:'border-color 0.15s, background 0.15s, box-shadow 0.15s', WebkitTapHighlightColor:'transparent', boxShadow:isSelected?`0 0 0 3px ${color}22`:'none', display:'flex', alignItems:'center', padding:'0 16px 0 0', overflow:'hidden' }}>
                      <div style={{ width:5, alignSelf:'stretch', flexShrink:0, background:isSelected?color:qty>0?`${color}55`:`${color}18`, borderRadius:'10px 0 0 10px', transition:'background 0.15s' }} />
                      <div style={{ flex:1, padding:'0 14px', textAlign:'left', overflow:'hidden' }}>
                        <div style={{ fontSize:24, fontWeight:900, lineHeight:1.2, color, opacity:isSelected?1:qty>0?0.95:0.6, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                          {getDictLabel(d, lang)}
                        </div>
                        {!!(d.weightRange as string) && (
                          <div style={{ fontSize:12, color:T.MUT, marginTop:2, whiteSpace:'nowrap' }}>{d.weightRange as string}</div>
                        )}
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:3, flexShrink:0 }}>
                        <span style={{ fontSize:40, fontWeight:900, lineHeight:1, letterSpacing:'-1px', color:qty>0?color:isSelected?`${color}50`:T.BOR, fontVariantNumeric:'tabular-nums', minWidth:160, textAlign:'right' }}>
                          {qty>0 ? qty.toLocaleString() : (isSelected ? '0' : '—')}
                        </span>
                        <span className={`_grading_cursor${isSelected?' _active':''}`} style={{ height:34, background:color, visibility:isSelected?'visible':'hidden' }} />
                        <span style={{ fontSize:13, color:T.MUT, marginLeft:4 }}>{t('ui.枚', '枚')}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {activeHouse && (
            <div style={{ flex:1, minHeight:0, display:'flex', flexDirection:'column', gap:0 }}>
              <div style={{ fontSize:12, color:T.MUT, fontWeight:700, marginBottom:6, letterSpacing:1.5, textTransform:'uppercase', flexShrink:0, whiteSpace:'nowrap', overflow:'hidden' }}>
                {t('ui.缺陷损耗', 'Defects / Waste')}
              </div>
              <div style={{ flex:1, minHeight:0, display:'grid', gridTemplateColumns:'1fr 1fr', gridAutoRows:'1fr', gap:6 }}>
                {defectItems.map(d => {
                  const tc = d.code;
                  const qty = outputs[tc] ?? 0;
                  const color = (d.color as string) || 'var(--status-danger)';
                  const isSelected = editKey === tc;
                  return (
                    <button type="button" key={tc} onPointerDown={() => setEditKey(tc)}
                      style={{ width:'100%', height:'100%', background:isSelected?`${color}14`:qty>0?`${color}07`:T.CARD, borderRadius:12, border:`1px solid ${isSelected?color:qty>0?`${color}40`:T.BOR}`, cursor:'pointer', transition:'border-color 0.15s, background 0.15s, box-shadow 0.15s', WebkitTapHighlightColor:'transparent', boxShadow:isSelected?`0 0 0 3px ${color}22`:'none', display:'flex', alignItems:'center', padding:'0 16px 0 0', overflow:'hidden' }}>
                      <div style={{ width:5, alignSelf:'stretch', flexShrink:0, background:isSelected?color:qty>0?`${color}55`:`${color}18`, borderRadius:'10px 0 0 10px', transition:'background 0.15s' }} />
                      <div style={{ flex:1, padding:'0 14px', textAlign:'left', overflow:'hidden' }}>
                        <div style={{ fontSize:18, fontWeight:800, lineHeight:1.2, color:isSelected?color:qty>0?T.TXT:T.MUT, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                          {getDictLabel(d, lang)}
                        </div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:3, flexShrink:0 }}>
                        <span style={{ fontSize:36, fontWeight:900, lineHeight:1, letterSpacing:'-1px', color:qty>0?color:isSelected?`${color}50`:T.BOR, fontVariantNumeric:'tabular-nums', minWidth:150, textAlign:'right' }}>
                          {qty>0 ? qty.toLocaleString() : (isSelected ? '0' : '—')}
                        </span>
                        <span className={`_grading_cursor${isSelected?' _active':''}`} style={{ height:30, background:color, visibility:isSelected?'visible':'hidden' }} />
                        <span style={{ fontSize:13, color:T.MUT, marginLeft:4 }}>{t('ui.枚', '枚')}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 投入产出平衡 */}
          <div style={{ background:T.CARD, borderRadius:12, padding:'12px 18px', border:`1px solid ${balanceOk?T.BOR:T.RED}`, display:'flex', alignItems:'center', gap:20, flexShrink:0, height:56, boxSizing:'border-box' }}>
            <div style={{ display:'flex', gap:28, alignItems:'center', overflow:'hidden' }}>
              <div style={{ display:'flex', flexDirection:'column', minWidth:80 }}>
                <span style={{ color:T.MUT, fontSize:11, whiteSpace:'nowrap' }}>{t('ui.本批可分级', '本舍可分级')}</span>
                <strong style={{ color:T.TXT, fontSize:16, fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap' }}>
                  {houseAvailable > 0 ? houseAvailable.toLocaleString() : '—'}
                </strong>
              </div>
              <div style={{ display:'flex', flexDirection:'column', minWidth:80 }}>
                <span style={{ color:T.MUT, fontSize:11, whiteSpace:'nowrap' }}>{t('ui.已录入', '已录入')}</span>
                <strong style={{ color:balanceOk?T.GRN:T.RED, fontSize:16, fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap' }}>
                  {totalOutput.toLocaleString()}
                </strong>
              </div>
              <div style={{ display:'flex', flexDirection:'column', minWidth:80 }}>
                <span style={{ color:T.MUT, fontSize:11, whiteSpace:'nowrap' }}>{t('ui.差异', '差异')}</span>
                <strong style={{ fontSize:16, fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap', color:houseAvailable>0 && Math.abs(houseAvailable-totalOutput)>200 ? 'var(--status-warning)' : T.GRN }}>
                  {houseAvailable > 0 ? (houseAvailable-totalOutput).toLocaleString() : '—'}
                </strong>
              </div>
            </div>
            <div className={u.flex1} />
            {!balanceOk && (
              <div style={{ color:T.RED, fontSize:13, fontWeight:600, whiteSpace:'nowrap' }}>⚠️ {t('ui.产出超过投入', '产出超过投入')}</div>
            )}
          </div>
        </div>

        {/* ③ 右栏：数字键盘 */}
        <TerminalNumPadPanel
          label={t('ui.当前编辑', '当前编辑')}
          value={getDictLabel(selectedInfo, lang) || editKey || '—'}
          accentColor={selectedColor}
          numpadKey={`${activeHouseCode ?? 'none'}_${editKey ?? 'none'}`}
          numpadInitial={numpadInitial}
          max={numpadMax}
          warning={numpadWarning}
          disabled={summaryLoading || !activeHouse}
          onChange={val => {
            if (editKey && activeHouseCode !== null) {
              setHouseOutputsMap(prev => ({
                ...prev,
                [activeHouseCode]: { ...(prev[activeHouseCode] ?? emptyOutputs), [editKey]: Math.max(0, parseInt(val) || 0) },
              }));
            }
          }}
        />
      </div>

      {/* Bottom bar */}
      <div style={{ background:T.CARD, borderTop:`1px solid ${T.BOR}`, padding:'17px 16px', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <button type="button" onClick={() => router.push('/terminal/packaging/source-receive')}
          style={{ padding:'9px 20px', borderRadius:10, border:`1px solid ${T.BOR}`, background:'transparent', color:T.MUT, fontSize:15, cursor:'pointer' }}>
          ← {t('ui.集蛋录入', '集蛋录入')}
        </button>
        <button type="button"
          onPointerDown={() => {
            if (activeHouseCode === null) return;
            setHouseOutputsMap(prev => ({ ...prev, [activeHouseCode]: { ...emptyOutputs } }));
            setEditKey(allGradeKeys[0] ?? null);
          }}
          style={{ padding:'9px 20px', borderRadius:10, border:`1px solid var(--status-danger-bg-strong)`, background:'var(--status-danger-bg-faint)', color:T.RED, fontSize:15, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', WebkitTapHighlightColor:'transparent' }}>
          ↺ {t('ui.清零', '清零')}
        </button>
        <button type="button" onClick={() => router.push('/terminal/packaging/exceptions')}
          style={{ padding:'9px 18px', borderRadius:10, border:`1px solid var(--status-danger)`, background:'var(--status-danger-bg-light)', color:T.RED, fontSize:15, cursor:'pointer' }}>
          ⚠️ {t('ui.上报异常', '上报异常')}
        </button>
        <div className={u.flex1} />
        <div style={{ flex:1, fontSize:13, color:T.RED, fontWeight:600, visibility: submitError ? 'visible' : 'hidden', minWidth:0 }}>
          ⚠️ {submitError || ' '}
        </div>
        {allDone ? (
          <button type="button" onClick={() => router.push('/terminal/packaging/packing')}
            style={{ padding:'9px 40px', borderRadius:10, border:'none', background:T.GRN, color:'var(--bg-page)', fontSize:16, fontWeight:700, cursor:'pointer', flexShrink:0 }}>
            → {t('terminal.packing', '前往包装')}
          </button>
        ) : (
          <button type="button" onClick={handleSubmit} disabled={!canSubmit || submitting}
            style={{ padding:'9px 40px', borderRadius:10, border:'none', background:canSubmit?T.ACC:T.BOR, color:canSubmit?'var(--bg-page)':T.MUT, fontSize:16, fontWeight:700, cursor:canSubmit?'pointer':'not-allowed', opacity:submitting?0.7:1, transition:'background 0.15s, opacity 0.15s', flexShrink:0 }}>
            {submitting ? t('ui.提交中', '提交中...') : `✓ ${t('ui.提交此批次', '提交此鸡舍')}`}
          </button>
        )}
      </div>
    </div>
  );
}
