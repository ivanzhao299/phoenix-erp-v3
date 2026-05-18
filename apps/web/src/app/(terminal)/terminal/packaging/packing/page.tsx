'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { GradingOutput } from '@/types/packaging-terminal';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTerminalContext } from '@/hooks/useTerminalContext';
import { packagingApi } from '@/lib/packaging-api';
import { usePackagingDicts, buildGradeMap, FALLBACK_DICTS } from '@/hooks/usePackagingDicts';
import { T } from '@/styles/terminal-theme';


export default function PackingPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const { ctx, setPackingResult } = useTerminalContext();
  // ── 从数据字典加载等级色彩 + 包装规格 ────────────────────────────────────────
  const { dicts } = usePackagingDicts(['PKG_EGG_GRADE', 'PKG_PACK_SPEC']);
  // PKG_EGG_GRADE 现在只含可售等级（1~5号蛋），无需再过滤 isDefect
  const gradeItems = (dicts.PKG_EGG_GRADE ?? FALLBACK_DICTS.PKG_EGG_GRADE);
  const gradeMap = buildGradeMap(gradeItems);
  // 将 PKG_PACK_SPEC 转为 packing page 期望的 spec 对象格式
  const SPECS = (dicts.PKG_PACK_SPEC ?? FALLBACK_DICTS.PKG_PACK_SPEC).map(d => ({
    id:    d.code,
    name:  d.label,
    qty:   d.qty ?? 0,
    unit:  (d.unit as string) ?? '枚',
    icon:  (d.icon as string) ?? '📦',
    color: (d.color as string) ?? '#7c3aed',
  }));

  const gradingOutputs = ctx.gradingOutputs || { GRADE_1: 0, GRADE_2: 0, GRADE_3: 0, GRADE_4: 0, GRADE_5: 0 };
  const gradingCode = ctx.gradingCode;
  const batchCode = ctx.currentGradingBatch?.code || ctx.currentSourceBatch?.code || 'PKG-当前批次';
  // gradeItems 现在只有可售等级，直接映射分级产出
  const availableGrades = gradeItems
    .map(d => ({ grade: (d.terminalCode as string) as GradingOutput['grade'], qty: gradingOutputs[(d.terminalCode as string)] || 0 }))
    .filter(g => g.qty > 0);
  const [selectedGrade, setSelectedGrade] = useState<GradingOutput['grade']|null>(null);
  const [selectedSpec, setSelectedSpec] = useState<typeof SPECS[0]|null>(null);
  const [boxCount, setBoxCount] = useState('');
  const [materialBatch, setMaterialBatch] = useState('');
  const [batches, setBatches] = useState<Array<{grade:string;spec:string;specId:string;boxes:number;eggs:number;materialBatch:string}>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const eggsForSelectedGrade = selectedGrade ? (gradingOutputs[selectedGrade] || 0) : 0;
  const boxes = parseInt(boxCount)||0;
  const eggs = boxes * (selectedSpec?.qty||0);
  const canAdd = selectedGrade && selectedSpec && boxes > 0 && eggs <= eggsForSelectedGrade && materialBatch;

  const handleAdd = () => {
    if (!canAdd || !selectedGrade || !selectedSpec) return;
    setBatches(prev => [...prev, {
      grade: selectedGrade, spec: selectedSpec.name, specId: selectedSpec.id,
      boxes, eggs, materialBatch,
    }]);
    setBoxCount(''); setMaterialBatch('');
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

  const totalBoxes = batches.reduce((a,b)=>a+b.boxes,0);
  const totalEggs = batches.reduce((a,b)=>a+b.eggs,0);

  if (done) return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:T.BG, gap:16 }}>
      <div style={{ fontSize:64 }}>✅</div>
      <div style={{ fontSize:24, fontWeight:700, color:T.GRN }}>{t('ui.包装完成', '包装完成')}</div>
      <div style={{ color:T.MUT }}>{t('ui.共', '共')} {totalBoxes} {t('ui.箱', '箱')} · {totalEggs.toLocaleString()} {t('ui.枚', '枚')}，{t('ui.正在打印标签', '正在打印标签...')}</div>
    </div>
  );

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', background:T.BG, overflow:'hidden' }}>
      <div style={{ background:T.CARD, borderBottom:`1px solid ${T.BOR}`, padding:'14px 24px', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <span style={{ fontSize:24 }}>📦</span>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:18, fontWeight:700, color:T.TXT }}>{t('terminal.packing', '包装作业')}</div>
          <div style={{ fontSize:12, color:T.MUT }}>{t('ui.分级批次', '分级批次')} {batchCode}</div>
        </div>
        <div style={{ textAlign:'right', fontSize:13, color:T.MUT }}>
          {t('ui.已包装', '已包装')} <strong style={{ color:T.ACC }}>{totalBoxes}</strong> {t('ui.箱', '箱')} / <strong style={{ color:T.ACC }}>{totalEggs.toLocaleString()}</strong> {t('ui.枚', '枚')}
        </div>
      </div>

      <div style={{ flex:1, overflow:'auto', padding:16, display:'flex', gap:16 }}>
        {/* 左：选等级 + 选规格 + 录入 */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', gap:12 }}>
          {/* 选等级 */}
          <div style={{ background:T.CARD, borderRadius:12, padding:16, border:`1px solid ${T.BOR}` }}>
            <div style={{ fontSize:12, color:T.MUT, marginBottom:10, fontWeight:600 }}>1. {t('ui.选择等级', '选择等级')}</div>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
              {availableGrades.map(g => (
                <button type="button" key={g.grade} onClick={()=>setSelectedGrade(g.grade as GradingOutput['grade'])}
                  style={{ padding:'12px 20px', borderRadius:10, cursor:'pointer',
                    border:`2px solid ${selectedGrade===g.grade ? (gradeMap[g.grade]?.color ?? '#7c3aed') : T.BOR}`,
                    background: selectedGrade===g.grade ? `${(gradeMap[g.grade]?.color ?? '#7c3aed')}20` : 'rgba(255,255,255,0.03)',
                    transition:'all 0.15s' }}>
                  <div style={{ fontSize:13, fontWeight:600, color: selectedGrade===g.grade ? (gradeMap[g.grade]?.color ?? '#7c3aed') : T.TXT }}>
                    {gradeMap[g.grade]?.label ?? g.grade}
                  </div>
                  <div style={{ fontSize:11, color:T.MUT }}>{t('ui.余', '余')} {g.qty.toLocaleString()} {t('ui.枚', '枚')}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 选规格 */}
          <div style={{ background:T.CARD, borderRadius:12, padding:16, border:`1px solid ${T.BOR}` }}>
            <div style={{ fontSize:12, color:T.MUT, marginBottom:10, fontWeight:600 }}>2. {t('ui.选择包装规格', '选择包装规格')}</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {SPECS.map(spec => (
                <button type="button" key={spec.id} onClick={()=>setSelectedSpec(spec)}
                  style={{ padding:'16px', borderRadius:10, cursor:'pointer', textAlign:'left',
                    border:`2px solid ${selectedSpec?.id===spec.id ? spec.color : T.BOR}`,
                    background: selectedSpec?.id===spec.id ? `${spec.color}15` : 'rgba(255,255,255,0.03)',
                    transition:'all 0.15s', display:'flex', alignItems:'center', gap:12 }}>
                  <span style={{ fontSize:28 }}>{spec.icon}</span>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, color: selectedSpec?.id===spec.id ? spec.color : T.TXT }}>
                      {spec.name}
                    </div>
                    {spec.qty > 0 && <div style={{ fontSize:11, color:T.MUT }}>{spec.qty} {spec.unit}/{t('ui.箱', '箱')}</div>}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 录入数量 */}
          <div style={{ background:T.CARD, borderRadius:12, padding:16, border:`1px solid ${T.BOR}` }}>
            <div style={{ fontSize:12, color:T.MUT, marginBottom:10, fontWeight:600 }}>3. {t('ui.录入箱数加包材批次', '录入箱数 + 包材批次')}</div>
            <div style={{ display:'flex', gap:12, alignItems:'flex-end' }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:11, color:T.MUT, marginBottom:4 }}>{t('ui.本次包装箱数', '本次包装箱数')}</div>
                <input type="number" value={boxCount} onChange={e=>setBoxCount(e.target.value)}
                  placeholder="0"
                  style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:`1px solid ${T.BOR}`,
                    borderRadius:8, padding:'14px', color:T.TXT, fontSize:24, fontWeight:700,
                    textAlign:'center', boxSizing:'border-box' }} />
                {selectedSpec && boxes > 0 && (
                  <div style={{ fontSize:12, color:T.MUT, marginTop:4, textAlign:'center' }}>
                    = {(boxes * (selectedSpec.qty||1)).toLocaleString()} {t('ui.枚', '枚')}
                    {eggs > eggsForSelectedGrade && <span style={{ color:T.RED }}> ⚠️ {t('ui.超过余量', '超过余量')}</span>}
                  </div>
                )}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:11, color:T.MUT, marginBottom:4 }}>{t('ui.包材批次号扫码', '包材批次号（扫码）')}</div>
                <input value={materialBatch} onChange={e=>setMaterialBatch(e.target.value)}
                  placeholder={t('ui.扫描或输入包材批次', '扫描或输入包材批次')}
                  style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:`1px solid ${T.BOR}`,
                    borderRadius:8, padding:'14px', color:T.TXT, fontSize:14, boxSizing:'border-box' }} />
              </div>
              <button type="button" onClick={handleAdd} disabled={!canAdd}
                style={{ padding:'14px 24px', borderRadius:8, border:'none',
                  background: canAdd ? T.ACC : T.BOR, color: canAdd ? '#0f172a' : T.MUT,
                  fontSize:15, fontWeight:700, cursor: canAdd ? 'pointer' : 'not-allowed',
                  whiteSpace:'nowrap', flexShrink:0 }}>
                + {t('common.new', '添加')}
              </button>
            </div>
          </div>
        </div>

        {/* 右：已包装记录 */}
        <div style={{ width:280, flexShrink:0 }}>
          <div style={{ background:T.CARD, borderRadius:12, padding:16, border:`1px solid ${T.BOR}`, height:'100%' }}>
            <div style={{ fontSize:12, color:T.MUT, marginBottom:10, fontWeight:600 }}>{t('ui.已包装记录', '已包装记录')}</div>
            {batches.length === 0 ? (
              <div style={{ color:T.MUT, fontSize:13, textAlign:'center', padding:'24px 0' }}>{t('common.no_data', '暂无记录')}</div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {batches.map((b,i) => (
                  <div key={i} style={{ background:'rgba(255,255,255,0.04)', borderRadius:8, padding:'10px 12px',
                    borderLeft:`3px solid ${(gradeMap[b.grade]?.color ?? T.ACC)}` }}>
                    <div style={{ fontSize:13, fontWeight:600, color:T.TXT }}>{gradeMap[b.grade]?.label ?? b.grade}</div>
                    <div style={{ fontSize:12, color:T.MUT }}>{b.spec}</div>
                    <div style={{ fontSize:14, color:T.ACC, fontWeight:700 }}>
                      {b.boxes} {t('ui.箱', '箱')} · {b.eggs.toLocaleString()} {t('ui.枚', '枚')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ background:T.CARD, borderTop:`1px solid ${T.BOR}`, padding:'16px 24px',
        display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <button type="button" onClick={()=>router.push('/terminal/packaging/dashboard')}
          style={{ padding:'14px 28px', borderRadius:10, border:`1px solid ${T.BOR}`,
            background:'transparent', color:T.MUT, fontSize:15, cursor:'pointer' }}>{t('common.back', '返回')}</button>
        <div style={{ flex:1, fontSize:13, color:T.MUT }}>
          {t('ui.合计', '合计')} {totalBoxes} {t('ui.箱', '箱')} · {totalEggs.toLocaleString()} {t('ui.枚', '枚')}
        </div>
        <button type="button" onClick={handleFinish} disabled={batches.length===0||submitting}
          style={{ padding:'14px 40px', borderRadius:10, border:'none',
            background: batches.length>0 ? T.GRN : T.BOR,
            color: batches.length>0 ? '#0f172a' : T.MUT,
            fontSize:16, fontWeight:700, cursor: batches.length>0 ? 'pointer' : 'not-allowed',
            opacity: submitting ? 0.7 : 1 }}>
          {submitting ? t('ui.提交中', '提交中...') : `✓ ${t('ui.完成包装打印标签', '完成包装 → 打印标签')}`}
        </button>
      </div>
    </div>
  );
}
