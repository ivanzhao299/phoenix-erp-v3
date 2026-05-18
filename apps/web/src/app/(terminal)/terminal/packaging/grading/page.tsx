'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTerminalContext } from '@/hooks/useTerminalContext';
import { packagingApi } from '@/lib/packaging-api';
import { usePackagingDicts, buildGradeMap, FALLBACK_DICTS } from '@/hooks/usePackagingDicts';
import { T } from '@/styles/terminal-theme';
import NumPad from '@/components/terminal/NumPad';

const LANG_LABELS: Record<string, string> = { zh: '中', en: 'EN', lo: 'ລາວ' };
const LANG_ORDER = ['zh', 'en', 'lo'];

function LangToggle() {
  const { lang, setAppLanguage } = useLanguage();
  return (
    <div style={{
      display: 'flex', borderRadius: 8, overflow: 'hidden',
      border: `1px solid ${T.BOR}`, flexShrink: 0,
    }}>
      {LANG_ORDER.map(l => (
        <button key={l} type="button"
          onPointerDown={() => setAppLanguage(l)}
          style={{
            padding: '6px 11px', fontSize: 12, fontWeight: 700,
            background: lang === l ? T.ACC : 'transparent',
            color: lang === l ? '#0f172a' : T.MUT,
            border: 'none', cursor: 'pointer',
            borderRight: l !== 'lo' ? `1px solid ${T.BOR}` : 'none',
            WebkitTapHighlightColor: 'transparent',
            minWidth: 34, textAlign: 'center',
          }}>
          {LANG_LABELS[l]}
        </button>
      ))}
    </div>
  );
}

export default function GradingPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const { setGradingResult } = useTerminalContext();

  const { dicts } = usePackagingDicts(['PKG_EGG_GRADE', 'PKG_EGG_DEFECT']);
  const saleableItems = dicts.PKG_EGG_GRADE ?? FALLBACK_DICTS.PKG_EGG_GRADE;
  const defectItems   = dicts.PKG_EGG_DEFECT ?? FALLBACK_DICTS.PKG_EGG_DEFECT;
  const gradeMap = buildGradeMap([...saleableItems, ...defectItems]);
  const allGradeKeys = useMemo(
    () => [...saleableItems, ...defectItems].map(d => (d.terminalCode as string) || d.code),
    [saleableItems, defectItems],
  );
  const allGradeKeysStr = useMemo(() => allGradeKeys.join(','), [allGradeKeys]);

  const [availableQty, setAvailableQty] = useState(0);
  const [collections, setCollections] = useState<Record<string, unknown>[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);

  useEffect(() => {
    packagingApi.getTodaySourceBatches()
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setCollections(list);
        const total = list.reduce((s: number, b) =>
          s + Number(b.received_qty ?? b.receivedQty ?? 0), 0
        );
        setAvailableQty(total);
      })
      .catch(() => {})
      .finally(() => setSummaryLoading(false));
  }, []);

  const [outputs, setOutputs] = useState<Record<string, number>>(() =>
    Object.fromEntries(allGradeKeys.map(k => [k, 0]))
  );
  const [editKey, setEditKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    setOutputs(prev => {
      const updated = { ...prev };
      let changed = false;
      for (const k of allGradeKeys) {
        if (!(k in updated)) { updated[k] = 0; changed = true; }
      }
      return changed ? updated : prev;
    });
    if (allGradeKeys.length > 0 && editKey === null) {
      setEditKey(allGradeKeys[0]);
    }
  }, [allGradeKeysStr, allGradeKeys]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalOutput = Object.values(outputs).reduce((a, b) => a + b, 0);
  const balanceOk   = availableQty === 0 || totalOutput <= availableQty;
  const canSubmit   = totalOutput > 0 && balanceOk;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await packagingApi.submitGrading({
        productionDate: new Date().toISOString().slice(0, 10),
        outputs,
        totalInput: availableQty,
      });
      setGradingResult(res.code, outputs);
      setSubmitResult({ code: res.code, outputs: { ...outputs } });
    } catch (e) {
      console.error('分级提交失败', e);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedInfo  = editKey ? gradeMap[editKey] : null;
  const selectedColor = (selectedInfo?.color as string) ?? T.ACC;
  const numpadInitial = editKey && outputs[editKey] > 0 ? String(outputs[editKey]) : '';

  // ── 成功画面 ──────────────────────────────────────────────────────────────────
  if (submitResult) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.BG }}>
        <div style={{ background: T.CARD, borderBottom: `1px solid ${T.BOR}`, padding: '14px 24px', display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1, fontSize: 18, fontWeight: 700, color: T.TXT }}>📊 {t('terminal.grading', '分级作业')}</div>
          <LangToggle />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 32 }}>
          <div style={{ fontSize: 64 }}>✅</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: T.GRN }}>{t('ui.分级完成', '分级完成')}</div>
          {!!submitResult.code && (
            <div style={{ fontSize: 13, color: T.MUT }}>{t('ui.分级单号', '分级单号')}：{String(submitResult.code)}</div>
          )}
          <div style={{ background: T.CARD, borderRadius: 14, padding: 24, border: `1px solid ${T.BOR}`, width: '100%', maxWidth: 480 }}>
            <div style={{ fontSize: 12, color: T.MUT, marginBottom: 14, fontWeight: 600, letterSpacing: 1 }}>{t('ui.分级产出汇总', '分级产出汇总')}</div>
            {Object.entries(submitResult.outputs as Record<string, number>)
              .filter(([, v]) => v > 0)
              .map(([k, v]) => {
                const info = gradeMap[k];
                return (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: `1px solid rgba(255,255,255,0.05)` }}>
                    <span style={{ fontSize: 15, color: (info?.color as string) ?? T.MUT, fontWeight: 600 }}>{info?.label ?? k}</span>
                    <span style={{ fontSize: 17, color: T.TXT, fontWeight: 700 }}>{(v as number).toLocaleString()} {t('ui.枚', '枚')}</span>
                  </div>
                );
              })}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', marginTop: 4 }}>
              <span style={{ fontSize: 14, color: T.MUT }}>{t('ui.合计产出', '合计产出')}</span>
              <span style={{ fontSize: 18, color: T.GRN, fontWeight: 800 }}>{totalOutput.toLocaleString()} {t('ui.枚', '枚')}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 14 }}>
            <button type="button" onClick={() => { setSubmitResult(null); setOutputs(Object.fromEntries(allGradeKeys.map(k => [k, 0]))); }}
              style={{ padding: '15px 30px', borderRadius: 12, border: `1px solid ${T.BOR}`, background: 'transparent', color: T.MUT, fontSize: 15, cursor: 'pointer' }}>
              {t('ui.继续分级', '继续分级')}
            </button>
            <button type="button" onClick={() => router.push('/terminal/packaging/packing')}
              style={{ padding: '15px 44px', borderRadius: 12, border: 'none', background: T.ACC, color: '#0f172a', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
              → {t('terminal.packing', '前往包装')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── 主界面 ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.BG, overflow: 'hidden' }}>

      {/* Cursor blink animation */}
      <style>{`
        @keyframes _grading_blink {
          0%,49%  { opacity: 1; }
          50%,100%{ opacity: 0; }
        }
        ._grading_cursor {
          display: inline-block;
          width: 3px;
          margin-left: 3px;
          border-radius: 2px;
          animation: _grading_blink 1s step-end infinite;
        }
      `}</style>

      {/* Header */}
      <div style={{ background: T.CARD, borderBottom: `1px solid ${T.BOR}`, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <span style={{ fontSize: 22 }}>📊</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: T.TXT }}>{t('terminal.grading', '分级作业')}</div>
          <div style={{ fontSize: 11, color: T.MUT }}>{t('ui.点击等级卡片选中后通过右侧键盘录入数量', '点击等级卡片选中，右侧键盘录入数量')}</div>
        </div>

        {/* Lang toggle */}
        <LangToggle />

        {/* Available qty */}
        <div style={{ background: 'rgba(34,197,94,0.1)', border: `1px solid rgba(34,197,94,0.3)`, borderRadius: 10, padding: '7px 14px', textAlign: 'center', minWidth: 72 }}>
          <div style={{ fontSize: 10, color: T.MUT, marginBottom: 1 }}>{t('ui.今日可分级', '今日可分级')}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.GRN, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
            {summaryLoading ? '…' : availableQty > 0 ? availableQty.toLocaleString() : '—'}
          </div>
          <div style={{ fontSize: 10, color: T.MUT, marginTop: 1 }}>{t('ui.枚', '枚')}</div>
        </div>

        {collections.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 60, overflowY: 'auto' }}>
            {collections.map((b, i) => (
              <div key={i} style={{ fontSize: 10, color: T.MUT, whiteSpace: 'nowrap' }}>
                {String(b.house_name || b.houseCode || b.house_code || '')} · {Number(b.received_qty ?? 0).toLocaleString()} {t('ui.枚', '枚')}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main split: grades (left) + numpad (right) */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>

        {/* ── Left: Grade cards ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {!summaryLoading && availableQty === 0 && (
            <div style={{ background: 'rgba(245,158,11,0.08)', border: `1px solid rgba(245,158,11,0.3)`, borderRadius: 12, padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 20 }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: T.ACC, fontWeight: 600 }}>{t('ui.今日尚未录入集蛋数据', '今日尚未录入集蛋数据')}</div>
                <div style={{ fontSize: 11, color: T.MUT, marginTop: 2 }}>{t('ui.可先录入集蛋再返回分级', '可先录入集蛋，或直接在此录入分级产出')}</div>
              </div>
              <button type="button" onClick={() => router.push('/terminal/packaging/source-receive')}
                style={{ padding: '9px 16px', borderRadius: 8, border: `1px solid ${T.ACC}`, background: 'transparent', color: T.ACC, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                → {t('ui.去集蛋录入', '去集蛋录入')}
              </button>
            </div>
          )}

          {/* 可售等级 */}
          <div>
            <div style={{ fontSize: 11, color: T.MUT, fontWeight: 700, marginBottom: 10, letterSpacing: 1.5, textTransform: 'uppercase' }}>
              {t('ui.可售等级', 'Saleable Grades')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {saleableItems.map(d => {
                const tc = (d.terminalCode as string) || d.code;
                const qty = outputs[tc] ?? 0;
                const color = (d.color as string) || '#7c3aed';
                const isSelected = editKey === tc;
                return (
                  <button type="button" key={tc}
                    onPointerDown={() => setEditKey(tc)}
                    style={{
                      background: isSelected ? `${color}18` : T.CARD,
                      borderRadius: 16,
                      padding: '18px 12px',
                      border: `2px solid ${isSelected ? color : qty > 0 ? `${color}50` : T.BOR}`,
                      cursor: 'pointer', textAlign: 'center',
                      transition: 'border 0.12s, background 0.12s',
                      WebkitTapHighlightColor: 'transparent',
                      boxShadow: isSelected ? `0 0 0 3px ${color}20` : 'none',
                    }}>
                    <div style={{ fontSize: 12, color: isSelected ? color : T.MUT, fontWeight: 700, marginBottom: 5 }}>{d.label}</div>
                    {d.weightRange && <div style={{ fontSize: 10, color: T.MUT, marginBottom: 6, opacity: 0.6 }}>{d.weightRange as string}</div>}
                    <div style={{
                      fontSize: 38, fontWeight: 900, lineHeight: 1,
                      color: qty > 0 ? color : isSelected ? `${color}60` : T.BOR,
                      fontVariantNumeric: 'tabular-nums',
                      display: 'flex', alignItems: 'baseline', justifyContent: 'center',
                    }}>
                      {qty > 0 ? qty.toLocaleString() : (isSelected ? '0' : '—')}
                      {isSelected && (
                        <span className="_grading_cursor" style={{
                          height: 36, background: color, verticalAlign: 'middle',
                        }} />
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: T.MUT, marginTop: 6 }}>{t('ui.枚', '枚')}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 缺陷/损耗 */}
          <div>
            <div style={{ fontSize: 11, color: T.MUT, fontWeight: 700, marginBottom: 10, letterSpacing: 1.5, textTransform: 'uppercase' }}>
              {t('ui.缺陷损耗', 'Defects / Waste')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {defectItems.map(d => {
                const tc = (d.terminalCode as string) || d.code;
                const qty = outputs[tc] ?? 0;
                const color = (d.color as string) || '#ef4444';
                const isSelected = editKey === tc;
                return (
                  <button type="button" key={tc}
                    onPointerDown={() => setEditKey(tc)}
                    style={{
                      background: isSelected ? `${color}18` : T.CARD,
                      borderRadius: 14,
                      padding: '15px 8px',
                      border: `2px solid ${isSelected ? color : qty > 0 ? `${color}50` : T.BOR}`,
                      cursor: 'pointer', textAlign: 'center',
                      transition: 'border 0.12s, background 0.12s',
                      WebkitTapHighlightColor: 'transparent',
                      boxShadow: isSelected ? `0 0 0 3px ${color}20` : 'none',
                    }}>
                    <div style={{ fontSize: 11, color: isSelected ? color : T.MUT, fontWeight: 700, marginBottom: 6 }}>{d.label}</div>
                    <div style={{
                      fontSize: 30, fontWeight: 900, lineHeight: 1,
                      color: qty > 0 ? color : isSelected ? `${color}60` : T.BOR,
                      fontVariantNumeric: 'tabular-nums',
                      display: 'flex', alignItems: 'baseline', justifyContent: 'center',
                    }}>
                      {qty > 0 ? qty.toLocaleString() : (isSelected ? '0' : '—')}
                      {isSelected && (
                        <span className="_grading_cursor" style={{
                          height: 27, background: color, verticalAlign: 'middle',
                        }} />
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: T.MUT, marginTop: 5 }}>{t('ui.枚', '枚')}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 投入产出平衡 */}
          <div style={{
            background: T.CARD, borderRadius: 12, padding: '14px 18px',
            border: `1px solid ${balanceOk ? T.BOR : T.RED}`,
            display: 'flex', alignItems: 'center', gap: 24, flexShrink: 0,
          }}>
            <div style={{ flex: 1, display: 'flex', gap: 32, flexWrap: 'wrap' }}>
              <span>
                <span style={{ color: T.MUT, fontSize: 12 }}>{t('ui.今日投入', '投入')} </span>
                <strong style={{ color: T.TXT, fontSize: 15 }}>{availableQty > 0 ? availableQty.toLocaleString() : '—'}</strong>
              </span>
              <span>
                <span style={{ color: T.MUT, fontSize: 12 }}>{t('ui.已分级', '已分级')} </span>
                <strong style={{ color: balanceOk ? T.GRN : T.RED, fontSize: 15 }}>{totalOutput.toLocaleString()}</strong>
              </span>
              <span>
                <span style={{ color: T.MUT, fontSize: 12 }}>{t('ui.差异', '差异')} </span>
                <strong style={{ fontSize: 15, color: availableQty > 0 && Math.abs(availableQty - totalOutput) > 200 ? '#f59e0b' : T.GRN }}>
                  {availableQty > 0 ? (availableQty - totalOutput).toLocaleString() : '—'}
                </strong>
              </span>
            </div>
            {!balanceOk && (
              <div style={{ color: T.RED, fontSize: 13, fontWeight: 600 }}>⚠️ {t('ui.产出超过投入', '产出超过投入')}</div>
            )}
          </div>
        </div>

        {/* ── Right: NumPad panel ── */}
        <div style={{
          width: 400, flexShrink: 0, borderLeft: `1px solid ${T.BOR}`,
          padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10,
          background: '#0a1628', overflowY: 'auto',
        }}>
          {editKey ? (
            <>
              {/* Current grade indicator */}
              <div style={{
                background: `${selectedColor}15`,
                border: `1px solid ${selectedColor}40`,
                borderRadius: 12, padding: '10px 16px',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: T.MUT, marginBottom: 2 }}>{t('ui.当前编辑', '当前编辑')}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: selectedColor }}>
                    {selectedInfo?.label ?? editKey}
                  </div>
                </div>
                <div style={{
                  fontSize: 28, fontWeight: 900, color: selectedColor,
                  fontVariantNumeric: 'tabular-nums', lineHeight: 1,
                }}>
                  {(outputs[editKey] ?? 0).toLocaleString()}
                </div>
              </div>

              <NumPad
                key={editKey}
                initialValue={numpadInitial}
                accentColor={selectedColor}
                hideDisplay={true}
                buttonHeight={80}
                onChange={val => {
                  setOutputs(p => ({ ...p, [editKey]: Math.max(0, parseInt(val) || 0) }));
                }}
              />
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: T.MUT }}>
              <div style={{ fontSize: 40 }}>👈</div>
              <div style={{ fontSize: 14, textAlign: 'center', lineHeight: 1.5 }}>{t('ui.请先点击左侧等级卡片', '请先点击左侧等级卡片')}</div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ background: T.CARD, borderTop: `1px solid ${T.BOR}`, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button type="button" onClick={() => router.push('/terminal/packaging/source-receive')}
          style={{ padding: '13px 20px', borderRadius: 10, border: `1px solid ${T.BOR}`, background: 'transparent', color: T.MUT, fontSize: 14, cursor: 'pointer' }}>
          ← {t('ui.集蛋录入', '集蛋录入')}
        </button>
        <button type="button" onClick={() => router.push('/terminal/packaging/exceptions')}
          style={{ padding: '13px 18px', borderRadius: 10, border: `1px solid rgba(239,68,68,0.4)`, background: 'rgba(239,68,68,0.1)', color: T.RED, fontSize: 14, cursor: 'pointer' }}>
          ⚠️ {t('ui.上报异常', '上报异常')}
        </button>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={handleSubmit} disabled={!canSubmit || submitting}
          style={{
            padding: '13px 52px', borderRadius: 10, border: 'none',
            background: canSubmit ? T.GRN : T.BOR,
            color: canSubmit ? '#0f172a' : T.MUT,
            fontSize: 17, fontWeight: 800,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            opacity: submitting ? 0.7 : 1,
            transition: 'background 0.15s',
          }}>
          {submitting ? t('ui.提交中', '提交中...') : `✓ ${t('ui.完成分级', '完成分级')}`}
        </button>
      </div>
    </div>
  );
}
