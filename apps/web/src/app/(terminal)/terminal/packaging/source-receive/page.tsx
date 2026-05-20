'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { crudApi } from '@/lib/api-client';
import { packagingApi } from '@/lib/packaging-api';
import { useTerminalContext } from '@/hooks/useTerminalContext';
import { T } from '@/styles/terminal-theme';
import TerminalNumPadPanel from '@/components/terminal/TerminalNumPadPanel';

const POLL_MS = 5000;
const LONG_PRESS_MS = 600;

const CORR_REASONS = [
  '数字输入错误（手误）',
  '设备故障重新计数',
  '漏记补录',
  '重复提交需更正',
  '其他原因',
] as const;

const CORR_REASON_I18N_KEYS: Record<string, string> = {
  '数字输入错误（手误）': 'ui.数字输入错误手误',
  '设备故障重新计数':     'ui.设备故障重新计数',
  '漏记补录':             'ui.漏记补录',
  '重复提交需更正':       'ui.重复提交需更正',
  '其他原因':             'ui.其他原因',
};

interface House { id: number; house_code: string; house_name: string; capacity?: number; }

interface CollectionRecord {
  houseCode: string;
  houseName: string;
  totalQty: number;
  dirtyQty: number;
  crackedQty: number;
  availableQty: number;
  submittedAt: string;
}

type NumField = 'total' | 'dirty' | 'cracked';

const FIELDS: { key: NumField; labelKey: string; labelFb: string; accent: string }[] = [
  { key: 'total',   labelKey: 'ui.总采集数',  labelFb: '总采集数（枚）', accent: T.GRN },
  { key: 'dirty',   labelKey: 'ui.脏蛋数',    labelFb: '脏蛋数（枚）',   accent: '#f97316' },
  { key: 'cracked', labelKey: 'ui.裂纹蛋数',  labelFb: '裂纹蛋数（枚）', accent: '#f97316' },
];

export default function EggCollectionPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const { ctx } = useTerminalContext();

  const [houses, setHouses]           = useState<House[]>([]);
  const [selectedHouse, setSelectedHouse] = useState<House | null>(null);
  const [totalQty, setTotalQty]       = useState('');
  const [dirtyQty, setDirtyQty]       = useState('');
  const [crackedQty, setCrackedQty]   = useState('');
  const [numPadField, setNumPadField] = useState<NumField>('total');
  const [records, setRecords]         = useState<CollectionRecord[]>([]);
  const [totalGradedToday, setTotalGradedToday] = useState(0);
  const [submitting, setSubmitting]   = useState(false);
  const [submitError, setSubmitError] = useState('');
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const lpTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 更正弹窗状态 ────────────────────────────────────────────────────────────
  const [corrTarget,  setCorrTarget]  = useState<CollectionRecord | null>(null);
  const [corrTotal,   setCorrTotal]   = useState('');
  const [corrDirty,   setCorrDirty]   = useState('');
  const [corrCracked, setCorrCracked] = useState('');
  const [corrField,   setCorrField]   = useState<NumField>('total');
  const [corrNumKey,  setCorrNumKey]  = useState(0);
  const [corrReason,  setCorrReason]  = useState('');
  const [corrBusy,    setCorrBusy]    = useState(false);
  const [corrError,   setCorrError]   = useState('');

  const startLongPress = (record: CollectionRecord) => {
    if (lpTimer.current) clearTimeout(lpTimer.current);
    lpTimer.current = setTimeout(() => {
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(60);
      setCorrTarget(record);
      setCorrTotal(record.totalQty > 0 ? String(record.totalQty) : '');
      setCorrDirty(record.dirtyQty > 0 ? String(record.dirtyQty) : '');
      setCorrCracked(record.crackedQty > 0 ? String(record.crackedQty) : '');
      setCorrField('total');
      setCorrNumKey(k => k + 1);
      setCorrReason('');
      setCorrError('');
    }, LONG_PRESS_MS);
  };
  const cancelLongPress = () => { if (lpTimer.current) clearTimeout(lpTimer.current); };

  const switchCorrField = (f: NumField) => { setCorrField(f); setCorrNumKey(k => k + 1); };

  const handleCorrect = async () => {
    if (!corrTarget || !corrReason || corrBusy) return;
    setCorrBusy(true);
    setCorrError('');
    try {
      await packagingApi.correctBatch({
        houseCode:      corrTarget.houseCode,
        productionDate: new Date().toISOString().slice(0, 10),
        totalQty:       parseInt(corrTotal)   || 0,
        dirtyQty:       parseInt(corrDirty)   || 0,
        crackedQty:     parseInt(corrCracked) || 0,
        reason:         corrReason,
      });
      setCorrTarget(null);
      void fetchRecords();
    } catch (e) {
      setCorrError((e as Error).message || t('ui.更正失败请重试', '更正失败，请重试'));
    } finally {
      setCorrBusy(false);
    }
  };

  const fetchRecords = useCallback(async () => {
    try {
      const rows = await packagingApi.getTodaySourceBatches();
      if (!Array.isArray(rows)) return;
      const graded = Number((rows[0] as Record<string, unknown>)?.total_graded_today ?? 0);
      setTotalGradedToday(graded);
      const grouped = new Map<string, CollectionRecord>();
      for (const r of (rows as Record<string, unknown>[])) {
        const houseCode = String(r.house_code ?? '');
        const entry: CollectionRecord = {
          houseCode,
          houseName:    String(r.house_name ?? r.house_code ?? ''),
          totalQty:     Number(r.total_qty ?? r.expected_qty ?? 0),
          dirtyQty:     Number(r.dirty_qty  ?? 0),
          crackedQty:   Number(r.cracked_qty ?? 0),
          availableQty: Number(r.received_qty ?? 0),
          submittedAt:  r.created_at
            ? new Date(String(r.created_at)).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
            : '',
        };
        const existing = grouped.get(houseCode);
        if (existing) {
          existing.totalQty    += entry.totalQty;
          existing.dirtyQty    += entry.dirtyQty;
          existing.crackedQty  += entry.crackedQty;
          existing.availableQty += entry.availableQty;
        } else {
          grouped.set(houseCode, entry);
        }
      }
      setRecords(Array.from(grouped.values()));
    } catch { /* 断网时保留上次数据 */ }
  }, []);

  useEffect(() => {
    crudApi.list<House>('brd_houses', { limit: 50 } as never)
      .then(res => setHouses(res.data || []))
      .catch(() => {});
    fetchRecords();
    pollRef.current = setInterval(fetchRecords, POLL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchRecords]);

  const total     = parseInt(totalQty)   || 0;
  const dirty     = parseInt(dirtyQty)   || 0;
  const cracked   = parseInt(crackedQty) || 0;
  const available = Math.max(0, total - dirty - cracked);

  const totalCollected = records.reduce((s, r) => s + r.totalQty, 0);
  const totalReceived  = records.reduce((s, r) => s + r.availableQty, 0);
  const totalAvailable = Math.max(0, totalReceived - totalGradedToday);

  const alreadyRecorded = selectedHouse ? records.some(r => r.houseCode === selectedHouse.house_code) : false;
  const defectExceedsTotal = total > 0 && (dirty + cracked) > total;
  const canSubmit = !!selectedHouse && total > 0 && !defectExceedsTotal;

  const fieldValues: Record<NumField, string> = { total: totalQty, dirty: dirtyQty, cracked: crackedQty };

  const selectHouse = (h: House) => {
    setSelectedHouse(h);
    setTotalQty('');
    setDirtyQty('');
    setCrackedQty('');
    setNumPadField('total');
  };

  const handleNumPadChange = (val: string) => {
    if (numPadField === 'total')   setTotalQty(val);
    if (numPadField === 'dirty')   setDirtyQty(val);
    if (numPadField === 'cracked') setCrackedQty(val);
  };

  const handleSubmit = async () => {
    if (!canSubmit || !selectedHouse) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const today = new Date().toISOString().slice(0, 10);
      await packagingApi.receiveBatch({
        houseCode:   selectedHouse.house_code,
        houseName:   selectedHouse.house_name,
        layDate:     today,
        totalQty:    total,
        dirtyQty:    dirty,
        crackedQty:  cracked,
        receivedQty: available,
        shiftId:     ctx.currentShift?.id ?? null,
      });
      void fetchRecords();
      setSelectedHouse(null);
      setTotalQty(''); setDirtyQty(''); setCrackedQty('');
      setNumPadField('total');
    } catch (e) {
      setSubmitError((e as Error).message || t('ui.提交失败请重试', '提交失败，请重试'));
    } finally {
      setSubmitting(false);
    }
  };

  const activeField  = FIELDS.find(f => f.key === numPadField)!;
  const numpadInitial = fieldValues[numPadField] || '';

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', background:T.BG, overflow:'hidden' }}>

      {/* Header */}
      <div style={{ background:T.CARD, borderBottom:`1px solid ${T.BOR}`, padding:'12px 20px', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
        <span style={{ fontSize:22 }}>🥚</span>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:17, fontWeight:700, color:T.TXT }}>{t('terminal.source_receive', '集蛋作业')}</div>
          <div style={{ fontSize:12, color:T.MUT }}>{t('ui.按鸡舍逐一录入今日集蛋数量', '按鸡舍逐一录入今日集蛋数量')}</div>
        </div>
        <div style={{ textAlign:'right', visibility: records.length > 0 ? 'visible' : 'hidden' }}>
          <div style={{ fontSize:22, fontWeight:800, color:T.GRN, fontVariantNumeric:'tabular-nums' }}>
            {totalAvailable.toLocaleString()}
          </div>
          <div style={{ fontSize:11, color:T.MUT }}>{t('ui.今日可分级枚', '今日可分级（枚）')}</div>
        </div>
      </div>

      {/* ── 三列主布局 ── */}
      <div style={{ flex:1, overflow:'hidden', display:'flex', minHeight:0 }}>

        {/* ① 左栏：鸡舍双列方块 */}
        <div style={{ width:300, flexShrink:0, borderRight:`1px solid ${T.BOR}`, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ padding:'10px 14px 6px', fontSize:11, color:T.MUT, fontWeight:700, letterSpacing:1.4, textTransform:'uppercase', flexShrink:0 }}>
            {t('ui.今日已录', '今日已录')} {records.length > 0 && `— ${records.length} / ${houses.length} ${t('ui.栋', '栋')}`}
          </div>

          <div style={{ flex:1, overflowY:'auto', padding:'6px 8px 8px' }}>
            {houses.length === 0 ? (
              <div style={{ color:T.MUT, fontSize:13, padding:'16px 6px' }}>…</div>
            ) : (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7 }}>
                {houses.map(h => {
                  const record     = records.find(r => r.houseCode === h.house_code);
                  const isSelected = selectedHouse?.house_code === h.house_code;
                  const isDone     = !!record;
                  const borderColor = isSelected ? T.ACC : isDone ? 'rgba(34,197,94,0.5)' : T.BOR;
                  const bg = isSelected ? `${T.ACC}18` : isDone ? 'rgba(34,197,94,0.07)' : T.CARD;
                  const nameColor = isSelected ? T.ACC : isDone ? T.GRN : T.TXT;
                  return (
                    <button type="button" key={h.id}
                      onPointerDown={() => {
                        if (isDone && record) startLongPress(record);
                        selectHouse(h);
                      }}
                      onPointerUp={cancelLongPress}
                      onPointerLeave={cancelLongPress}
                      onPointerCancel={cancelLongPress}
                      style={{ display:'flex', flexDirection:'column', alignItems:'flex-start', gap:4, padding:'10px 10px 10px', borderRadius:12, border:`1.5px solid ${borderColor}`, background:bg, cursor:'pointer', textAlign:'left', WebkitTapHighlightColor:'transparent', transition:'border-color 0.15s, background 0.15s', boxSizing:'border-box', minHeight:90, boxShadow: isSelected ? `0 0 0 2px ${T.ACC}33` : 'none' }}>
                      {/* 鸡舍名 + 状态点 */}
                      <div style={{ display:'flex', alignItems:'center', gap:5, width:'100%' }}>
                        <div style={{ width:7, height:7, borderRadius:'50%', flexShrink:0, background: isDone ? T.GRN : isSelected ? T.ACC : T.MUT }} />
                        <div style={{ fontSize:13, fontWeight:700, color:nameColor, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', flex:1 }}>
                          {h.house_name}
                        </div>
                      </div>
                      {/* 主数字 */}
                      {isDone ? (
                        <>
                          <div style={{ fontSize:22, fontWeight:900, color:T.GRN, fontVariantNumeric:'tabular-nums', lineHeight:1.1, letterSpacing:'-0.5px' }}>
                            {record!.availableQty.toLocaleString()}
                          </div>
                          <div style={{ fontSize:10, color:T.MUT, marginTop:'auto' }}>
                            {t('ui.采集', '采集')} {record!.totalQty.toLocaleString()}
                            {record!.dirtyQty > 0 && <span style={{ color:'#f97316', marginLeft:4 }}>脏{record!.dirtyQty}</span>}
                            {record!.crackedQty > 0 && <span style={{ color:'#f97316', marginLeft:4 }}>裂{record!.crackedQty}</span>}
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize:11, color:T.MUT, marginTop:4 }}>{t('ui.待录入', '待录入')}</div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {records.length > 0 && (
            <div style={{ borderTop:`1px solid ${T.BOR}`, padding:'10px 18px', flexShrink:0 }}>
              <div style={{ fontSize:11, color:T.MUT, whiteSpace:'nowrap' }}>{t('ui.今日合计', '今日合计')}</div>
              <div style={{ fontSize:20, fontWeight:800, color:T.GRN, fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap' }}>
                {totalAvailable.toLocaleString()} <span style={{ fontSize:12, fontWeight:400, color:T.MUT }}>{t('ui.枚', '枚')}</span>
              </div>
            </div>
          )}
        </div>

        {/* ② 中间栏：数量录入区 */}
        <div style={{ flex:1, overflow:'hidden', padding:'10px 10px 10px 12px', display:'flex', flexDirection:'column', gap:8, minHeight:0 }}>

          {!selectedHouse ? (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12, color:T.MUT }}>
              <span style={{ fontSize:36 }}>←</span>
              <span style={{ fontSize:15 }}>{t('ui.点击鸡舍开始录入', '点击左侧鸡舍开始录入')}</span>
            </div>
          ) : (
            <>
              {/* 字段卡片 */}
              <div style={{ flex:1, minHeight:0, display:'flex', flexDirection:'column', gap:0 }}>
                <div style={{ fontSize:12, color:T.MUT, fontWeight:700, marginBottom:6, letterSpacing:1.5, textTransform:'uppercase', flexShrink:0, whiteSpace:'nowrap' }}>
                  {t('ui.录入数量', 'Input Quantity')} — {selectedHouse.house_name}
                </div>
                <div style={{ flex:1, minHeight:0, display:'flex', flexDirection:'column', gap:6 }}>
                  {FIELDS.map(({ key, labelKey, labelFb, accent }) => {
                    const val = fieldValues[key];
                    const num = parseInt(val) || 0;
                    const isActive = numPadField === key;
                    return (
                      <button type="button" key={key}
                        onPointerDown={() => setNumPadField(key)}
                        style={{ flex:1, display:'flex', alignItems:'center', padding:'0 16px 0 0', overflow:'hidden', background: isActive ? `${accent}14` : num > 0 ? `${accent}07` : T.CARD, borderRadius:12, border:`1px solid ${isActive ? accent : num > 0 ? `${accent}40` : T.BOR}`, cursor:'pointer', transition:'border-color 0.15s, background 0.15s, box-shadow 0.15s', WebkitTapHighlightColor:'transparent', boxShadow: isActive ? `0 0 0 3px ${accent}22` : 'none' }}>
                        <div style={{ width:5, alignSelf:'stretch', flexShrink:0, background: isActive ? accent : num > 0 ? `${accent}55` : `${accent}18`, borderRadius:'10px 0 0 10px', transition:'background 0.15s' }} />
                        <div style={{ flex:1, padding:'0 14px', textAlign:'left', overflow:'hidden' }}>
                          <div style={{ fontSize:22, fontWeight:700, color: isActive ? accent : T.MUT, whiteSpace:'nowrap' }}>
                            {t(labelKey, labelFb)}
                          </div>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:3, flexShrink:0 }}>
                          <span style={{ fontSize:40, fontWeight:900, lineHeight:1, letterSpacing:'-1px', color: num > 0 ? accent : isActive ? `${accent}50` : T.BOR, fontVariantNumeric:'tabular-nums', minWidth:160, textAlign:'right' }}>
                            {num > 0 ? num.toLocaleString() : (isActive ? '0' : '—')}
                          </span>
                          <span style={{ fontSize:13, color:T.MUT, marginLeft:4 }}>{t('ui.枚', '枚')}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 平衡栏 */}
              <div style={{ background:T.CARD, borderRadius:12, padding:'12px 18px', border:`1px solid ${defectExceedsTotal ? T.RED : available > 0 ? 'rgba(34,197,94,0.4)' : T.BOR}`, display:'flex', alignItems:'center', gap:20, flexShrink:0, height:56, boxSizing:'border-box' }}>
                <div style={{ display:'flex', gap:24, alignItems:'center' }}>
                  <div>
                    <div style={{ fontSize:11, color:T.MUT, whiteSpace:'nowrap' }}>{t('ui.总采集数', '总采集')}</div>
                    <strong style={{ fontSize:16, color:T.TXT, fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap' }}>{total > 0 ? total.toLocaleString() : '—'}</strong>
                  </div>
                  <span style={{ color:T.MUT, fontSize:16 }}>−</span>
                  <div>
                    <div style={{ fontSize:11, color:T.MUT, whiteSpace:'nowrap' }}>{t('ui.脏蛋数', '脏')}+{t('ui.裂纹蛋数', '裂')}</div>
                    <strong style={{ fontSize:16, color:(dirty+cracked) > 0 ? '#f97316' : T.MUT, fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap' }}>{dirty+cracked > 0 ? (dirty+cracked).toLocaleString() : '0'}</strong>
                  </div>
                  <span style={{ color:T.MUT, fontSize:16 }}>=</span>
                  <div>
                    <div style={{ fontSize:11, color:T.MUT, whiteSpace:'nowrap' }}>{t('ui.可分级', '可分级')}</div>
                    <strong style={{ fontSize:16, color: available > 0 ? T.GRN : T.MUT, fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap' }}>{total > 0 ? available.toLocaleString() : '—'}</strong>
                  </div>
                </div>
                <div style={{ flex:1 }} />
                {defectExceedsTotal && (
                  <div style={{ color:T.RED, fontSize:13, fontWeight:600, whiteSpace:'nowrap' }}>⚠️ {t('ui.脏蛋裂纹超过总数', '脏蛋+裂纹超过总数')}</div>
                )}
                {alreadyRecorded && !defectExceedsTotal && (
                  <div style={{ color:'#f59e0b', fontSize:12, whiteSpace:'nowrap' }}>ℹ️ {t('ui.今日已有记录将累加', '将累加')}</div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ③ 右栏：数字键盘 */}
        <TerminalNumPadPanel
          label={t('ui.当前录入', '当前录入')}
          value={t(activeField.labelKey, activeField.labelFb)}
          accentColor={activeField.accent}
          numpadKey={numPadField}
          numpadInitial={numpadInitial}
          onChange={handleNumPadChange}
          disabled={!selectedHouse}
          warning={!selectedHouse ? `← ${t('ui.请先选择鸡舍', '请先选择鸡舍')}` : undefined}
        />
      </div>

      {/* ── 更正弹窗 ── */}
      {corrTarget && (() => {
        const ct = parseInt(corrTotal)   || 0;
        const cd = parseInt(corrDirty)   || 0;
        const cc = parseInt(corrCracked) || 0;
        const newAvail = Math.max(0, ct - cd - cc);
        const corrFieldValues: Record<NumField, string> = { total: corrTotal, dirty: corrDirty, cracked: corrCracked };
        const corrActiveField = FIELDS.find(f => f.key === corrField)!;
        const canConfirm = !!corrReason && !corrBusy;
        return (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.78)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300 }}>
            <div style={{ background:'#0d1e35', borderRadius:18, border:`1px solid ${T.BOR}`, width:'min(800px, 96vw)', maxHeight:'90vh', overflow:'hidden', display:'flex', flexDirection:'column' }}>
              <div style={{ padding:'16px 24px', borderBottom:`1px solid ${T.BOR}`, display:'flex', alignItems:'center', gap:12 }}>
                <span style={{ fontSize:22 }}>✏️</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:17, fontWeight:700, color:T.TXT }}>{t('ui.更正记录', '更正记录')} — {corrTarget.houseName}</div>
                  <div style={{ fontSize:12, color:T.MUT }}>
                    {t('ui.更正前', '更正前')}：{t('ui.采集', '采集')} {corrTarget.totalQty.toLocaleString()}
                    {corrTarget.dirtyQty > 0 ? `  脏 ${corrTarget.dirtyQty}` : ''}
                    {corrTarget.crackedQty > 0 ? `  裂 ${corrTarget.crackedQty}` : ''}
                    　→　{t('ui.可分级', '可分级')} {corrTarget.availableQty.toLocaleString()}
                  </div>
                </div>
              </div>
              <div style={{ flex:1, overflow:'hidden', display:'flex', minHeight:0 }}>
                <div style={{ flex:1, padding:'16px 20px', display:'flex', flexDirection:'column', gap:10, overflowY:'auto' }}>
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {FIELDS.map(({ key, labelKey, labelFb, accent }) => {
                      const val = corrFieldValues[key];
                      const isActive = corrField === key;
                      return (
                        <button type="button" key={key} onPointerDown={() => switchCorrField(key)}
                          style={{ display:'flex', alignItems:'center', gap:12, background: isActive ? `${accent}12` : T.CARD, borderRadius:10, padding:'10px 14px', border:`2px solid ${isActive ? accent : val && val !== '0' ? accent + '50' : T.BOR}`, cursor:'pointer', textAlign:'left', transition:'border-color 0.12s, background 0.12s', WebkitTapHighlightColor:'transparent' }}>
                          <div style={{ width:10, height:10, borderRadius:'50%', background: isActive ? accent : T.BOR, flexShrink:0 }} />
                          <div style={{ flex:1, fontSize:15, color: isActive ? accent : T.MUT, fontWeight:600 }}>{t(labelKey, labelFb)}</div>
                          <div style={{ fontSize:36, fontWeight:900, lineHeight:1, color: val && val !== '0' ? accent : isActive ? `${accent}50` : T.BOR, fontVariantNumeric:'tabular-nums', width:120, textAlign:'right' }}>{val || '0'}</div>
                          <div style={{ fontSize:13, color:T.MUT, width:20 }}>{t('ui.枚', '枚')}</div>
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ background: newAvail > 0 ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.03)', border:`2px solid ${newAvail > 0 ? 'rgba(34,197,94,0.4)' : T.BOR}`, borderRadius:10, padding:'10px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <span style={{ fontSize:13, color:T.MUT }}>{t('ui.更正后可分级', '更正后可分级')}</span>
                    <div style={{ display:'flex', alignItems:'baseline', gap:6 }}>
                      <span style={{ fontSize:32, fontWeight:900, color: newAvail > 0 ? T.GRN : T.BOR, fontVariantNumeric:'tabular-nums' }}>{newAvail.toLocaleString()}</span>
                      <span style={{ fontSize:13, color:T.MUT }}>{t('ui.枚', '枚')}</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize:12, color:T.MUT, fontWeight:700, marginBottom:8, letterSpacing:1.2, textTransform:'uppercase' }}>
                      {t('ui.更正原因', '更正原因')} *
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                      {CORR_REASONS.map(r => (
                        <button type="button" key={r} onPointerDown={() => setCorrReason(r)}
                          style={{ padding:'10px 14px', borderRadius:8, cursor:'pointer', textAlign:'left', border:`2px solid ${corrReason === r ? T.ACC : T.BOR}`, background: corrReason === r ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.03)', color: corrReason === r ? T.ACC : T.TXT, fontSize:13, transition:'border-color 0.12s, background 0.12s', WebkitTapHighlightColor:'transparent' }}>
                          {t(CORR_REASON_I18N_KEYS[r] ?? r, r)}
                        </button>
                      ))}
                    </div>
                  </div>
                  {corrError && (
                    <div style={{ fontSize:13, color:T.RED, padding:'8px 12px', background:'rgba(239,68,68,0.1)', borderRadius:6 }}>⚠ {corrError}</div>
                  )}
                </div>
                <TerminalNumPadPanel
                  label={t('ui.当前录入', '当前录入')}
                  value={t(corrActiveField.labelKey, corrActiveField.labelFb)}
                  accentColor={corrActiveField.accent}
                  numpadKey={`corr-${corrField}-${corrNumKey}`}
                  numpadInitial={corrFieldValues[corrField]}
                  onChange={val => {
                    if (corrField === 'total')   setCorrTotal(val);
                    if (corrField === 'dirty')   setCorrDirty(val);
                    if (corrField === 'cracked') setCorrCracked(val);
                  }}
                />
              </div>
              <div style={{ padding:'14px 20px', borderTop:`1px solid ${T.BOR}`, display:'flex', gap:10 }}>
                <button type="button" onPointerDown={() => { setCorrTarget(null); setCorrError(''); }}
                  style={{ flex:1, padding:'14px', borderRadius:10, border:`1px solid ${T.BOR}`, background:'transparent', color:T.MUT, fontSize:15, cursor:'pointer' }}>
                  {t('common.cancel', '取消')}
                </button>
                <button type="button" onPointerDown={handleCorrect} disabled={!canConfirm}
                  style={{ flex:2, padding:'14px', borderRadius:10, border:'none', background: canConfirm ? T.ACC : T.BOR, color: canConfirm ? '#0f172a' : T.MUT, fontSize:15, fontWeight:700, cursor: canConfirm ? 'pointer' : 'not-allowed', opacity: corrBusy ? 0.7 : 1, transition:'background 0.15s, opacity 0.15s' }}>
                  {corrBusy ? t('ui.提交中', '提交中...') : `✓ ${t('ui.确认更正', '确认更正')}`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Bottom bar */}
      <div style={{ background:T.CARD, borderTop:`1px solid ${T.BOR}`, padding:'17px 16px', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <button type="button" onClick={() => router.push('/terminal/packaging/dashboard')}
          style={{ padding:'9px 20px', borderRadius:10, border:`1px solid ${T.BOR}`, background:'transparent', color:T.MUT, fontSize:15, cursor:'pointer' }}>
          {t('common.back', '返回')}
        </button>
        <button type="button" onClick={handleSubmit} disabled={!canSubmit || submitting}
          style={{ padding:'9px 40px', borderRadius:10, border:'none', background: canSubmit ? T.ACC : T.BOR, color: canSubmit ? '#0f172a' : T.MUT, fontSize:16, fontWeight:700, cursor: canSubmit ? 'pointer' : 'not-allowed', opacity: submitting ? 0.7 : 1, minWidth:220, transition:'background 0.15s, opacity 0.15s' }}>
          {submitting ? t('ui.提交中', '提交中...') : `✓ ${t('ui.确认录入', '确认录入')} ${selectedHouse?.house_name ?? ''}`}
        </button>
        <div style={{ flex:1 }}>
          {submitError && <div style={{ fontSize:13, color:T.RED, fontWeight:600 }}>⚠️ {submitError}</div>}
          {canSubmit && records.length > 0 && (
            <div style={{ fontSize:12, color:T.ACC, fontWeight:600 }}>
              ⚠ {t('ui.请先确认录入当前鸡舍', '请先确认录入当前鸡舍数据')}
            </div>
          )}
        </div>
        {records.length > 0 && (
          <button type="button" disabled={canSubmit}
            onClick={() => !canSubmit && router.push('/terminal/packaging/grading')}
            style={{ padding:'9px 40px', borderRadius:10, border:'none', outline: canSubmit ? `1px solid ${T.ACC}` : 'none', outlineOffset:'-1px', background: canSubmit ? 'transparent' : T.GRN, color: canSubmit ? T.ACC : '#0f172a', fontSize:16, fontWeight:700, cursor: canSubmit ? 'not-allowed' : 'pointer', opacity: canSubmit ? 0.6 : 1, flexShrink:0, transition:'background 0.15s, color 0.15s, opacity 0.15s' }}>
            {t('ui.进入分级作业', '进入分级作业')} ({totalAvailable.toLocaleString()} {t('ui.枚', '枚')}) →
          </button>
        )}
      </div>
    </div>
  );
}
