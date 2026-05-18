'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTerminalContext } from '@/hooks/useTerminalContext';
import { packagingApi } from '@/lib/packaging-api';
import { usePackagingDicts, buildGradeMap, FALLBACK_DICTS } from '@/hooks/usePackagingDicts';
import { T } from '@/styles/terminal-theme';


export default function GradingPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const { setGradingResult } = useTerminalContext();

  // ── 字典：可售等级 + 缺陷品类 ────────────────────────────────────────────────
  const { dicts } = usePackagingDicts(['PKG_EGG_GRADE', 'PKG_EGG_DEFECT']);
  const saleableItems = dicts.PKG_EGG_GRADE ?? FALLBACK_DICTS.PKG_EGG_GRADE;
  const defectItems   = dicts.PKG_EGG_DEFECT ?? FALLBACK_DICTS.PKG_EGG_DEFECT;
  const gradeMap = buildGradeMap([...saleableItems, ...defectItems]);
  const allGradeKeys = useMemo(
    () => [...saleableItems, ...defectItems].map(d => (d.terminalCode as string) || d.code),
    [saleableItems, defectItems],
  );
  const allGradeKeysStr = useMemo(() => allGradeKeys.join(','), [allGradeKeys]);

  // ── 今日可分级总量（来自集蛋录入，由后端聚合） ────────────────────────────────
  const [availableQty, setAvailableQty] = useState(0);
  const [collections, setCollections] = useState<any[]>([]); // per-house breakdown
  const [summaryLoading, setSummaryLoading] = useState(true);

  useEffect(() => {
    packagingApi.getTodaySourceBatches()
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setCollections(list);
        const total = list.reduce((s: number, b: any) =>
          s + Number(b.received_qty ?? b.receivedQty ?? 0), 0
        );
        setAvailableQty(total);
      })
      .catch(() => {})
      .finally(() => setSummaryLoading(false));
  }, []);

  // ── 分级录入 ──────────────────────────────────────────────────────────────────
  const [outputs, setOutputs] = useState<Record<string, number>>(() =>
    Object.fromEntries(allGradeKeys.map(k => [k, 0]))
  );
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<any>(null);

  // 字典加载后补充新 key
  useEffect(() => {
    setOutputs(prev => {
      const updated = { ...prev };
      let changed = false;
      for (const k of allGradeKeys) {
        if (!(k in updated)) { updated[k] = 0; changed = true; }
      }
      return changed ? updated : prev;
    });
  }, [allGradeKeysStr, allGradeKeys]);

  const totalOutput  = Object.values(outputs).reduce((a, b) => a + b, 0);
  const balanceOk    = availableQty === 0 || totalOutput <= availableQty;
  const canSubmit    = totalOutput > 0 && balanceOk;

  const handleEditSave = () => {
    if (!editKey) return;
    setOutputs(p => ({ ...p, [editKey]: Math.max(0, parseInt(editVal) || 0) }));
    setEditKey(null);
  };

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
            <div style={{ fontSize: 13, color: T.MUT }}>{t('ui.分级单号', '分级单号')}：{submitResult.code}</div>
          )}

          {/* 产出汇总 */}
          <div style={{ background: T.CARD, borderRadius: 12, padding: 20, border: `1px solid ${T.BOR}`, width: '100%', maxWidth: 440 }}>
            <div style={{ fontSize: 12, color: T.MUT, marginBottom: 12, fontWeight: 600 }}>{t('ui.分级产出汇总', '分级产出汇总')}</div>
            {Object.entries(submitResult.outputs as Record<string, number>)
              .filter(([, v]) => v > 0)
              .map(([k, v]) => {
                const info = gradeMap[k];
                return (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid rgba(255,255,255,0.05)` }}>
                    <span style={{ fontSize: 14, color: info?.color ?? T.MUT, fontWeight: 600 }}>{info?.label ?? k}</span>
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
      <div style={{ background: T.CARD, borderBottom: `1px solid ${T.BOR}`, padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        <span style={{ fontSize: 24 }}>📊</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.TXT }}>{t('terminal.grading', '分级作业')}</div>
          <div style={{ fontSize: 12, color: T.MUT }}>{t('ui.点击等级卡片录入数量', '点击等级卡片录入数量')}</div>
        </div>

        {/* 今日可分级总量 */}
        <div style={{ background: 'rgba(34,197,94,0.1)', border: `1px solid rgba(34,197,94,0.3)`, borderRadius: 10, padding: '10px 20px', textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: T.MUT, marginBottom: 2 }}>{t('ui.今日可分级', '今日可分级')}</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: T.GRN, fontVariantNumeric: 'tabular-nums' }}>
            {summaryLoading ? '…' : availableQty > 0 ? availableQty.toLocaleString() : '—'}
          </div>
          <div style={{ fontSize: 11, color: T.MUT }}>{t('ui.枚', '枚')}</div>
        </div>

        {/* 鸡舍明细 */}
        {collections.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 80, overflowY: 'auto' }}>
            {collections.map((b: any, i: number) => (
              <div key={i} style={{ fontSize: 11, color: T.MUT, whiteSpace: 'nowrap' }}>
                {b.house_name || b.houseCode || b.house_code} · {Number(b.received_qty ?? 0).toLocaleString()} {t('ui.枚', '枚')}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Grade input grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* 无集蛋记录提示 */}
        {!summaryLoading && availableQty === 0 && (
          <div style={{ background: 'rgba(245,158,11,0.08)', border: `1px solid rgba(245,158,11,0.3)`, borderRadius: 12, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <div>
              <div style={{ fontSize: 13, color: T.ACC, fontWeight: 600 }}>{t('ui.今日尚未录入集蛋数据', '今日尚未录入集蛋数据')}</div>
              <div style={{ fontSize: 12, color: T.MUT }}>{t('ui.可先录入集蛋再返回分级', '可先录入集蛋，或直接在此录入分级产出')}</div>
            </div>
            <button type="button" onClick={() => router.push('/terminal/packaging/source-receive')}
              style={{ marginLeft: 'auto', padding: '8px 18px', borderRadius: 8, border: `1px solid ${T.ACC}`, background: 'transparent', color: T.ACC, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              → {t('ui.去集蛋录入', '去集蛋录入')}
            </button>
          </div>
        )}

        {/* 可售等级 */}
        <div>
          <div style={{ fontSize: 11, color: T.MUT, fontWeight: 600, marginBottom: 10, letterSpacing: 1 }}>
            {t('ui.可售等级', '▸ 可售等级')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
            {saleableItems.map(d => {
              const tc = (d.terminalCode as string) || d.code;
              const qty = outputs[tc] ?? 0;
              const color = (d.color as string) || '#7c3aed';
              return (
                <div key={tc}
                  onClick={() => { setEditKey(tc); setEditVal(String(qty)); }}
                  style={{
                    background: T.CARD, borderRadius: 14, padding: '18px 12px',
                    border: `2px solid ${editKey === tc ? color : qty > 0 ? `${color}60` : T.BOR}`,
                    cursor: 'pointer', textAlign: 'center', transition: 'border 0.15s',
                  }}>
                  <div style={{ fontSize: 11, color: T.MUT, marginBottom: 8 }}>{d.label}</div>
                  {d.weightRange && <div style={{ fontSize: 10, color: T.MUT, marginBottom: 6, opacity: 0.7 }}>{d.weightRange as string}</div>}
                  <div style={{ fontSize: 36, fontWeight: 900, color: qty > 0 ? color : T.BOR, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                    {qty.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 10, color: T.MUT, marginTop: 6 }}>{t('ui.枚', '枚')} · {t('ui.点击修改', '点击修改')}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 缺陷/损耗 */}
        <div>
          <div style={{ fontSize: 11, color: T.MUT, fontWeight: 600, marginBottom: 10, letterSpacing: 1 }}>
            {t('ui.缺陷损耗', '▸ 缺陷 / 损耗')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {defectItems.map(d => {
              const tc = (d.terminalCode as string) || d.code;
              const qty = outputs[tc] ?? 0;
              const color = (d.color as string) || '#ef4444';
              return (
                <div key={tc}
                  onClick={() => { setEditKey(tc); setEditVal(String(qty)); }}
                  style={{
                    background: T.CARD, borderRadius: 14, padding: '16px 12px',
                    border: `2px solid ${editKey === tc ? color : qty > 0 ? `${color}60` : T.BOR}`,
                    cursor: 'pointer', textAlign: 'center', transition: 'border 0.15s',
                  }}>
                  <div style={{ fontSize: 11, color: T.MUT, marginBottom: 6 }}>{d.label}</div>
                  <div style={{ fontSize: 32, fontWeight: 900, color: qty > 0 ? color : T.BOR, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                    {qty.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 10, color: T.MUT, marginTop: 4 }}>{t('ui.枚', '枚')}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 投入产出平衡 */}
        <div style={{
          background: T.CARD, borderRadius: 12, padding: '14px 20px',
          border: `1px solid ${balanceOk ? T.BOR : T.RED}`,
          display: 'flex', alignItems: 'center', gap: 24,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: T.MUT, marginBottom: 6, fontWeight: 600 }}>{t('ui.投入产出平衡', '投入产出平衡')}</div>
            <div style={{ display: 'flex', gap: 32, fontSize: 15 }}>
              <span>
                <span style={{ color: T.MUT }}>{t('ui.今日投入', '投入')} </span>
                <strong style={{ color: T.TXT }}>{availableQty > 0 ? availableQty.toLocaleString() : '—'}</strong>
              </span>
              <span>
                <span style={{ color: T.MUT }}>{t('ui.已分级', '已分级')} </span>
                <strong style={{ color: balanceOk ? T.GRN : T.RED }}>{totalOutput.toLocaleString()}</strong>
              </span>
              <span>
                <span style={{ color: T.MUT }}>{t('ui.差异', '差异')} </span>
                <strong style={{ color: Math.abs(availableQty - totalOutput) > 200 ? '#f59e0b' : T.GRN }}>
                  {availableQty > 0 ? (availableQty - totalOutput).toLocaleString() : '—'}
                </strong>
              </span>
            </div>
          </div>
          {!balanceOk && (
            <div style={{ color: T.RED, fontSize: 13, fontWeight: 600 }}>⚠️ {t('ui.产出超过投入', '产出超过投入')}</div>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ background: T.CARD, borderTop: `1px solid ${T.BOR}`, padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button type="button" onClick={() => router.push('/terminal/packaging/source-receive')}
          style={{ padding: '14px 20px', borderRadius: 10, border: `1px solid ${T.BOR}`, background: 'transparent', color: T.MUT, fontSize: 14, cursor: 'pointer' }}>
          ← {t('ui.集蛋录入', '集蛋录入')}
        </button>
        <button type="button" onClick={() => router.push('/terminal/packaging/exceptions')}
          style={{ padding: '14px 20px', borderRadius: 10, border: `1px solid rgba(239,68,68,0.4)`, background: 'rgba(239,68,68,0.1)', color: T.RED, fontSize: 14, cursor: 'pointer' }}>
          ⚠️ {t('ui.上报异常', '上报异常')}
        </button>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={handleSubmit} disabled={!canSubmit || submitting}
          style={{
            padding: '14px 52px', borderRadius: 10, border: 'none',
            background: canSubmit ? T.GRN : T.BOR,
            color: canSubmit ? '#0f172a' : T.MUT,
            fontSize: 16, fontWeight: 700,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            opacity: submitting ? 0.7 : 1,
          }}>
          {submitting ? t('ui.提交中', '提交中...') : `✓ ${t('ui.完成分级', '完成分级')}`}
        </button>
      </div>

      {/* 数量编辑弹窗 */}
      {editKey && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: T.CARD, borderRadius: 16, padding: 32, width: 340, border: `1px solid ${T.BOR}`, textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: T.MUT, marginBottom: 6 }}>{t('ui.录入数量枚', '录入数量（枚）')}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: gradeMap[editKey]?.color ?? T.ACC, marginBottom: 16 }}>
              {gradeMap[editKey]?.label ?? editKey}
            </div>
            <input
              type="number" value={editVal}
              onChange={e => setEditVal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleEditSave()}
              autoFocus
              style={{
                width: '100%', background: 'rgba(255,255,255,0.08)',
                border: `2px solid ${gradeMap[editKey]?.color ?? T.ACC}`,
                borderRadius: 10, padding: '16px', color: T.TXT,
                fontSize: 42, fontWeight: 700, textAlign: 'center',
                boxSizing: 'border-box', marginBottom: 16,
              }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => setEditKey(null)}
                style={{ flex: 1, padding: '14px', background: 'transparent', border: `1px solid ${T.BOR}`, borderRadius: 8, color: T.MUT, fontSize: 15, cursor: 'pointer' }}>
                {t('common.cancel', '取消')}
              </button>
              <button type="button" onClick={handleEditSave}
                style={{ flex: 2, padding: '14px', background: T.ACC, border: 'none', borderRadius: 8, color: '#0f172a', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
                {t('common.confirm', '确认')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
