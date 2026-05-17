'use client';
import { useState, useEffect } from 'react';
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

  // ── 字典 ─────────────────────────────────────────────────────────────────────
  const { dicts } = usePackagingDicts(['PKG_EGG_GRADE', 'PKG_EGG_DEFECT']);
  const saleableItems = dicts.PKG_EGG_GRADE ?? FALLBACK_DICTS.PKG_EGG_GRADE;
  const defectItems   = dicts.PKG_EGG_DEFECT ?? FALLBACK_DICTS.PKG_EGG_DEFECT;
  const gradeMap = buildGradeMap([...saleableItems, ...defectItems]);
  const allGradeKeys = [...saleableItems, ...defectItems].map(d => (d.terminalCode as string) || d.code);

  // ── 今日批次列表 ──────────────────────────────────────────────────────────────
  const [batches, setBatches] = useState<any[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(true);
  const [selectedBatch, setSelectedBatch] = useState<any | null>(null);

  // ── 分级录入 ──────────────────────────────────────────────────────────────────
  const [outputs, setOutputs] = useState<Record<string, number>>(() =>
    Object.fromEntries(allGradeKeys.map(k => [k, 0]))
  );
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<any>(null);

  useEffect(() => {
    packagingApi.getTodaySourceBatches()
      .then(data => setBatches(Array.isArray(data) ? data : []))
      .catch(() => setBatches([]))
      .finally(() => setBatchesLoading(false));
  }, []);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allGradeKeys.join(',')]);

  const selectBatch = (b: any) => {
    setSelectedBatch(b);
    setOutputs(Object.fromEntries(allGradeKeys.map(k => [k, 0])));
    setSubmitResult(null);
  };

  const totalOutput = Object.values(outputs).reduce((a, b) => a + b, 0);
  const inputQty    = selectedBatch
    ? Number(selectedBatch.received_qty ?? selectedBatch.receivedQty ?? selectedBatch.expected_qty ?? 0)
    : 0;
  const balanceOk  = !selectedBatch || inputQty === 0 || totalOutput <= inputQty;
  const canSubmit  = !!selectedBatch && totalOutput > 0 && balanceOk;

  const handleEditSave = () => {
    if (!editKey) return;
    setOutputs(p => ({ ...p, [editKey]: Math.max(0, parseInt(editVal) || 0) }));
    setEditKey(null);
  };

  const handleSubmit = async () => {
    if (!canSubmit || !selectedBatch) return;
    setSubmitting(true);
    try {
      const batchCode = selectedBatch.batch_code || selectedBatch.code || selectedBatch.inbound_no;
      const res = await packagingApi.submitGrading({
        sourceBatchCode: batchCode,
        productionDate: new Date().toISOString().slice(0, 10),
        outputs,
      });
      setGradingResult(res.code, outputs);
      setSubmitResult({ code: res.code, outputs: { ...outputs }, batchCode });
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
          <div style={{ fontSize: 13, color: T.MUT }}>
            {t('ui.批次', '批次')} {submitResult.batchCode}
            {submitResult.code ? ` · ${t('ui.分级单号', '分级单号')} ${submitResult.code}` : ''}
          </div>
          {/* 产出汇总 */}
          <div style={{ background: T.CARD, borderRadius: 12, padding: 20, border: `1px solid ${T.BOR}`, width: '100%', maxWidth: 420 }}>
            <div style={{ fontSize: 12, color: T.MUT, marginBottom: 12 }}>{t('ui.分级产出汇总', '分级产出汇总')}</div>
            {Object.entries(submitResult.outputs as Record<string, number>)
              .filter(([, v]) => v > 0)
              .map(([k, v]) => {
                const info = gradeMap[k];
                return (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid rgba(255,255,255,0.05)`, fontSize: 14 }}>
                    <span style={{ color: info?.color ?? T.MUT }}>{info?.label ?? k}</span>
                    <span style={{ color: T.TXT, fontWeight: 600 }}>{v.toLocaleString()} {t('ui.枚', '枚')}</span>
                  </div>
                );
              })}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => { setSubmitResult(null); setSelectedBatch(null); setOutputs(Object.fromEntries(allGradeKeys.map(k => [k, 0]))); }}
              style={{ padding: '14px 28px', borderRadius: 10, border: `1px solid ${T.BOR}`, background: 'transparent', color: T.MUT, fontSize: 15, cursor: 'pointer' }}>
              {t('ui.继续分级', '继续分级')}
            </button>
            <button onClick={() => router.push('/terminal/packaging/packing')}
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
      <div style={{ background: T.CARD, borderBottom: `1px solid ${T.BOR}`, padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <span style={{ fontSize: 24 }}>📊</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.TXT }}>{t('terminal.grading', '分级作业')}</div>
          <div style={{ fontSize: 12, color: T.MUT }}>
            {selectedBatch
              ? `${t('ui.已选批次', '已选批次')}：${selectedBatch.batch_code || selectedBatch.code} · ${t('ui.投入', '投入')} ${inputQty.toLocaleString()} ${t('ui.枚', '枚')}`
              : t('ui.请从左侧选择待分级批次', '← 请从左侧选择待分级批次')}
          </div>
        </div>
      </div>

      {/* Body: left task list + right grade inputs */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>

        {/* ── 左侧：批次列表 ── */}
        <div style={{ width: 240, flexShrink: 0, borderRight: `1px solid ${T.BOR}`, overflowY: 'auto', background: '#0a1628' }}>
          <div style={{ padding: '10px 16px', fontSize: 11, color: T.MUT, fontWeight: 600, letterSpacing: 1, borderBottom: `1px solid ${T.BOR}`, position: 'sticky', top: 0, background: '#0a1628', zIndex: 1 }}>
            {t('ui.今日批次', '今日批次')}（{batches.length}）
          </div>

          {batchesLoading ? (
            <div style={{ padding: 20, color: T.MUT, fontSize: 13 }}>{t('common.loading', '加载中...')}</div>
          ) : batches.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
              <div style={{ color: T.MUT, fontSize: 13 }}>{t('ui.今日暂无接收批次', '今日暂无接收批次')}</div>
              <button onClick={() => router.push('/terminal/packaging/source-receive')}
                style={{ marginTop: 12, padding: '8px 16px', borderRadius: 8, border: `1px solid ${T.ACC}`, background: 'transparent', color: T.ACC, fontSize: 12, cursor: 'pointer' }}>
                → {t('terminal.source_receive', '去集蛋接收')}
              </button>
            </div>
          ) : (
            batches.map((b: any) => {
              const code = b.batch_code || b.code || b.inbound_no;
              const house = b.house_name || b.house_code || '—';
              const qty = Number(b.received_qty ?? b.expected_qty ?? 0);
              const status = String(b.batch_status || b.status || '').toUpperCase();
              const isDone = ['GRADED', 'COMPLETED', 'PACKED', 'WAREHOUSED'].includes(status);
              const isSelected = selectedBatch && (selectedBatch.batch_code || selectedBatch.code || selectedBatch.inbound_no) === code;

              return (
                <button key={code || b.id}
                  onClick={() => !isDone && selectBatch(b)}
                  style={{
                    width: '100%', padding: '14px 16px', textAlign: 'left',
                    cursor: isDone ? 'default' : 'pointer',
                    background: isSelected ? 'rgba(245,158,11,0.15)' : 'transparent',
                    borderLeft: `3px solid ${isSelected ? T.ACC : 'transparent'}`,
                    borderRight: 'none', borderTop: 'none',
                    borderBottom: `1px solid ${T.BOR}`,
                    opacity: isDone ? 0.5 : 1,
                    display: 'block',
                  }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: isSelected ? T.ACC : T.TXT, fontFamily: 'monospace' }}>{code}</div>
                  <div style={{ fontSize: 11, color: T.MUT, marginTop: 3 }}>{house}</div>
                  <div style={{ fontSize: 11, color: T.MUT }}>{qty.toLocaleString()} {t('ui.枚', '枚')}</div>
                  {isDone && <div style={{ fontSize: 10, color: T.GRN, marginTop: 3 }}>✓ {t('ui.已分级', '已分级')}</div>}
                </button>
              );
            })
          )}
        </div>

        {/* ── 右侧：等级录入 ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {!selectedBatch ? (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: T.MUT }}>
              <div style={{ fontSize: 48 }}>📋</div>
              <div style={{ fontSize: 16 }}>{t('ui.请选择批次开始分级', '请从左侧选择批次开始分级')}</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

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
                      <div key={tc} onClick={() => { setEditKey(tc); setEditVal(String(qty)); }}
                        style={{
                          background: T.CARD, borderRadius: 12, padding: '16px 10px',
                          border: `2px solid ${editKey === tc ? color : T.BOR}`,
                          cursor: 'pointer', textAlign: 'center', transition: 'border 0.15s',
                        }}>
                        <div style={{ fontSize: 11, color: T.MUT, marginBottom: 6 }}>{d.label}</div>
                        <div style={{ fontSize: 34, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                          {qty.toLocaleString()}
                        </div>
                        <div style={{ fontSize: 10, color: T.MUT, marginTop: 4 }}>{t('ui.枚', '枚')}</div>
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
                      <div key={tc} onClick={() => { setEditKey(tc); setEditVal(String(qty)); }}
                        style={{
                          background: T.CARD, borderRadius: 12, padding: '16px 10px',
                          border: `2px solid ${editKey === tc ? color : T.BOR}`,
                          cursor: 'pointer', textAlign: 'center', transition: 'border 0.15s',
                        }}>
                        <div style={{ fontSize: 11, color: T.MUT, marginBottom: 6 }}>{d.label}</div>
                        <div style={{ fontSize: 34, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
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
                background: T.CARD, borderRadius: 12, padding: 16,
                border: `1px solid ${balanceOk ? T.BOR : T.RED}`,
                display: 'flex', alignItems: 'center', gap: 16,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: T.MUT, marginBottom: 6 }}>{t('ui.投入产出平衡', '投入产出平衡')}</div>
                  <div style={{ display: 'flex', gap: 28, fontSize: 14 }}>
                    <span style={{ color: T.MUT }}>
                      {t('ui.投入', '投入')} <strong style={{ color: T.TXT }}>{inputQty.toLocaleString()}</strong>
                    </span>
                    <span style={{ color: T.MUT }}>
                      {t('ui.产出', '产出')} <strong style={{ color: balanceOk ? T.GRN : T.RED }}>{totalOutput.toLocaleString()}</strong>
                    </span>
                    <span style={{ color: T.MUT }}>
                      {t('ui.差异', '差异')} <strong style={{ color: Math.abs(inputQty - totalOutput) > 100 ? T.RED : T.GRN }}>
                        {(inputQty - totalOutput).toLocaleString()}
                      </strong>
                    </span>
                  </div>
                </div>
                {!balanceOk && (
                  <div style={{ color: T.RED, fontSize: 13, fontWeight: 600 }}>⚠️ {t('ui.产出超过投入', '产出超过投入')}</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom action bar */}
      <div style={{ background: T.CARD, borderTop: `1px solid ${T.BOR}`, padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button onClick={() => router.push('/terminal/packaging/dashboard')}
          style={{ padding: '14px 20px', borderRadius: 10, border: `1px solid ${T.BOR}`, background: 'transparent', color: T.MUT, fontSize: 14, cursor: 'pointer' }}>
          {t('common.back', '返回')}
        </button>
        <button onClick={() => router.push('/terminal/packaging/exceptions')}
          style={{ padding: '14px 20px', borderRadius: 10, border: `1px solid rgba(239,68,68,0.4)`, background: 'rgba(239,68,68,0.1)', color: T.RED, fontSize: 14, cursor: 'pointer' }}>
          ⚠️ {t('ui.上报异常', '上报异常')}
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={handleSubmit} disabled={!canSubmit || submitting}
          style={{
            padding: '14px 48px', borderRadius: 10, border: 'none',
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
          <div style={{ background: T.CARD, borderRadius: 16, padding: 32, width: 320, border: `1px solid ${T.BOR}`, textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: T.MUT, marginBottom: 6 }}>{t('ui.录入数量枚', '录入数量（枚）')}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: gradeMap[editKey]?.color ?? T.ACC, marginBottom: 16 }}>
              {gradeMap[editKey]?.label ?? editKey}
            </div>
            <input type="number" value={editVal}
              onChange={e => setEditVal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleEditSave()}
              autoFocus
              style={{
                width: '100%', background: 'rgba(255,255,255,0.08)',
                border: `2px solid ${gradeMap[editKey]?.color ?? T.ACC}`,
                borderRadius: 10, padding: '16px', color: T.TXT,
                fontSize: 36, fontWeight: 700, textAlign: 'center',
                boxSizing: 'border-box', marginBottom: 16,
              }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setEditKey(null)}
                style={{ flex: 1, padding: '14px', background: 'transparent', border: `1px solid ${T.BOR}`, borderRadius: 8, color: T.MUT, fontSize: 15, cursor: 'pointer' }}>
                {t('common.cancel', '取消')}
              </button>
              <button onClick={handleEditSave}
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
