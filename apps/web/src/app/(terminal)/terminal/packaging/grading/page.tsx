'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTerminalContext } from '@/hooks/useTerminalContext';
import { packagingApi } from '@/lib/packaging-api';
import { usePackagingDicts, buildGradeMap, FALLBACK_DICTS } from '@/hooks/usePackagingDicts';
import { T } from '@/styles/terminal-theme';
import NumPad from '@/components/terminal/NumPad';


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
    // Auto-select first saleable grade when dicts load
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

  const selectedInfo = editKey ? gradeMap[editKey] : null;
  const selectedColor = (selectedInfo?.color as string) ?? T.ACC;
  const selectedLabel = selectedInfo?.label ?? editKey ?? '';
  const numpadInitial = editKey && outputs[editKey] > 0 ? String(outputs[editKey]) : '';

  // ── 成功画面 ──────────────────────────────────────────────────────────────────
  if (submitResult) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.BG }}>
        <div style={{ background: T.CARD, borderBottom: `1px solid ${T.BOR}`, padding: '14px 24px' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.TXT }}>📊 {t('terminal.grading', '分级作业')}</div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 32 }}>
          <div style={{ fontSize: 64 }}>✅</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: T.GRN }}>{t('ui.分级完成', '分级完成')}</div>
          {submitResult.code && (
            <div style={{ fontSize: 13, color: T.MUT }}>{t('ui.分级单号', '分级单号')}：{String(submitResult.code)}</div>
          )}
          <div style={{ background: T.CARD, borderRadius: 12, padding: 20, border: `1px solid ${T.BOR}`, width: '100%', maxWidth: 440 }}>
            <div style={{ fontSize: 12, color: T.MUT, marginBottom: 12, fontWeight: 600 }}>{t('ui.分级产出汇总', '分级产出汇总')}</div>
            {Object.entries(submitResult.outputs as Record<string, number>)
              .filter(([, v]) => v > 0)
              .map(([k, v]) => {
                const info = gradeMap[k];
                return (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid rgba(255,255,255,0.05)` }}>
                    <span style={{ fontSize: 14, color: (info?.color as string) ?? T.MUT, fontWeight: 600 }}>{info?.label ?? k}</span>
                    <span style={{ fontSize: 16, color: T.TXT, fontWeight: 700 }}>{(v as number).toLocaleString()} {t('ui.枚', '枚')}</span>
                  </div>
                );
              })}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', marginTop: 4 }}>
              <span style={{ fontSize: 13, color: T.MUT }}>{t('ui.合计产出', '合计产出')}</span>
              <span style={{ fontSize: 16, color: T.GRN, fontWeight: 700 }}>{totalOutput.toLocaleString()} {t('ui.枚', '枚')}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button type="button" onClick={() => { setSubmitResult(null); setOutputs(Object.fromEntries(allGradeKeys.map(k => [k, 0]))); }}
              style={{ padding: '14px 28px', borderRadius: 10, border: `1px solid ${T.BOR}`, background: 'transparent', color: T.MUT, fontSize: 15, cursor: 'pointer' }}>
              {t('ui.继续分级', '继续分级')}
            </button>
            <button type="button" onClick={() => router.push('/terminal/packaging/packing')}
              style={{ padding: '14px 40px', borderRadius: 10, border: 'none', background: T.ACC, color: '#0f172a', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
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

      {/* Header */}
      <div style={{ background: T.CARD, borderBottom: `1px solid ${T.BOR}`, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <span style={{ fontSize: 22 }}>📊</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: T.TXT }}>{t('terminal.grading', '分级作业')}</div>
          <div style={{ fontSize: 11, color: T.MUT }}>{t('ui.点击等级卡片选中后通过右侧键盘录入', '点击等级卡片选中，通过右侧键盘录入数量')}</div>
        </div>
        <div style={{ background: 'rgba(34,197,94,0.1)', border: `1px solid rgba(34,197,94,0.3)`, borderRadius: 10, padding: '8px 16px', textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: T.MUT, marginBottom: 1 }}>{t('ui.今日可分级', '今日可分级')}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: T.GRN, fontVariantNumeric: 'tabular-nums' }}>
            {summaryLoading ? '…' : availableQty > 0 ? availableQty.toLocaleString() : '—'}
          </div>
          <div style={{ fontSize: 10, color: T.MUT }}>{t('ui.枚', '枚')}</div>
        </div>
        {collections.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 72, overflowY: 'auto' }}>
            {collections.map((b, i) => (
              <div key={i} style={{ fontSize: 10, color: T.MUT, whiteSpace: 'nowrap' }}>
                {String(b.house_name || b.houseCode || b.house_code || '')} · {Number(b.received_qty ?? 0).toLocaleString()} {t('ui.枚', '枚')}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main split: grades (left) + numpad (right) */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', gap: 0 }}>

        {/* ── Left: Grade cards ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {!summaryLoading && availableQty === 0 && (
            <div style={{ background: 'rgba(245,158,11,0.08)', border: `1px solid rgba(245,158,11,0.3)`, borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: T.ACC, fontWeight: 600 }}>{t('ui.今日尚未录入集蛋数据', '今日尚未录入集蛋数据')}</div>
                <div style={{ fontSize: 11, color: T.MUT }}>{t('ui.可先录入集蛋再返回分级', '可先录入集蛋，或直接在此录入分级产出')}</div>
              </div>
              <button type="button" onClick={() => router.push('/terminal/packaging/source-receive')}
                style={{ padding: '7px 14px', borderRadius: 7, border: `1px solid ${T.ACC}`, background: 'transparent', color: T.ACC, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                → {t('ui.去集蛋录入', '去集蛋录入')}
              </button>
            </div>
          )}

          {/* 可售等级 */}
          <div>
            <div style={{ fontSize: 10, color: T.MUT, fontWeight: 700, marginBottom: 8, letterSpacing: 1.5, textTransform: 'uppercase' }}>
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
                      borderRadius: 14,
                      padding: '16px 10px',
                      border: `2px solid ${isSelected ? color : qty > 0 ? `${color}50` : T.BOR}`,
                      cursor: 'pointer', textAlign: 'center',
                      transition: 'border 0.12s, background 0.12s',
                      WebkitTapHighlightColor: 'transparent',
                    }}>
                    <div style={{ fontSize: 11, color: isSelected ? color : T.MUT, fontWeight: 600, marginBottom: 6 }}>{d.label}</div>
                    {d.weightRange && <div style={{ fontSize: 9, color: T.MUT, marginBottom: 5, opacity: 0.7 }}>{d.weightRange as string}</div>}
                    <div style={{
                      fontSize: 34, fontWeight: 900, lineHeight: 1,
                      color: qty > 0 ? color : isSelected ? `${color}60` : T.BOR,
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {qty.toLocaleString()}
                    </div>
                    <div style={{ fontSize: 9, color: T.MUT, marginTop: 5 }}>{t('ui.枚', '枚')}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 缺陷/损耗 */}
          <div>
            <div style={{ fontSize: 10, color: T.MUT, fontWeight: 700, marginBottom: 8, letterSpacing: 1.5, textTransform: 'uppercase' }}>
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
                      borderRadius: 12,
                      padding: '14px 8px',
                      border: `2px solid ${isSelected ? color : qty > 0 ? `${color}50` : T.BOR}`,
                      cursor: 'pointer', textAlign: 'center',
                      transition: 'border 0.12s, background 0.12s',
                      WebkitTapHighlightColor: 'transparent',
                    }}>
                    <div style={{ fontSize: 10, color: isSelected ? color : T.MUT, fontWeight: 600, marginBottom: 5 }}>{d.label}</div>
                    <div style={{
                      fontSize: 28, fontWeight: 900, lineHeight: 1,
                      color: qty > 0 ? color : isSelected ? `${color}60` : T.BOR,
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {qty.toLocaleString()}
                    </div>
                    <div style={{ fontSize: 9, color: T.MUT, marginTop: 4 }}>{t('ui.枚', '枚')}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 投入产出平衡 */}
          <div style={{
            background: T.CARD, borderRadius: 10, padding: '12px 16px',
            border: `1px solid ${balanceOk ? T.BOR : T.RED}`,
            display: 'flex', alignItems: 'center', gap: 20, flexShrink: 0,
          }}>
            <div style={{ flex: 1, display: 'flex', gap: 28, fontSize: 14 }}>
              <span>
                <span style={{ color: T.MUT, fontSize: 11 }}>{t('ui.今日投入', '投入')} </span>
                <strong style={{ color: T.TXT }}>{availableQty > 0 ? availableQty.toLocaleString() : '—'}</strong>
              </span>
              <span>
                <span style={{ color: T.MUT, fontSize: 11 }}>{t('ui.已分级', '已分级')} </span>
                <strong style={{ color: balanceOk ? T.GRN : T.RED }}>{totalOutput.toLocaleString()}</strong>
              </span>
              <span>
                <span style={{ color: T.MUT, fontSize: 11 }}>{t('ui.差异', '差异')} </span>
                <strong style={{ color: availableQty > 0 && Math.abs(availableQty - totalOutput) > 200 ? '#f59e0b' : T.GRN }}>
                  {availableQty > 0 ? (availableQty - totalOutput).toLocaleString() : '—'}
                </strong>
              </span>
            </div>
            {!balanceOk && (
              <div style={{ color: T.RED, fontSize: 12, fontWeight: 600 }}>⚠️ {t('ui.产出超过投入', '产出超过投入')}</div>
            )}
          </div>
        </div>

        {/* ── Right: Fixed NumPad panel ── */}
        <div style={{
          width: 330, flexShrink: 0, borderLeft: `1px solid ${T.BOR}`,
          padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
          background: '#0a1628', overflowY: 'auto',
        }}>
          {editKey ? (
            <>
              {/* Selected grade indicator */}
              <div style={{
                background: `${selectedColor}15`,
                border: `1px solid ${selectedColor}40`,
                borderRadius: 10, padding: '10px 14px',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: T.MUT, marginBottom: 2 }}>{t('ui.当前编辑', '当前编辑')}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: selectedColor }}>{selectedLabel}</div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: selectedColor, fontVariantNumeric: 'tabular-nums' }}>
                  {(outputs[editKey] ?? 0).toLocaleString()}
                </div>
              </div>

              <NumPad
                key={editKey}
                initialValue={numpadInitial}
                accentColor={selectedColor}
                onChange={val => {
                  setOutputs(p => ({ ...p, [editKey]: Math.max(0, parseInt(val) || 0) }));
                }}
              />
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: T.MUT }}>
              <div style={{ fontSize: 32 }}>👈</div>
              <div style={{ fontSize: 13, textAlign: 'center' }}>{t('ui.请先选择左侧等级', '请先点击左侧等级卡片')}</div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ background: T.CARD, borderTop: `1px solid ${T.BOR}`, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button type="button" onClick={() => router.push('/terminal/packaging/source-receive')}
          style={{ padding: '12px 18px', borderRadius: 10, border: `1px solid ${T.BOR}`, background: 'transparent', color: T.MUT, fontSize: 14, cursor: 'pointer' }}>
          ← {t('ui.集蛋录入', '集蛋录入')}
        </button>
        <button type="button" onClick={() => router.push('/terminal/packaging/exceptions')}
          style={{ padding: '12px 18px', borderRadius: 10, border: `1px solid rgba(239,68,68,0.4)`, background: 'rgba(239,68,68,0.1)', color: T.RED, fontSize: 14, cursor: 'pointer' }}>
          ⚠️ {t('ui.上报异常', '上报异常')}
        </button>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={handleSubmit} disabled={!canSubmit || submitting}
          style={{
            padding: '12px 48px', borderRadius: 10, border: 'none',
            background: canSubmit ? T.GRN : T.BOR,
            color: canSubmit ? '#0f172a' : T.MUT,
            fontSize: 16, fontWeight: 700,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            opacity: submitting ? 0.7 : 1,
          }}>
          {submitting ? t('ui.提交中', '提交中...') : `✓ ${t('ui.完成分级', '完成分级')}`}
        </button>
      </div>
    </div>
  );
}
