'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { GradingOutput } from '@/types/packaging-terminal';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTerminalContext } from '@/hooks/useTerminalContext';
import { packagingApi } from '@/lib/packaging-api';
import { usePackagingDicts, buildGradeMap, FALLBACK_DICTS } from '@/hooks/usePackagingDicts';
import { T } from '@/styles/terminal-theme';
import NumPad from '@/components/terminal/NumPad';


export default function PackingPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const { ctx, setPackingResult } = useTerminalContext();

  const { dicts } = usePackagingDicts(['PKG_EGG_GRADE', 'PKG_PACK_SPEC']);
  const gradeItems = (dicts.PKG_EGG_GRADE ?? FALLBACK_DICTS.PKG_EGG_GRADE);
  const gradeMap   = buildGradeMap(gradeItems);
  const SPECS = (dicts.PKG_PACK_SPEC ?? FALLBACK_DICTS.PKG_PACK_SPEC).map(d => ({
    id:    d.code,
    name:  d.label,
    qty:   d.qty ?? 0,
    unit:  (d.unit as string) ?? '枚',
    icon:  (d.icon as string) ?? '📦',
    color: (d.color as string) ?? '#7c3aed',
  }));

  const gradingOutputs = ctx.gradingOutputs || { GRADE_1: 0, GRADE_2: 0, GRADE_3: 0, GRADE_4: 0, GRADE_5: 0 };
  const gradingCode    = ctx.gradingCode;
  const batchCode      = ctx.currentGradingBatch?.code || ctx.currentSourceBatch?.code || 'PKG-当前批次';

  const availableGrades = gradeItems
    .map(d => ({ grade: (d.terminalCode as string) as GradingOutput['grade'], qty: gradingOutputs[(d.terminalCode as string)] || 0 }))
    .filter(g => g.qty > 0);

  const [selectedGrade, setSelectedGrade] = useState<GradingOutput['grade'] | null>(null);
  const [selectedSpec,  setSelectedSpec]  = useState<typeof SPECS[0] | null>(null);
  const [boxCount,      setBoxCount]      = useState('');
  const [materialBatch, setMaterialBatch] = useState('');
  const [numpadResetKey, setNumpadResetKey] = useState(0);
  const [batches, setBatches] = useState<Array<{ grade: string; spec: string; specId: string; boxes: number; eggs: number; materialBatch: string }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const eggsForSelectedGrade = selectedGrade ? (gradingOutputs[selectedGrade] || 0) : 0;
  const boxes = parseInt(boxCount) || 0;
  const eggs  = boxes * (selectedSpec?.qty || 0);
  const canAdd = selectedGrade && selectedSpec && boxes > 0 && eggs <= eggsForSelectedGrade && materialBatch;

  const handleNumPadChange = (val: string) => setBoxCount(val);

  const handleAdd = () => {
    if (!canAdd || !selectedGrade || !selectedSpec) return;
    setBatches(prev => [...prev, {
      grade: selectedGrade, spec: selectedSpec.name, specId: selectedSpec.id,
      boxes, eggs, materialBatch,
    }]);
    setBoxCount('');
    setMaterialBatch('');
    setNumpadResetKey(k => k + 1);
  };

  const handleFinish = async () => {
    if (batches.length === 0) return;
    setSubmitting(true);
    try {
      const res = await packagingApi.submitPacking({
        gradingCode,
        productionDate: new Date().toISOString().slice(0, 10),
        batches,
      });
      setPackingResult(res.code, batches);
    } catch (e) {
      console.error('包装提交失败', e);
    }
    setDone(true);
    setTimeout(() => router.push('/terminal/packaging/label-print'), 1500);
    setSubmitting(false);
  };

  const totalBoxes = batches.reduce((a, b) => a + b.boxes, 0);
  const totalEggs  = batches.reduce((a, b) => a + b.eggs, 0);

  if (done) return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: T.BG, gap: 16 }}>
      <div style={{ fontSize: 64 }}>✅</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: T.GRN }}>{t('ui.包装完成', '包装完成')}</div>
      <div style={{ color: T.MUT }}>{t('ui.共', '共')} {totalBoxes} {t('ui.箱', '箱')} · {totalEggs.toLocaleString()} {t('ui.枚', '枚')}，{t('ui.正在打印标签', '正在打印标签...')}</div>
    </div>
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.BG, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ background: T.CARD, borderBottom: `1px solid ${T.BOR}`, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <span style={{ fontSize: 22 }}>📦</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: T.TXT }}>{t('terminal.packing', '包装作业')}</div>
          <div style={{ fontSize: 11, color: T.MUT }}>{t('ui.分级批次', '分级批次')} {batchCode}</div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, color: T.MUT }}>
          {t('ui.已包装', '已包装')} <strong style={{ color: T.ACC }}>{totalBoxes}</strong> {t('ui.箱', '箱')} / <strong style={{ color: T.ACC }}>{totalEggs.toLocaleString()}</strong> {t('ui.枚', '枚')}
        </div>
      </div>

      {/* Main body */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', gap: 0 }}>

        {/* ── Left: selections + numpad ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* ① 选等级 */}
          <div style={{ background: T.CARD, borderRadius: 12, padding: 14, border: `1px solid ${T.BOR}` }}>
            <div style={{ fontSize: 11, color: T.MUT, marginBottom: 8, fontWeight: 700, letterSpacing: 1 }}>
              ① {t('ui.选择等级', '选择等级')}
            </div>
            {availableGrades.length === 0 ? (
              <div style={{ color: T.MUT, fontSize: 12 }}>{t('ui.暂无可售等级数据', '暂无可售等级数据，请先完成分级')}</div>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {availableGrades.map(g => (
                  <button type="button" key={g.grade}
                    onPointerDown={() => setSelectedGrade(g.grade as GradingOutput['grade'])}
                    style={{
                      padding: '10px 16px', borderRadius: 8, cursor: 'pointer',
                      border: `2px solid ${selectedGrade === g.grade ? (gradeMap[g.grade]?.color ?? '#7c3aed') : T.BOR}`,
                      background: selectedGrade === g.grade ? `${(gradeMap[g.grade]?.color ?? '#7c3aed')}20` : 'rgba(255,255,255,0.03)',
                      WebkitTapHighlightColor: 'transparent',
                    }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: selectedGrade === g.grade ? (gradeMap[g.grade]?.color ?? '#7c3aed') : T.TXT }}>
                      {gradeMap[g.grade]?.label ?? g.grade}
                    </div>
                    <div style={{ fontSize: 10, color: T.MUT }}>{t('ui.余', '余')} {g.qty.toLocaleString()} {t('ui.枚', '枚')}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ② 选规格 */}
          <div style={{ background: T.CARD, borderRadius: 12, padding: 14, border: `1px solid ${T.BOR}` }}>
            <div style={{ fontSize: 11, color: T.MUT, marginBottom: 8, fontWeight: 700, letterSpacing: 1 }}>
              ② {t('ui.选择包装规格', '选择包装规格')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {SPECS.map(spec => (
                <button type="button" key={spec.id}
                  onPointerDown={() => setSelectedSpec(spec)}
                  style={{
                    padding: '12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                    border: `2px solid ${selectedSpec?.id === spec.id ? spec.color : T.BOR}`,
                    background: selectedSpec?.id === spec.id ? `${spec.color}15` : 'rgba(255,255,255,0.03)',
                    display: 'flex', alignItems: 'center', gap: 8,
                    WebkitTapHighlightColor: 'transparent',
                  }}>
                  <span style={{ fontSize: 22 }}>{spec.icon}</span>
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

          {/* ③ 录入箱数 — inline NumPad (no modal) */}
          <div style={{ background: T.CARD, borderRadius: 12, padding: 14, border: `1px solid ${T.BOR}` }}>
            <div style={{ fontSize: 11, color: T.MUT, marginBottom: 10, fontWeight: 700, letterSpacing: 1 }}>
              ③ {t('ui.录入箱数加包材批次', '录入箱数 + 包材批次')}
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              {/* NumPad (always visible) */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: T.MUT, marginBottom: 6 }}>{t('ui.本次包装箱数', '本次包装箱数（键盘直接录入）')}</div>
                <NumPad
                  key={numpadResetKey}
                  initialValue=""
                  accentColor={selectedSpec?.color ?? T.ACC}
                  onChange={handleNumPadChange}
                />
                {selectedSpec && boxes > 0 && (
                  <div style={{ fontSize: 11, color: T.MUT, marginTop: 6, textAlign: 'center' }}>
                    = {(boxes * (selectedSpec.qty || 1)).toLocaleString()} {t('ui.枚', '枚')}
                    {eggs > eggsForSelectedGrade && <span style={{ color: T.RED }}> ⚠️ {t('ui.超过余量', '超过余量')}</span>}
                  </div>
                )}
              </div>

              {/* Material batch + add button */}
              <div style={{ width: 180, display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 22 }}>
                <div>
                  <div style={{ fontSize: 10, color: T.MUT, marginBottom: 4 }}>{t('ui.包材批次号扫码', '包材批次号（扫码）')}</div>
                  <input
                    value={materialBatch}
                    onChange={e => setMaterialBatch(e.target.value)}
                    placeholder={t('ui.扫描或输入包材批次', '扫描或输入包材批次')}
                    style={{
                      width: '100%', background: 'rgba(255,255,255,0.05)',
                      border: `1px solid ${T.BOR}`, borderRadius: 8,
                      padding: '10px 12px', color: T.TXT, fontSize: 13,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <button type="button" onClick={handleAdd} disabled={!canAdd}
                  style={{
                    padding: '14px', borderRadius: 8, border: 'none',
                    background: canAdd ? T.ACC : T.BOR,
                    color: canAdd ? '#0f172a' : T.MUT,
                    fontSize: 15, fontWeight: 700,
                    cursor: canAdd ? 'pointer' : 'not-allowed',
                    marginTop: 'auto',
                  }}>
                  + {t('common.new', '添加')}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right: batch records ── */}
        <div style={{ width: 260, flexShrink: 0, borderLeft: `1px solid ${T.BOR}`, display: 'flex', flexDirection: 'column', background: '#0a1628' }}>
          <div style={{ padding: '10px 14px', fontSize: 10, color: T.MUT, fontWeight: 700, letterSpacing: 1.5, borderBottom: `1px solid ${T.BOR}`, textTransform: 'uppercase' }}>
            {t('ui.已包装记录', '已包装记录')}（{batches.length}）
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
            {batches.length === 0 ? (
              <div style={{ color: T.MUT, fontSize: 12, textAlign: 'center', padding: '24px 0' }}>
                {t('common.no_data', '暂无记录')}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {batches.map((b, i) => (
                  <div key={i} style={{
                    background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '10px 12px',
                    borderLeft: `3px solid ${(gradeMap[b.grade]?.color as string) ?? T.ACC}`,
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.TXT }}>{gradeMap[b.grade]?.label ?? b.grade}</div>
                    <div style={{ fontSize: 11, color: T.MUT }}>{b.spec}</div>
                    <div style={{ fontSize: 13, color: T.ACC, fontWeight: 700 }}>
                      {b.boxes} {t('ui.箱', '箱')} · {b.eggs.toLocaleString()} {t('ui.枚', '枚')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ background: T.CARD, borderTop: `1px solid ${T.BOR}`, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button type="button" onClick={() => router.push('/terminal/packaging/dashboard')}
          style={{ padding: '12px 24px', borderRadius: 10, border: `1px solid ${T.BOR}`, background: 'transparent', color: T.MUT, fontSize: 14, cursor: 'pointer' }}>
          {t('common.back', '返回')}
        </button>
        <div style={{ flex: 1, fontSize: 12, color: T.MUT }}>
          {t('ui.合计', '合计')} {totalBoxes} {t('ui.箱', '箱')} · {totalEggs.toLocaleString()} {t('ui.枚', '枚')}
        </div>
        <button type="button" onClick={handleFinish} disabled={batches.length === 0 || submitting}
          style={{
            padding: '12px 36px', borderRadius: 10, border: 'none',
            background: batches.length > 0 ? T.GRN : T.BOR,
            color: batches.length > 0 ? '#0f172a' : T.MUT,
            fontSize: 15, fontWeight: 700,
            cursor: batches.length > 0 ? 'pointer' : 'not-allowed',
            opacity: submitting ? 0.7 : 1,
          }}>
          {submitting ? t('ui.提交中', '提交中...') : `✓ ${t('ui.完成包装打印标签', '完成包装 → 打印标签')}`}
        </button>
      </div>
    </div>
  );
}
