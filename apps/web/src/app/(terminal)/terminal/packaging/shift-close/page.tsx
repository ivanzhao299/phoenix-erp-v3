'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTerminalContext } from '@/hooks/useTerminalContext';
import { packagingApi } from '@/lib/packaging-api';
import { T } from '@/styles/terminal-theme';



export default function ShiftClosePage() {
  const router = useRouter();
  const { t } = useLanguage();
  const { ctx, clearWorkflowState, setShift } = useTerminalContext();
  const shift = ctx.currentShift;
  const [varianceReason, setVarianceReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(true);

  const [summary, setSummary] = useState({
    receivedQty: 0, receivedWeight: 0,
    gradedQty: 0,
    largeA: 0, mediumA: 0, smallA: 0, bGrade: 0,
    broken: 0, dirty: 0, rejected: 0,
    packedBoxes: 0, packedEggs: 0,
    warehousedBoxes: 0, warehousedPallets: 0,
    openExceptions: 0, closedExceptions: 0,
    variance: 0, variancePct: 0,
  });

  useEffect(() => {
    const shiftId = shift?.id ? String(shift.id) : undefined;
    packagingApi.getShiftSummary(undefined, shiftId).then(data => {
      const gradingOutputs = ctx.gradingOutputs || {};
      // 本班实际包装量：优先使用后端按 shift_id 精确统计的数据
      const totalPacked = data.shiftPackedBoxes ?? (ctx.packingBatches || []).reduce((a, b) => a + b.boxes, 0);
      const totalEggs   = data.shiftPackedEggs  ?? (ctx.packingBatches || []).reduce((a, b) => a + b.eggs,  0);
      const received = data.receivedQty || 0;
      const variance = received - totalEggs;
      const variancePct = received > 0 ? Math.round((Math.abs(variance) / received) * 1000) / 10 : 0;
      setSummary({
        receivedQty:       received,
        receivedWeight:    data.receivedWeight || 0,
        gradedQty:         received,
        largeA:            gradingOutputs['A_LARGE'] || 0,
        mediumA:           gradingOutputs['A_MEDIUM'] || 0,
        smallA:            gradingOutputs['A_SMALL'] || 0,
        bGrade:            gradingOutputs['B'] || 0,
        broken:            gradingOutputs['BROKEN'] || 0,
        dirty:             gradingOutputs['DIRTY'] || 0,
        rejected:          gradingOutputs['REJECTED'] || 0,
        packedBoxes:       totalPacked,
        packedEggs:        totalEggs,
        warehousedBoxes:   totalPacked,
        warehousedPallets: Math.ceil(totalPacked / 25),
        openExceptions:    data.openExceptionCount || 0,
        closedExceptions:  data.closedExceptionCount || 0,
        variance,
        variancePct,
      });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const hasVariance = summary.variancePct > 1;
  const hasOpenException = summary.openExceptions > 0;
  const canClose = !hasOpenException;

  const handleClose = async () => {
    if (!shift?.id) {
      setSubmitError(t('ui.当前无开放班次无法交班', '当前无开放班次，无法交班'));
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      await packagingApi.closeShift(String(shift.id), { varianceReason, summary });
      // 更新 context：清工作流数据 + 将班次状态置为 CLOSED
      clearWorkflowState();
      setShift({ ...shift, status: 'CLOSED', closedAt: new Date().toISOString() });
      setDone(true);
      setTimeout(() => router.push('/terminal/packaging/dashboard'), 2500);
    } catch (e: any) {
      setSubmitError(e?.message || t('ui.交班失败请重试', '交班失败，请重试'));
    } finally {
      setSubmitting(false);
    }
  };

  // 无班次或已交班 — 提前拦截
  if (!loading && (!shift || shift.status === 'CLOSED')) return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:T.BG, gap:16 }}>
      <div style={{ fontSize:56 }}>📋</div>
      <div style={{ fontSize:20, fontWeight:700, color:T.MUT }}>
        {shift?.status === 'CLOSED' ? t('ui.该班次已交班', '该班次已交班') : t('ui.当前无开放班次', '当前无开放班次')}
      </div>
      <button type="button" onClick={() => router.push('/terminal/packaging/dashboard')}
        style={{ padding:'12px 32px', borderRadius:10, border:`1px solid ${T.BOR}`,
          background:'transparent', color:T.MUT, fontSize:15, cursor:'pointer' }}>
        {t('ui.返回作业台', '返回作业台')}
      </button>
    </div>
  );

  if (loading) return (
    <div style={{ height:'100%', display:'flex', alignItems:'center', justifyContent:'center', background:T.BG }}>
      <div style={{ fontSize:16, color:T.MUT }}>{t('ui.加载交班数据', '加载交班数据...')}</div>
    </div>
  );

  if (done) return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:T.BG, gap:16 }}>
      <div style={{ fontSize:64 }}>📋</div>
      <div style={{ fontSize:24, fontWeight:700, color:T.GRN }}>{t('ui.交班完成', '交班完成')}</div>
      <div style={{ color:T.MUT }}>{t('ui.班次', '班次')} {shift?.code || 'SHIFT-本班'} {t('ui.已关闭返回作业台', '已关闭，返回作业台...')}</div>
    </div>
  );

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', background:T.BG, overflow:'hidden' }}>
      <div style={{ background:T.CARD, borderBottom:`1px solid ${T.BOR}`, padding:'14px 24px', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <span style={{ fontSize:24 }}>📋</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize:18, fontWeight:700, color:T.TXT }}>{t('terminal.shift_close', '交班日报')}</div>
          <div style={{ fontSize:12, color:T.MUT }}>{t('ui.班次', '班次')} {shift?.code || '--'} · {shift?.productionDate || '--'} · {shift?.lineName || shift?.lineId || 'Line-01'}</div>
        </div>
      </div>

      <div style={{ flex:1, overflow:'hidden', minHeight:0, padding:24 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16, marginBottom:16 }}>
          {/* 接收 */}
          <div style={{ background:T.CARD, borderRadius:12, padding:16, border:`1px solid ${T.BOR}` }}>
            <div style={{ fontSize:12, color:T.MUT, marginBottom:10, fontWeight:600 }}>📥 {t('ui.接收', '接收')}</div>
            {[[t('ui.接收总量', '接收总量'), `${summary.receivedQty.toLocaleString()} ${t('ui.枚', '枚')}`],
              [t('ui.接收重量', '接收重量'), `${summary.receivedWeight} kg`]].map(([k,v])=>(
              <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0',
                borderBottom:`1px solid var(--overlay-white-05)`, fontSize:13 }}>
                <span style={{ color:T.MUT }}>{k}</span>
                <span style={{ color:T.TXT, fontWeight:600, fontVariantNumeric:'tabular-nums' }}>{v}</span>
              </div>
            ))}
          </div>

          {/* 分级 */}
          <div style={{ background:T.CARD, borderRadius:12, padding:16, border:`1px solid ${T.BOR}` }}>
            <div style={{ fontSize:12, color:T.MUT, marginBottom:10, fontWeight:600 }}>📊 {t('ui.分级产出', '分级产出')}</div>
            {[[t('ui.A大码', 'A大码'), summary.largeA.toLocaleString()],
              [t('ui.A中码', 'A中码'), summary.mediumA.toLocaleString()],
              [t('ui.A小码', 'A小码'), summary.smallA.toLocaleString()],
              [t('ui.B级', 'B级'),   summary.bGrade.toLocaleString()],
              [t('ui.破损', '破损'),  summary.broken.toLocaleString()],
              [t('ui.脏污', '脏污'),  summary.dirty.toLocaleString()]].map(([k,v])=>(
              <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0',
                borderBottom:`1px solid var(--overlay-white-05)`, fontSize:12 }}>
                <span style={{ color:T.MUT }}>{k}</span>
                <span style={{ color:T.TXT }}>{v} {t('ui.枚', '枚')}</span>
              </div>
            ))}
          </div>

          {/* 包装入库 */}
          <div style={{ background:T.CARD, borderRadius:12, padding:16, border:`1px solid ${T.BOR}` }}>
            <div style={{ fontSize:12, color:T.MUT, marginBottom:10, fontWeight:600 }}>📦 {t('ui.包装入库', '包装 & 入库')}</div>
            {[[t('ui.已包装', '已包装'), `${summary.packedBoxes} ${t('ui.箱', '箱')}`],
              [t('ui.包装枚数', '包装枚数'), `${summary.packedEggs.toLocaleString()} ${t('ui.枚', '枚')}`],
              [t('ui.已入库', '已入库'), `${summary.warehousedBoxes} ${t('ui.箱', '箱')}`],
              [t('ui.托盘数', '托盘数'), `${summary.warehousedPallets} ${t('ui.托', '托')}`]].map(([k,v])=>(
              <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0',
                borderBottom:`1px solid var(--overlay-white-05)`, fontSize:13 }}>
                <span style={{ color:T.MUT }}>{k}</span>
                <span style={{ color:T.TXT, fontWeight:600, fontVariantNumeric:'tabular-nums' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 差异 & 异常 */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <div style={{ background:T.CARD, borderRadius:12, padding:16,
            border:`1px solid ${hasVariance?'var(--status-warning)':T.BOR}` }}>
            <div style={{ fontSize:12, color:T.MUT, marginBottom:10, fontWeight:600 }}>
              ⚖️ {t('ui.投入产出差异', '投入产出差异')} {hasVariance && <span style={{ color:T.ACC }}>({summary.variancePct}%)</span>}
            </div>
            <div style={{ fontSize:14, color:T.TXT, marginBottom:8 }}>
              {t('ui.差异', '差异')} <strong style={{ color:hasVariance?T.ACC:T.GRN }}>{summary.variance} {t('ui.枚', '枚')}</strong>（{t('ui.投入', '投入')} {summary.receivedQty.toLocaleString()} / {t('ui.产出', '产出')} {summary.packedEggs.toLocaleString()}）
            </div>
            {hasVariance && (
              <div style={{ padding:'8px 12px', borderRadius:8,
                background:'var(--status-warning-bg-faint)', border:`1px solid var(--status-warning-border)`,
                fontSize:12, color:T.ACC }}>
                {t('ui.中途换班差异正常可交班', '中途换班差异属正常情况，不影响交班。剩余未包装量由下班继续处理。')}
              </div>
            )}
          </div>

          <div style={{ background:T.CARD, borderRadius:12, padding:16,
            border:`1px solid ${hasOpenException?'var(--status-danger)':T.BOR}` }}>
            <div style={{ fontSize:12, color:T.MUT, marginBottom:10, fontWeight:600 }}>⚠️ {t('ui.异常汇总', '异常汇总')}</div>
            <div style={{ fontSize:14, color:T.TXT, marginBottom:8 }}>
              {t('ui.未关闭', '未关闭')} <strong style={{ color:hasOpenException?T.RED:T.GRN }}>{summary.openExceptions}</strong> {t('ui.条', '条')} /
              {t('ui.已关闭', '已关闭')} <strong style={{ color:T.GRN }}>{summary.closedExceptions}</strong> {t('ui.条', '条')}
            </div>
            <div style={{ overflow:'hidden', maxHeight: hasOpenException ? 120 : 0 }}>
              <div style={{ padding:'10px 12px', borderRadius:8,
                background:'var(--status-danger-bg-light)', border:`1px solid var(--status-danger-bg-strong)`,
                fontSize:13, color:T.RED }}>
                ⚠️ {t('ui.存在未关闭异常必须先处理', '存在未关闭异常，必须先处理后才能交班')}
                <br />
                <button type="button" onClick={()=>router.push('/terminal/packaging/exceptions')}
                  style={{ marginTop:8, padding:'6px 14px', borderRadius:6, border:`1px solid ${T.RED}`,
                    background:'transparent', color:T.RED, fontSize:12, cursor:'pointer' }}>
                  → {t('ui.去处理异常', '去处理异常')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ background:T.CARD, borderTop:`1px solid ${T.BOR}`, padding:'16px 24px',
        display:'flex', flexDirection:'column', gap:8, flexShrink:0 }}>
        {submitError && (
          <div style={{ background:'var(--status-danger-bg-light)', border:'1px solid var(--status-danger-bg-strong)',
            borderRadius:8, padding:'10px 16px', fontSize:14, color:T.RED }}>
            ⚠️ {submitError}
          </div>
        )}
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <button type="button" onClick={()=>router.push('/terminal/packaging/dashboard')}
          style={{ padding:'14px 28px', borderRadius:10, border:`1px solid ${T.BOR}`,
            background:'transparent', color:T.MUT, fontSize:15, cursor:'pointer' }}>{t('common.back', '返回')}</button>
        <div style={{ flex:1, fontSize:13, color: canClose?T.MUT:T.RED }}>
          {!canClose && `⚠️ ${t('ui.有未关闭异常不可交班', '有未关闭异常，不可交班')}`}
        </div>
        <button type="button" onClick={()=>setShowConfirm(true)} disabled={!canClose||submitting}
          style={{ padding:'14px 40px', borderRadius:10, border:'none',
            background:canClose?T.ACC:T.BOR, color:canClose?'var(--bg-page)':T.MUT,
            fontSize:16, fontWeight:700, cursor:canClose?'pointer':'not-allowed' }}>
          📋 {t('ui.提交交班', '提交交班')}
        </button>
        </div>
      </div>

      {showConfirm && (
        <div style={{ position:'fixed', inset:0, background:'var(--overlay-black-30)', display:'flex',
          alignItems:'center', justifyContent:'center', zIndex:200 }}>
          <div style={{ background:T.CARD, borderRadius:16, padding:32, width:360, border:`1px solid ${T.BOR}`, textAlign:'center' }}>
            <div style={{ fontSize:48, marginBottom:12 }}>📋</div>
            <div style={{ fontSize:18, fontWeight:700, color:T.TXT, marginBottom:8 }}>{t('ui.确认交班', '确认交班？')}</div>
            <div style={{ fontSize:13, color:T.MUT, marginBottom:24 }}>
              {t('ui.班次', '班次')} {shift?.code || 'SHIFT-本班'}<br />
              {shift?.productionDate || '--'} · {shift?.lineName || shift?.lineId || 'Line-01'}<br />
              {t('ui.共接收', '共接收')} {summary.receivedQty.toLocaleString()} {t('ui.枚', '枚')}，{t('ui.入库', '入库')} {summary.warehousedBoxes} {t('ui.箱', '箱')}
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button type="button" onClick={()=>setShowConfirm(false)}
                style={{ flex:1, padding:'14px', background:'transparent', border:`1px solid ${T.BOR}`,
                  borderRadius:8, color:T.MUT, fontSize:15, cursor:'pointer' }}>{t('common.cancel', '取消')}</button>
              <button type="button" onClick={()=>{setShowConfirm(false);handleClose();}}
                style={{ flex:2, padding:'14px', background:T.ACC, border:'none',
                  borderRadius:8, color:'var(--bg-page)', fontSize:15, fontWeight:700, cursor:'pointer' }}>
                {t('ui.确认交班', '确认交班')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
