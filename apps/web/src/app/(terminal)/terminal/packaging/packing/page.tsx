'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTerminalContext } from '@/hooks/useTerminalContext';
import { packagingApi } from '@/lib/packaging-api';
import { usePackagingDicts, buildGradeMap, FALLBACK_DICTS, getDictLabel } from '@/hooks/usePackagingDicts';
import { T } from '@/styles/terminal-theme';
import TerminalNumPadPanel from '@/components/terminal/TerminalNumPadPanel';

const SALEABLE_PALETTE = ['#7c3aed', '#2563eb', '#059669', '#d97706', '#f97316', '#ec4899', '#14b8a6'];
const DEFECT_PALETTE   = ['#f97316', '#ef4444', '#6b7280', '#0891b2'];
const POLL_MS = 5000;

type GradingSnapshot = {
  gradingCodes: string[];
  outputs:      Record<string, number>;
  packed:       Record<string, number>;
  remaining:    Record<string, number>;
};

type PackingItem = {
  grade:  string;
  spec:   string;
  specId: string;
  boxes:  number;
  eggs:   number;
};

export default function PackingPage() {
  const router = useRouter();
  const { t, lang } = useLanguage();
  const { setPackingResult, ctx } = useTerminalContext();

  // ── 字典 ──────────────────────────────────────────────────────────────────
  const { dicts } = usePackagingDicts(['PKG_EGG_GRADE', 'PKG_EGG_DEFECT', 'PKG_PACK_SPEC']);
  const saleableItems = dicts.PKG_EGG_GRADE  ?? FALLBACK_DICTS.PKG_EGG_GRADE;
  const defectItems   = dicts.PKG_EGG_DEFECT ?? FALLBACK_DICTS.PKG_EGG_DEFECT;
  const allGradeItems = [...saleableItems, ...defectItems];
  const gradeMap      = buildGradeMap(allGradeItems);
  const gradeColorMap = Object.fromEntries([
    ...saleableItems.map((d, i) => [d.code, (d.color as string) || SALEABLE_PALETTE[i % SALEABLE_PALETTE.length]]),
    ...defectItems  .map((d, i) => [d.code, (d.color as string) || DEFECT_PALETTE[i   % DEFECT_PALETTE.length]]),
  ]);
  const SPECS = (dicts.PKG_PACK_SPEC ?? FALLBACK_DICTS.PKG_PACK_SPEC).map(d => ({
    id:    d.code,
    name:  getDictLabel(d, lang),
    qty:   (d.qty as number) ?? 0,
    unit:  (d.unit  as string) ?? t('ui.枚', '枚'),
    icon:  (d.icon  as string) ?? '📦',
    color: (d.color as string) ?? '#7c3aed',
  }));

  // ── 服务端实时快照（5 s 心跳） ────────────────────────────────────────────
  const [snap, setSnap]           = useState<GradingSnapshot | null>(null);
  const [snapLoading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSnap = async () => {
    try {
      const data = await packagingApi.getActiveGrading();
      setSnap(data ?? null);
    } catch { /* 保留上次快照，短暂断网不清空 */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchSnap();
    pollRef.current = setInterval(fetchSnap, POLL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // ── 服务端剩余（snap.remaining 已减去所有终端已包装量） ───────────────────
  const serverRemaining = snap?.remaining ?? {};
  const gradingCodes    = snap?.gradingCodes ?? [];

  // ── 本端临时扣减（已添加但未提交的箱次） ─────────────────────────────────
  const [items,        setItems]        = useState<PackingItem[]>([]);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [selectedSpec,  setSelectedSpec]  = useState<typeof SPECS[0] | null>(null);
  const [boxCount,      setBoxCount]      = useState('');
  const [numpadKey,     setNumpadKey]     = useState(0);
  const [submitting,    setSubmitting]    = useState(false);
  const [submitError,   setSubmitError]   = useState('');
  const [done,          setDone]          = useState(false);

  const localPacked = items.reduce<Record<string, number>>((acc, b) => {
    acc[b.grade] = (acc[b.grade] || 0) + b.eggs;
    return acc;
  }, {});

  // 对每个等级：服务端剩余 - 本端临时 = 实际可用
  const remaining = Object.fromEntries(
    allGradeItems.map(d => [
      d.code,
      Math.max(0, (serverRemaining[d.code] ?? 0) - (localPacked[d.code] || 0)),
    ])
  );

  const boxes           = parseInt(boxCount) || 0;
  const eggs            = boxes * (selectedSpec?.qty || 0);
  const eggsAvailable   = selectedGrade ? (remaining[selectedGrade] ?? 0) : 0;
  const canAdd          = !!(selectedGrade && selectedSpec && boxes > 0 && eggs > 0 && eggs <= eggsAvailable);

  const handleSelectGrade = (code: string) => {
    setSelectedGrade(code);
    setBoxCount('');
    setNumpadKey(k => k + 1);
  };

  const handleAdd = () => {
    if (!canAdd || !selectedGrade || !selectedSpec) return;
    setItems(prev => {
      const idx = prev.findIndex(b => b.grade === selectedGrade && b.specId === selectedSpec.id);
      if (idx >= 0) return prev.map((b, i) => i === idx ? { ...b, boxes: b.boxes + boxes, eggs: b.eggs + eggs } : b);
      return [...prev, { grade: selectedGrade, spec: selectedSpec.name, specId: selectedSpec.id, boxes, eggs }];
    });
    setBoxCount('');
    setNumpadKey(k => k + 1);
  };

  const handleFinish = async () => {
    if (items.length === 0) return;
    if (!ctx.currentShift || ctx.currentShift.status !== 'OPEN') {
      setSubmitError(t('ui.请先开班再提交包装记录', '请先开班再提交包装记录'));
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await packagingApi.submitPacking({
        gradingCodes:    gradingCodes,
        gradingCode:     gradingCodes[0] ?? null,
        productionDate:  today,
        batches:         items,
        shiftId:         ctx.currentShift?.id ?? null,
      });
      setPackingResult(res.code, items);
      void fetchSnap();
      setDone(true);
      setTimeout(() => router.push('/terminal/packaging/label-print'), 1500);
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : t('ui.提交失败请重试', '提交失败，请重试'));
    } finally {
      setSubmitting(false);
    }
  };

  const totalBoxes = items.reduce((a, b) => a + b.boxes, 0);
  const totalEggs  = items.reduce((a, b) => a + b.eggs,  0);

  // ── 加载 / 完成 ───────────────────────────────────────────────────────────
  if (snapLoading) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.BG, gap: 12 }}>
      <div style={{ width: 26, height: 26, border: `3px solid ${T.BOR}`, borderTopColor: T.ACC, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <span style={{ color: T.MUT, fontSize: 14 }}>{t('ui.加载分级数据', '正在加载分级数据...')}</span>
    </div>
  );

  if (done) return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: T.BG, gap: 16, animation: 'packing_done_in 0.25s ease-out' }}>
      <style>{`@keyframes packing_done_in { from { opacity: 0; transform: scale(0.97) } to { opacity: 1; transform: scale(1) } }`}</style>
      <div style={{ fontSize: 64 }}>✅</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: T.GRN }}>{t('ui.包装完成', '包装完成')}</div>
      <div style={{ color: T.MUT }}>{totalBoxes} {t('ui.箱', '箱')} · {totalEggs.toLocaleString()} {t('ui.枚', '枚')}，{t('ui.正在打印标签', '正在打印标签...')}</div>
    </div>
  );

  // ── 主界面 ────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.BG, overflow: 'hidden' }}>
      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes _pkg_blink{0%,49%{opacity:1}50%,100%{opacity:0}}
        ._pkg_cursor{display:inline-block;width:3px;border-radius:2px;margin-left:5px;vertical-align:middle;animation:_pkg_blink 1s step-end infinite;}
      `}</style>

      {/* Header */}
      <div style={{ background: T.CARD, borderBottom: `1px solid ${T.BOR}`, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span style={{ fontSize: 22 }}>📦</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: T.TXT }}>{t('terminal.packing', '包装作业')}</div>
          <div style={{ fontSize: 12, color: T.MUT }}>
            {gradingCodes.length > 0
              ? `${gradingCodes.length} ${t('ui.批分级数据实时同步', '批分级数据 · 实时同步')}`
              : t('ui.等待分级数据', '等待分级数据...')}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: T.ACC, fontVariantNumeric: 'tabular-nums' }}>{totalBoxes}</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
            <span style={{ fontSize: 11, color: T.MUT }}>{t('ui.本次已包装', '本次已包装（箱）')}</span>
            <span style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block', flexShrink: 0,
              background: snap ? '#22c55e' : '#6b7280',
              animation: snap ? 'pulse 2s ease-in-out infinite' : 'none' }} />
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>

        {/* ── Col 1: 等级列表（全量字典，实时累积剩余量） ── */}
        <div style={{ width: 270, flexShrink: 0, borderRight: `1px solid ${T.BOR}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* 可售等级 */}
          <div style={{ padding: '8px 12px 4px', fontSize: 10, color: T.MUT, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', flexShrink: 0 }}>
            {t('ui.可售等级', '可售等级')}
          </div>
          <div style={{ flex: 2, minHeight: 0, overflowY: 'auto', padding: '0 8px 4px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {saleableItems.map((d, i) => {
                const color      = (d.color as string) || SALEABLE_PALETTE[i % SALEABLE_PALETTE.length];
                const rem        = remaining[d.code] ?? 0;
                const total      = snap?.outputs?.[d.code] ?? 0;
                const isSelected = selectedGrade === d.code;
                const hasData    = total > 0;
                return (
                  <button type="button" key={d.code}
                    onPointerDown={() => rem > 0 && handleSelectGrade(d.code)}
                    style={{
                      display: 'flex', alignItems: 'center', width: '100%',
                      background: isSelected ? `${color}18` : hasData ? `${color}08` : T.CARD,
                      border: `1px solid ${isSelected ? color : hasData ? `${color}35` : T.BOR}`,
                      borderRadius: 9, cursor: rem > 0 ? 'pointer' : 'default',
                      padding: '0 12px 0 0', overflow: 'hidden',
                      opacity: !hasData ? 0.45 : rem === 0 ? 0.55 : 1,
                      transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s, opacity 0.15s',
                      boxShadow: isSelected ? `0 0 0 2px ${color}28` : 'none',
                      WebkitTapHighlightColor: 'transparent',
                    }}>
                    <div style={{ width: 4, alignSelf: 'stretch', flexShrink: 0,
                      background: isSelected ? color : hasData ? `${color}60` : `${color}20`,
                      borderRadius: '8px 0 0 8px' }} />
                    <div style={{ flex: 1, padding: '9px 10px', textAlign: 'left', minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: isSelected ? color : hasData ? color : T.MUT, lineHeight: 1.2 }}>
                        {getDictLabel(d, lang)}
                      </div>
                      {!!(d.weightRange as string) && (
                        <div style={{ fontSize: 10, color: T.MUT, marginTop: 1 }}>{d.weightRange as string}</div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 65 }}>
                      {/* 剩余量（大字） */}
                      <div style={{ fontSize: 18, fontWeight: 900, lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                        color: rem === 0 ? T.MUT : isSelected ? color : T.TXT }}>
                        {rem === 0 && total > 0 ? '✓' : rem > 0 ? rem.toLocaleString() : '—'}
                      </div>
                      {/* 分级总量（小字） */}
                      <div style={{ fontSize: 10, color: T.MUT, fontVariantNumeric: 'tabular-nums', visibility: total > 0 ? 'visible' : 'hidden' }}>
                        /{total > 0 ? total.toLocaleString() : '0'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 缺陷/损耗 */}
          <div style={{ padding: '6px 12px 4px', fontSize: 10, color: T.MUT, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', borderTop: `1px solid ${T.BOR}`, flexShrink: 0 }}>
            {t('ui.缺陷损耗', '缺陷 / 损耗')}
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 8px 8px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {defectItems.map((d, i) => {
                const color      = (d.color as string) || DEFECT_PALETTE[i % DEFECT_PALETTE.length];
                const rem        = remaining[d.code] ?? 0;
                const total      = snap?.outputs?.[d.code] ?? 0;
                const isSelected = selectedGrade === d.code;
                const hasData    = total > 0;
                return (
                  <button type="button" key={d.code}
                    onPointerDown={() => rem > 0 && handleSelectGrade(d.code)}
                    style={{
                      display: 'flex', alignItems: 'center', width: '100%',
                      background: isSelected ? `${color}14` : T.CARD,
                      border: `1px solid ${isSelected ? color : T.BOR}`,
                      borderRadius: 8, cursor: rem > 0 ? 'pointer' : 'default',
                      padding: '0 10px 0 0', overflow: 'hidden',
                      opacity: !hasData ? 0.35 : rem === 0 ? 0.5 : 1,
                      transition: 'border-color 0.15s, background 0.15s, opacity 0.15s',
                      WebkitTapHighlightColor: 'transparent',
                    }}>
                    <div style={{ width: 3, alignSelf: 'stretch', flexShrink: 0,
                      background: isSelected ? color : `${color}40`,
                      borderRadius: '7px 0 0 7px' }} />
                    <div style={{ flex: 1, padding: '7px 10px', textAlign: 'left' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: isSelected ? color : hasData ? T.TXT : T.MUT }}>
                        {getDictLabel(d, lang)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 55 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: rem === 0 && total > 0 ? T.MUT : color, fontVariantNumeric: 'tabular-nums' }}>
                        {rem === 0 && total > 0 ? '✓' : rem > 0 ? rem.toLocaleString() : '—'}
                      </div>
                      <div style={{ fontSize: 10, color: T.MUT, fontVariantNumeric: 'tabular-nums', visibility: total > 0 ? 'visible' : 'hidden' }}>
                        /{total > 0 ? total.toLocaleString() : '0'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Col 2: 规格 + 添加 + 记录 ── */}
        <div style={{ flex: 1, overflow: 'hidden', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* ① 选规格 */}
          <div style={{ background: T.CARD, borderRadius: 12, padding: 12, border: `1px solid ${T.BOR}`, flexShrink: 0 }}>
            <div style={{ fontSize: 11, color: T.MUT, marginBottom: 8, fontWeight: 700, letterSpacing: 1 }}>
              ① {t('ui.选择包装规格', '选择包装规格')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {SPECS.map(spec => (
                <button type="button" key={spec.id} onPointerDown={() => { setSelectedSpec(spec); setBoxCount(''); setNumpadKey(k => k + 1); }}
                  style={{
                    padding: '9px 10px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                    border: `2px solid ${selectedSpec?.id === spec.id ? spec.color : T.BOR}`,
                    background: selectedSpec?.id === spec.id ? `${spec.color}15` : 'rgba(255,255,255,0.03)',
                    display: 'flex', alignItems: 'center', gap: 7,
                    WebkitTapHighlightColor: 'transparent',
                  }}>
                  <span style={{ fontSize: 20 }}>{spec.icon}</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: selectedSpec?.id === spec.id ? spec.color : T.TXT }}>
                      {spec.name}
                    </div>
                    {spec.qty > 0 && <div style={{ fontSize: 10, color: T.MUT }}>{spec.qty} {spec.unit}/{t('ui.箱', '箱')}</div>}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ② 确认添加 */}
          <div style={{ background: T.CARD, borderRadius: 12, padding: 16, border: `1px solid ${T.BOR}`, flexShrink: 0 }}>
            <div style={{ fontSize: 11, color: T.MUT, marginBottom: 10, fontWeight: 700, letterSpacing: 1 }}>
              ② {t('ui.确认添加', '确认添加')}
            </div>

            {/* 规格备注 — 固定高度防抖 */}
            <div style={{ height: 20, marginBottom: 8, display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
              {selectedGrade && selectedSpec ? (
                <span style={{ fontSize: 12 }}>
                  <span style={{ color: gradeColorMap[selectedGrade] ?? T.ACC, fontWeight: 700 }}>
                    {getDictLabel(gradeMap[selectedGrade], lang) || selectedGrade}
                  </span>
                  <span style={{ color: T.MUT }}> · {selectedSpec.icon} {selectedSpec.name}（{selectedSpec.qty} {t('ui.枚每箱', '枚/箱')}）</span>
                </span>
              ) : (
                <span style={{ fontSize: 12, color: T.MUT }}>
                  {!selectedGrade ? `← ${t('ui.先点击左侧等级', '先点击左侧等级')}` : !selectedSpec ? t('ui.请选规格', '请选择包装规格') : t('ui.请输入箱数', '请输入箱数')}
                </span>
              )}
            </div>

            {/* 大数字显示框 — 固定高度防抖 */}
            {(() => {
              const activeColor = selectedGrade ? (gradeColorMap[selectedGrade] ?? T.ACC) : T.ACC;
              return (
                <div style={{
                  background: 'rgba(255,255,255,0.05)', borderRadius: 10,
                  border: `1px solid ${selectedGrade && selectedSpec ? activeColor + '50' : T.BOR}`,
                  height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 10, overflow: 'hidden',
                }}>
                  <span style={{
                    fontSize: 60, fontWeight: 900, lineHeight: 1,
                    color: selectedGrade && selectedSpec ? activeColor : T.MUT,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {boxCount || '0'}
                  </span>
                  <span
                    className="_pkg_cursor"
                    style={{
                      height: 52, width: 3,
                      background: selectedGrade && selectedSpec ? activeColor : T.MUT,
                    }}
                  />
                  <span style={{ fontSize: 20, color: T.MUT, marginLeft: 10 }}>{t('ui.箱', '箱')}</span>
                </div>
              );
            })()}

            {/* 计算过程 — 固定高度防抖 */}
            <div style={{
              background: 'rgba(0,0,0,0.25)', borderRadius: 8,
              height: 44, marginBottom: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
            }}>
              {selectedGrade && selectedSpec && boxes > 0 ? (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'nowrap' }}>
                  <span style={{ fontSize: 15, fontVariantNumeric: 'tabular-nums', color: T.TXT }}>{boxes}</span>
                  <span style={{ fontSize: 12, color: T.MUT }}>{t('ui.箱', '箱')}</span>
                  <span style={{ fontSize: 14, color: T.MUT }}>×</span>
                  <span style={{ fontSize: 15, fontVariantNumeric: 'tabular-nums', color: T.TXT }}>{selectedSpec.qty}</span>
                  <span style={{ fontSize: 12, color: T.MUT }}>{t('ui.枚每箱', '枚/箱')}</span>
                  <span style={{ fontSize: 14, color: T.MUT }}>=</span>
                  <span style={{ fontSize: 20, fontWeight: 900, fontVariantNumeric: 'tabular-nums',
                    color: eggs > eggsAvailable ? T.RED : T.GRN }}>
                    {eggs.toLocaleString()}
                  </span>
                  <span style={{ fontSize: 12, color: T.MUT }}>{t('ui.枚', '枚')}</span>
                  {eggs > eggsAvailable && (
                    <span style={{ fontSize: 11, color: T.RED, marginLeft: 4 }}>⚠ {t('ui.超过余量', '超过余量')}</span>
                  )}
                </div>
              ) : (
                <span style={{ fontSize: 13, color: T.MUT }}>—</span>
              )}
            </div>

            <button type="button" onPointerDown={handleAdd} disabled={!canAdd}
              style={{
                width: '100%', height: 52, borderRadius: 10, border: 'none',
                background: canAdd ? T.GRN : T.BOR,
                color: canAdd ? '#0f172a' : T.MUT,
                fontSize: 17, fontWeight: 800, cursor: canAdd ? 'pointer' : 'not-allowed',
                transition: 'background 0.15s', WebkitTapHighlightColor: 'transparent',
              }}>
              {canAdd ? `＋ ${t('ui.添加此批次', '添加此批次')}` : t('ui.请完成上方选择', '请完成选择')}
            </button>
          </div>

          {/* 已包装记录 */}
          <div style={{ flex: 1, minHeight: 0, background: T.CARD, borderRadius: 12, border: `1px solid ${T.BOR}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '7px 12px', fontSize: 10, color: T.MUT, fontWeight: 700, letterSpacing: 1.5, borderBottom: `1px solid ${T.BOR}`, textTransform: 'uppercase', flexShrink: 0 }}>
              {t('ui.本次包装记录', '本次包装记录')}（{items.length}）
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: 7 }}>
              {items.length === 0 ? (
                <div style={{ color: T.MUT, fontSize: 12, textAlign: 'center', padding: '18px 0' }}>
                  {t('common.no_data', '暂无记录')}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {items.map((b, i) => {
                    const bColor = gradeColorMap[b.grade] ?? T.ACC;
                    return (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center',
                        background: 'rgba(255,255,255,0.04)', borderRadius: 7, padding: '8px 10px',
                        borderLeft: `3px solid ${bColor}`, gap: 8,
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: bColor }}>{getDictLabel(gradeMap[b.grade], lang) || b.grade}</div>
                          <div style={{ fontSize: 10, color: T.MUT }}>{b.spec}</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: T.TXT, fontVariantNumeric: 'tabular-nums' }}>
                            {b.boxes} {t('ui.箱', '箱')}
                          </div>
                          <div style={{ fontSize: 10, color: T.MUT, fontVariantNumeric: 'tabular-nums' }}>
                            {b.eggs.toLocaleString()} {t('ui.枚', '枚')}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Col 3: NumPad ── */}
        <TerminalNumPadPanel
          label={t('ui.本次包装箱数', '本次包装箱数')}
          value={boxCount || '0'}
          accentColor={selectedGrade ? (gradeColorMap[selectedGrade] ?? T.ACC) : (selectedSpec?.color ?? T.ACC)}
          numpadKey={numpadKey}
          numpadInitial=""
          onChange={val => setBoxCount(val)}
          disabled={!selectedGrade || !selectedSpec}
          hideDisplay
        />
      </div>

      {/* Bottom bar */}
      <div style={{ background: T.CARD, borderTop: `1px solid ${T.BOR}`, padding: '17px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button type="button" onClick={() => router.push('/terminal/packaging/dashboard')}
          style={{ padding: '9px 20px', borderRadius: 10, border: `1px solid ${T.BOR}`, background: 'transparent', color: T.MUT, fontSize: 15, cursor: 'pointer' }}>
          {t('common.back', '返回')}
        </button>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, color: T.MUT, fontVariantNumeric: 'tabular-nums' }}>
            {t('ui.合计', '合计')} {totalBoxes} {t('ui.箱', '箱')} · {totalEggs.toLocaleString()} {t('ui.枚', '枚')}
          </span>
          {submitError && (
            <span style={{ fontSize: 12, color: T.RED }}>⚠ {submitError}</span>
          )}
        </div>
        <button type="button" onClick={handleFinish} disabled={items.length === 0 || submitting || !ctx.currentShift || ctx.currentShift.status !== 'OPEN'}
          style={{
            padding: '9px 40px', borderRadius: 10, border: 'none',
            background: items.length > 0 ? T.GRN : T.BOR,
            color: items.length > 0 ? '#0f172a' : T.MUT,
            fontSize: 16, fontWeight: 700,
            cursor: items.length > 0 ? 'pointer' : 'not-allowed',
            opacity: submitting ? 0.7 : 1,
            minWidth: 230,
            transition: 'background 0.15s, opacity 0.15s',
          }}>
          {submitting ? t('ui.提交中', '提交中...') : `✓ ${t('ui.完成包装打印标签', '完成包装 → 打印标签')}`}
        </button>
      </div>
    </div>
  );
}
