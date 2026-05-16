'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { GradingOutput } from '@/types/packaging-terminal';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTerminalContext } from '@/hooks/useTerminalContext';
import { packagingApi } from '@/lib/packaging-api';
import { usePackagingDicts, buildGradeMap, FALLBACK_DICTS } from '@/hooks/usePackagingDicts';

const BG='#0f172a', CARD='#1e293b', BOR='#334155';
const ACC='#f59e0b', TXT='#f1f5f9', MUT='#94a3b8', GRN='#22c55e', RED='#ef4444';

type GradeKey = GradingOutput['grade'];

export default function GradingPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const { ctx, setGradingResult } = useTerminalContext();

  // ── 从数据字典加载可售等级 + 缺陷品类（两个独立字典）────────────────────────
  const { dicts } = usePackagingDicts(['PKG_EGG_GRADE', 'PKG_EGG_DEFECT']);
  const saleableItems = (dicts.PKG_EGG_GRADE ?? FALLBACK_DICTS.PKG_EGG_GRADE);
  const defectItems   = (dicts.PKG_EGG_DEFECT ?? FALLBACK_DICTS.PKG_EGG_DEFECT);
  // 合并为统一 gradeMap，供标签/颜色查找
  const gradeMap = buildGradeMap([...saleableItems, ...defectItems]);

  const [status, setStatus] = useState<'IDLE'|'IN_PROGRESS'|'PAUSED'|'COMPLETED'>('IN_PROGRESS');
  const [outputs, setOutputs] = useState<Record<GradeKey, number>>({
    GRADE_1:0, GRADE_2:0, GRADE_3:0, GRADE_4:0, GRADE_5:0,
    DIRTY:0, BROKEN:0, REJECTED:0, RECHECK:0,
  });
  const [editKey, setEditKey] = useState<GradeKey|null>(null);
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

  const totalOutput = Object.values(outputs).reduce((a,b)=>a+b,0);
  const inputQty = ctx.currentSourceBatch?.receivedQty || 0;
  const batchCode = ctx.currentSourceBatch?.code || 'GRD-当前批次';
  const balanceOk = totalOutput <= inputQty;

  const fmtTime = (s: number) => {
    const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), ss=s%60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
  };

  const handleEditSave = () => {
    if (!editKey) return;
    setOutputs(p=>({...p,[editKey]: Math.max(0, parseInt(editVal)||0)}));
    setEditKey(null);
  };

  const GradeCard = ({ grade, qty }: { grade: GradeKey; qty: number }) => {
    const info = gradeMap[grade];
    const color = info?.color ?? '#7c3aed';
    return (
      <div onClick={() => { setEditKey(grade); setEditVal(String(qty)); }}
        style={{ background:CARD, borderRadius:12, padding:'16px 12px',
          border:`2px solid ${editKey===grade ? color : BOR}`,
          cursor:'pointer', transition:'border 0.15s', textAlign:'center' }}>
        <div style={{ fontSize:11, color:MUT, marginBottom:6 }}>{info?.label ?? grade}</div>
        <div style={{ fontSize:36, fontWeight:800, color, fontVariantNumeric:'tabular-nums', lineHeight:1 }}>
          {qty.toLocaleString()}
        </div>
        <div style={{ fontSize:10, color:MUT, marginTop:4 }}>{t('ui.枚', '枚')}</div>
      </div>
    );
  };

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', background:BG, overflow:'hidden' }}>
      <div style={{ background:CARD, borderBottom:`1px solid ${BOR}`, padding:'14px 24px', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <span style={{ fontSize:24 }}>📊</span>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:18, fontWeight:700, color:TXT }}>{t('terminal.grading', '分级作业')}</div>
          <div style={{ fontSize:12, color:MUT }}>{t('ui.批次', '批次')} {batchCode} · {t('ui.投入', '投入')} {inputQty.toLocaleString()} {t('ui.枚', '枚')}</div>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:28, fontWeight:700, color:ACC, fontVariantNumeric:'tabular-nums' }}>{fmtTime(elapsed)}</div>
          <div style={{ fontSize:11, color:MUT }}>{t('ui.作业时长', '作业时长')}</div>
        </div>
      </div>

      <div style={{ flex:1, overflow:'auto', padding:16, display:'flex', flexDirection:'column', gap:16 }}>

        {/* 可售等级 */}
        <div>
          <div style={{ fontSize:11, color:MUT, fontWeight:600, marginBottom:8, paddingLeft:2 }}>
            {t('ui.可售等级', '可售等级')}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12 }}>
            {saleableItems.map(d => {
              const tc = (d.terminalCode as string) as GradeKey;
              return <GradeCard key={tc} grade={tc} qty={outputs[tc] ?? 0} />;
            })}
          </div>
        </div>

        {/* 缺陷/损耗 */}
        <div>
          <div style={{ fontSize:11, color:MUT, fontWeight:600, marginBottom:8, paddingLeft:2 }}>
            {t('ui.缺陷损耗', '缺陷 / 损耗')}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
            {defectItems.map(d => {
              const tc = (d.terminalCode as string) as GradeKey;
              return <GradeCard key={tc} grade={tc} qty={outputs[tc] ?? 0} />;
            })}
          </div>
        </div>

        {/* 投入产出平衡 */}
        <div style={{ background:CARD, borderRadius:12, padding:16, border:`1px solid ${balanceOk?BOR:RED}`,
          display:'flex', alignItems:'center', gap:16 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:12, color:MUT, marginBottom:4 }}>{t('ui.投入产出平衡', '投入产出平衡')}</div>
            <div style={{ display:'flex', gap:24, fontSize:14 }}>
              <span style={{ color:MUT }}>{t('ui.投入', '投入')} <strong style={{ color:TXT }}>{inputQty.toLocaleString()}</strong></span>
              <span style={{ color:MUT }}>{t('ui.产出', '产出')} <strong style={{ color: balanceOk ? GRN : RED }}>{totalOutput.toLocaleString()}</strong></span>
              <span style={{ color:MUT }}>{t('ui.差异', '差异')} <strong style={{ color: Math.abs(inputQty-totalOutput)>100 ? RED : GRN }}>
                {(inputQty-totalOutput).toLocaleString()}
              </strong></span>
            </div>
          </div>
          {!balanceOk && <div style={{ color:RED, fontSize:13, fontWeight:600 }}>⚠️ {t('ui.产出超过投入', '产出超过投入')}</div>}
        </div>
      </div>

      {/* 数量修正弹窗 */}
      {editKey && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', display:'flex',
          alignItems:'center', justifyContent:'center', zIndex:100 }}>
          <div style={{ background:CARD, borderRadius:16, padding:32, width:320,
            border:`1px solid ${BOR}`, textAlign:'center' }}>
            <div style={{ fontSize:14, color:MUT, marginBottom:8 }}>{t('ui.录入数量', '录入数量')}</div>
            <div style={{ fontSize:18, fontWeight:700, color:gradeMap[editKey]?.color ?? ACC, marginBottom:16 }}>
              {gradeMap[editKey]?.label ?? editKey}
            </div>
            <input type="number" value={editVal} onChange={e=>setEditVal(e.target.value)}
              autoFocus
              style={{ width:'100%', background:'rgba(255,255,255,0.08)',
                border:`2px solid ${gradeMap[editKey]?.color ?? ACC}`,
                borderRadius:10, padding:'16px', color:TXT, fontSize:28, fontWeight:700,
                textAlign:'center', boxSizing:'border-box', marginBottom:16 }} />
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={()=>setEditKey(null)}
                style={{ flex:1, padding:'14px', background:'transparent', border:`1px solid ${BOR}`,
                  borderRadius:8, color:MUT, fontSize:15, cursor:'pointer' }}>{t('common.cancel', '取消')}</button>
              <button onClick={handleEditSave}
                style={{ flex:2, padding:'14px', background:ACC, border:'none',
                  borderRadius:8, color:'#0f172a', fontSize:15, fontWeight:700, cursor:'pointer' }}>
                {t('common.confirm', '确认')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ background:CARD, borderTop:`1px solid ${BOR}`, padding:'16px 24px',
        display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
        <button onClick={()=>router.push('/terminal/packaging/dashboard')}
          style={{ padding:'14px 20px', borderRadius:10, border:`1px solid ${BOR}`,
            background:'transparent', color:MUT, fontSize:14, cursor:'pointer' }}>{t('common.back', '返回')}</button>
        <div style={{ flex:1 }} />
        {status==='IN_PROGRESS' && (
          <button onClick={()=>setStatus('PAUSED')}
            style={{ padding:'14px 24px', borderRadius:10, border:`1px solid ${BOR}`,
              background:'rgba(255,255,255,0.05)', color:TXT, fontSize:14, cursor:'pointer' }}>
            ⏸ {t('ui.暂停', '暂停')}
          </button>
        )}
        {status==='PAUSED' && (
          <button onClick={()=>setStatus('IN_PROGRESS')}
            style={{ padding:'14px 24px', borderRadius:10, border:`1px solid ${GRN}`,
              background:'rgba(34,197,94,0.1)', color:GRN, fontSize:14, cursor:'pointer' }}>
            ▶ {t('ui.继续', '继续')}
          </button>
        )}
        <button onClick={()=>router.push('/terminal/packaging/exceptions')}
          style={{ padding:'14px 24px', borderRadius:10, border:`1px solid rgba(239,68,68,0.4)`,
            background:'rgba(239,68,68,0.1)', color:RED, fontSize:14, cursor:'pointer' }}>
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
          disabled={!balanceOk}
          style={{ padding:'14px 40px', borderRadius:10, border:'none',
            background: balanceOk ? GRN : BOR,
            color: balanceOk ? '#0f172a' : MUT,
            fontSize:16, fontWeight:700, cursor: balanceOk ? 'pointer' : 'not-allowed' }}>
          ✓ {t('ui.完成分级', '完成分级')}
        </button>
      </div>
    </div>
  );
}
