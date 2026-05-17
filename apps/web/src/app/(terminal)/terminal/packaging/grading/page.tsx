'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTerminalContext } from '@/hooks/useTerminalContext';
import { packagingApi } from '@/lib/packaging-api';
import { usePackagingDicts, buildGradeMap, FALLBACK_DICTS } from '@/hooks/usePackagingDicts';
import { T } from '@/styles/terminal-theme';


export default function GradingPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const { ctx, setGradingResult } = useTerminalContext();

  // ── 从数据字典加载可售等级 + 缺陷品类（FALLBACK 保证首渲可用）────────────────
  const { dicts } = usePackagingDicts(['PKG_EGG_GRADE', 'PKG_EGG_DEFECT']);
  const saleableItems = dicts.PKG_EGG_GRADE ?? FALLBACK_DICTS.PKG_EGG_GRADE;
  const defectItems   = dicts.PKG_EGG_DEFECT ?? FALLBACK_DICTS.PKG_EGG_DEFECT;
  const gradeMap = buildGradeMap([...saleableItems, ...defectItems]);

  // ── outputs 键从数据字典动态生成（不硬编码等级 key）────────────────────────
  const allGradeKeys = [...saleableItems, ...defectItems].map(
    d => (d.terminalCode as string) || d.code
  );
  const [outputs, setOutputs] = useState<Record<string, number>>(() =>
    Object.fromEntries(allGradeKeys.map(k => [k, 0]))
  );
  // API 字典加载后补充新 key（保留用户已录入的数量）
  useEffect(() => {
    setOutputs(prev => {
      let changed = false;
      const updated = { ...prev };
      for (const k of allGradeKeys) {
        if (!(k in updated)) { updated[k] = 0; changed = true; }
      }
      return changed ? updated : prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allGradeKeys.join(',')]);

  const [status, setStatus] = useState<'IDLE'|'IN_PROGRESS'|'PAUSED'|'COMPLETED'>('IN_PROGRESS');
  const [editKey, setEditKey] = useState<string|null>(null);
  const [editVal, setEditVal] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>|null>(null);

  useEffect(() => {
    if (status === 'IN_PROGRESS') {
      timerRef.current = setInterval(() => setElapsed(e=>e+1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [status]);

  const totalOutput = Object.values(outputs).reduce((a, b) => a + b, 0);
  const hasBatch   = !!ctx.currentSourceBatch;
  const inputQty   = ctx.currentSourceBatch?.receivedQty ?? 0;
  const batchCode  = ctx.currentSourceBatch?.code ?? '';
  // 平衡校验：有来源批次时检查产出不超投入；无批次时禁用提交而非误报超投
  const balanceOk  = hasBatch ? (inputQty === 0 || totalOutput <= inputQty) : true;
  const canSubmit  = hasBatch && balanceOk;

  const fmtTime = (s: number) => {
    const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), ss=s%60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
  };

  const handleEditSave = () => {
    if (!editKey) return;
    setOutputs(p=>({...p,[editKey]: Math.max(0, parseInt(editVal)||0)}));
    setEditKey(null);
  };

  const GradeCard = ({ grade, qty }: { grade: string; qty: number }) => {
    const info = gradeMap[grade];
    const color = info?.color ?? '#7c3aed';
    return (
      <div onClick={() => { setEditKey(grade); setEditVal(String(qty)); }}
        style={{ background:T.CARD, borderRadius:12, padding:'16px 12px',
          border:`2px solid ${editKey===grade ? color : T.BOR}`,
          cursor:'pointer', transition:'border 0.15s', textAlign:'center' }}>
        <div style={{ fontSize:11, color:T.MUT, marginBottom:6 }}>{info?.label ?? grade}</div>
        <div style={{ fontSize:36, fontWeight:800, color, fontVariantNumeric:'tabular-nums', lineHeight:1 }}>
          {qty.toLocaleString()}
        </div>
        <div style={{ fontSize:10, color:T.MUT, marginTop:4 }}>{t('ui.枚', '枚')}</div>
      </div>
    );
  };

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', background:T.BG, overflow:'hidden' }}>
      <div style={{ background:T.CARD, borderBottom:`1px solid ${T.BOR}`, padding:'14px 24px', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <span style={{ fontSize:24 }}>📊</span>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:18, fontWeight:700, color:T.TXT }}>{t('terminal.grading', '分级作业')}</div>
          <div style={{ fontSize:12, color:T.MUT }}>{t('ui.批次', '批次')} {batchCode} · {t('ui.投入', '投入')} {inputQty.toLocaleString()} {t('ui.枚', '枚')}</div>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:28, fontWeight:700, color:T.ACC, fontVariantNumeric:'tabular-nums' }}>{fmtTime(elapsed)}</div>
          <div style={{ fontSize:11, color:T.MUT }}>{t('ui.作业时长', '作业时长')}</div>
        </div>
      </div>

      <div style={{ flex:1, overflow:'auto', padding:16, display:'flex', flexDirection:'column', gap:16 }}>

        {/* 可售等级 */}
        <div>
          <div style={{ fontSize:11, color:T.MUT, fontWeight:600, marginBottom:8, paddingLeft:2 }}>
            {t('ui.可售等级', '可售等级')}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12 }}>
            {saleableItems.map(d => {
              const tc = (d.terminalCode as string);
              return <GradeCard key={tc} grade={tc} qty={outputs[tc] ?? 0} />;
            })}
          </div>
        </div>

        {/* 缺陷/损耗 */}
        <div>
          <div style={{ fontSize:11, color:T.MUT, fontWeight:600, marginBottom:8, paddingLeft:2 }}>
            {t('ui.缺陷损耗', '缺陷 / 损耗')}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
            {defectItems.map(d => {
              const tc = (d.terminalCode as string);
              return <GradeCard key={tc} grade={tc} qty={outputs[tc] ?? 0} />;
            })}
          </div>
        </div>

        {/* 投入产出平衡 */}
        <div style={{ background:T.CARD, borderRadius:12, padding:16, border:`1px solid ${balanceOk?T.BOR:T.RED}`,
          display:'flex', alignItems:'center', gap:16 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:12, color:T.MUT, marginBottom:4 }}>{t('ui.投入产出平衡', '投入产出平衡')}</div>
            <div style={{ display:'flex', gap:24, fontSize:14 }}>
              <span style={{ color:T.MUT }}>{t('ui.投入', '投入')} <strong style={{ color:T.TXT }}>{inputQty.toLocaleString()}</strong></span>
              <span style={{ color:T.MUT }}>{t('ui.产出', '产出')} <strong style={{ color: balanceOk ? T.GRN : T.RED }}>{totalOutput.toLocaleString()}</strong></span>
              <span style={{ color:T.MUT }}>{t('ui.差异', '差异')} <strong style={{ color: Math.abs(inputQty-totalOutput)>100 ? T.RED : T.GRN }}>
                {(inputQty-totalOutput).toLocaleString()}
              </strong></span>
            </div>
          </div>
          {!hasBatch && <div style={{ color:T.RED, fontSize:13, fontWeight:600 }}>⚠️ {t('ui.请先接收来源批次', '请先接收来源批次')}</div>}
          {hasBatch && !balanceOk && <div style={{ color:T.RED, fontSize:13, fontWeight:600 }}>⚠️ {t('ui.产出超过投入', '产出超过投入')}</div>}
        </div>
      </div>

      {/* 数量修正弹窗 */}
      {editKey && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', display:'flex',
          alignItems:'center', justifyContent:'center', zIndex:100 }}>
          <div style={{ background:T.CARD, borderRadius:16, padding:32, width:320,
            border:`1px solid ${T.BOR}`, textAlign:'center' }}>
            <div style={{ fontSize:14, color:T.MUT, marginBottom:8 }}>{t('ui.录入数量', '录入数量')}</div>
            <div style={{ fontSize:18, fontWeight:700, color:gradeMap[editKey]?.color ?? T.ACC, marginBottom:16 }}>
              {gradeMap[editKey]?.label ?? editKey}
            </div>
            <input type="number" value={editVal} onChange={e=>setEditVal(e.target.value)}
              autoFocus
              style={{ width:'100%', background:'rgba(255,255,255,0.08)',
                border:`2px solid ${gradeMap[editKey]?.color ?? T.ACC}`,
                borderRadius:10, padding:'16px', color:T.TXT, fontSize:28, fontWeight:700,
                textAlign:'center', boxSizing:'border-box', marginBottom:16 }} />
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={()=>setEditKey(null)}
                style={{ flex:1, padding:'14px', background:'transparent', border:`1px solid ${T.BOR}`,
                  borderRadius:8, color:T.MUT, fontSize:15, cursor:'pointer' }}>{t('common.cancel', '取消')}</button>
              <button onClick={handleEditSave}
                style={{ flex:2, padding:'14px', background:T.ACC, border:'none',
                  borderRadius:8, color:'#0f172a', fontSize:15, fontWeight:700, cursor:'pointer' }}>
                {t('common.confirm', '确认')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ background:T.CARD, borderTop:`1px solid ${T.BOR}`, padding:'16px 24px',
        display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
        <button onClick={()=>router.push('/terminal/packaging/dashboard')}
          style={{ padding:'14px 20px', borderRadius:10, border:`1px solid ${T.BOR}`,
            background:'transparent', color:T.MUT, fontSize:14, cursor:'pointer' }}>{t('common.back', '返回')}</button>
        <div style={{ flex:1 }} />
        {status==='IN_PROGRESS' && (
          <button onClick={()=>setStatus('PAUSED')}
            style={{ padding:'14px 24px', borderRadius:10, border:`1px solid ${T.BOR}`,
              background:'rgba(255,255,255,0.05)', color:T.TXT, fontSize:14, cursor:'pointer' }}>
            ⏸ {t('ui.暂停', '暂停')}
          </button>
        )}
        {status==='PAUSED' && (
          <button onClick={()=>setStatus('IN_PROGRESS')}
            style={{ padding:'14px 24px', borderRadius:10, border:`1px solid ${T.GRN}`,
              background:'rgba(34,197,94,0.1)', color:T.GRN, fontSize:14, cursor:'pointer' }}>
            ▶ {t('ui.继续', '继续')}
          </button>
        )}
        <button onClick={()=>router.push('/terminal/packaging/exceptions')}
          style={{ padding:'14px 24px', borderRadius:10, border:`1px solid rgba(239,68,68,0.4)`,
            background:'rgba(239,68,68,0.1)', color:T.RED, fontSize:14, cursor:'pointer' }}>
          ⚠️ {t('ui.上报异常', '上报异常')}
        </button>
        <button onClick={async () => {
            setStatus('COMPLETED');
            try {
              const res = await packagingApi.submitGrading({
                sourceBatchCode: ctx.currentSourceBatch?.code,
                productionDate: new Date().toISOString().slice(0, 10),
                outputs,
              });
              setGradingResult(res.code, outputs);
            } catch (e) {
              console.error('分级提交失败', e);
            }
            setTimeout(() => router.push('/terminal/packaging/packing'), 1500);
          }}
          disabled={!canSubmit}
          style={{ padding:'14px 40px', borderRadius:10, border:'none',
            background: canSubmit ? T.GRN : T.BOR,
            color: canSubmit ? '#0f172a' : T.MUT,
            fontSize:16, fontWeight:700, cursor: canSubmit ? 'pointer' : 'not-allowed' }}>
          ✓ {t('ui.完成分级', '完成分级')}
        </button>
      </div>
    </div>
  );
}
