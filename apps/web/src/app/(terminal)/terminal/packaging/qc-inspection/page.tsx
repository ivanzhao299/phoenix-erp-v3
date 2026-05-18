'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { packagingApi } from '@/lib/packaging-api';
import { useTerminalContext } from '@/hooks/useTerminalContext';
import { usePackagingDicts, FALLBACK_DICTS } from '@/hooks/usePackagingDicts';
import type { QCResult } from '@/types/packaging-terminal';
import { T } from '@/styles/terminal-theme';


export default function QCInspectionPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const { ctx } = useTerminalContext();
  const batch = ctx.currentSourceBatch ?? { id: 0, code: '--', receivedQty: 0 };

  // ── 从数据字典加载 QC 检验结论 ──────────────────────────────────────────────
  const { dicts } = usePackagingDicts(['PKG_QC_RESULT']);
  const QC_RESULTS = (dicts.PKG_QC_RESULT ?? FALLBACK_DICTS.PKG_QC_RESULT).map(d => ({
    value:  ((d.terminalCode as string) || d.code) as QCResult,
    label:  d.label,
    desc:   (d.desc as string) ?? '',
    color:  (d.color as string) ?? '#94a3b8',
    routeTo:(d.routeTo as string) ?? 'exceptions',
  }));
  const [form, setForm] = useState({
    sampleQty:'100', brokenQty:'2', dirtyQty:'3',
    leakingQty:'0', abnormalShapeQty:'1', floorEggQty:'0',
    averageWeight:'60.2',
    shellOk:true, odorOk:true, containerOk:true,
    qcResult:'' as QCResult|'', comment:'',
  });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [resultLabel, setResultLabel] = useState('');

  const setNum = (key: string, val: string) => setForm(p=>({...p,[key]:val}));

  const handleSubmit = async () => {
    if (!form.qcResult) return;
    setSubmitting(true);
    try {
      await packagingApi.submitQCInspection({
        sourceBatchId: batch.id,
        sampleQty: Number(form.sampleQty),
        brokenQty: Number(form.brokenQty),
        dirtyQty: Number(form.dirtyQty),
        leakingQty: Number(form.leakingQty),
        abnormalShapeQty: Number(form.abnormalShapeQty),
        floorEggQty: Number(form.floorEggQty),
        averageWeight: Number(form.averageWeight),
        shellOk: form.shellOk,
        odorOk: form.odorOk,
        containerOk: form.containerOk,
        result: form.qcResult as QCResult,
        comment: form.comment,
      });
      const matched = QC_RESULTS.find(r=>r.value===form.qcResult);
      setResultLabel(matched?.label || '');
      setDone(true);
      const dest = matched?.routeTo === 'grading'
        ? '/terminal/packaging/grading' : '/terminal/packaging/exceptions';
      setTimeout(() => router.push(dest), 2000);
    } finally { setSubmitting(false); }
  };

  if (done) {
    const result = QC_RESULTS.find(r=>r.value===form.qcResult);
    return (
      <div style={{ height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:T.BG, gap:16 }}>
        <div style={{ fontSize:64 }}>{form.qcResult === 'PASSED' ? '✅' : '⚠️'}</div>
        <div style={{ fontSize:24, fontWeight:700, color: result?.color }}>{resultLabel}</div>
        <div style={{ color:T.MUT }}>{result?.desc}，{t('ui.正在跳转', '正在跳转...')}</div>
      </div>
    );
  }

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', background:T.BG, overflow:'hidden' }}>
      <div style={{ background:T.CARD, borderBottom:`1px solid ${T.BOR}`, padding:'14px 24px', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <span style={{ fontSize:24 }}>🔍</span>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:T.TXT }}>{t('terminal.qc_inspection', '首检录入')}</div>
          <div style={{ fontSize:12, color:T.MUT }}>{t('ui.批次', '批次')} {batch.code} · {'houseName' in batch ? batch.houseName : '--'} · {'layDate' in batch ? batch.layDate : '--'}</div>
        </div>
      </div>

      <div style={{ flex:1, overflow:'auto', padding:24, display:'flex', gap:16 }}>
        {/* 左：检验数据 */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ background:T.CARD, borderRadius:12, padding:20, border:`1px solid ${T.BOR}` }}>
            <div style={{ fontSize:13, color:T.MUT, marginBottom:16, fontWeight:600 }}>{t('ui.抽检数量录入', '抽检数量录入')}</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              {[
                { key:'sampleQty', label: t('ui.抽检总数枚', '抽检总数（枚）') },
                { key:'brokenQty', label: t('ui.破损枚', '破损（枚）') },
                { key:'dirtyQty', label: t('ui.脏污枚', '脏污（枚）') },
                { key:'leakingQty', label: t('ui.渗漏枚', '渗漏（枚）') },
                { key:'abnormalShapeQty', label: t('ui.异形枚', '异形（枚）') },
                { key:'floorEggQty', label: t('ui.地面蛋枚', '地面蛋（枚）') },
                { key:'averageWeight', label: t('ui.平均单重g', '平均单重（g）') },
              ].map(f => (
                <div key={f.key}>
                  <div style={{ fontSize:11, color:T.MUT, marginBottom:4 }}>{f.label}</div>
                  <input type="number" value={(form as any)[f.key]}
                    onChange={e=>setNum(f.key, e.target.value)}
                    style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:`1px solid ${T.BOR}`,
                      borderRadius:8, padding:'12px 14px', color:T.TXT, fontSize:18,
                      fontWeight:600, boxSizing:'border-box' }} />
                </div>
              ))}
            </div>
          </div>

          {/* 感官检查 */}
          <div style={{ background:T.CARD, borderRadius:12, padding:20, border:`1px solid ${T.BOR}` }}>
            <div style={{ fontSize:13, color:T.MUT, marginBottom:12, fontWeight:600 }}>{t('ui.感官检查', '感官检查')}</div>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
              {[
                { key:'shellOk', label: t('ui.蛋壳清洁', '蛋壳清洁 ✓') },
                { key:'odorOk', label: t('ui.气味正常', '气味正常 ✓') },
                { key:'containerOk', label: t('ui.容器清洁', '容器清洁 ✓') },
              ].map(item => (
                <button type="button" key={item.key} onClick={()=>setForm(p=>({...p,[item.key]:!(p as any)[item.key]}))}
                  style={{ padding:'12px 20px', borderRadius:8, cursor:'pointer', transition:'all 0.15s',
                    border:`2px solid ${(form as any)[item.key] ? T.GRN : T.BOR}`,
                    background:(form as any)[item.key] ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.03)',
                    color:(form as any)[item.key] ? T.GRN : T.MUT, fontSize:14 }}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 右：QC结论 */}
        <div style={{ width:320, flexShrink:0, display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ background:T.CARD, borderRadius:12, padding:20, border:`1px solid ${T.BOR}` }}>
            <div style={{ fontSize:13, color:T.MUT, marginBottom:12, fontWeight:600 }}>{t('ui.QC检验结论', 'QC 检验结论')}</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {QC_RESULTS.map(r => (
                <button type="button" key={r.value} onClick={()=>setForm(p=>({...p,qcResult:r.value}))}
                  style={{ padding:'14px 16px', borderRadius:10, cursor:'pointer', textAlign:'left',
                    border:`2px solid ${form.qcResult===r.value ? r.color : T.BOR}`,
                    background: form.qcResult===r.value ? `${r.color}15` : 'rgba(255,255,255,0.03)',
                    transition:'all 0.15s' }}>
                  <div style={{ fontSize:14, fontWeight:600, color: form.qcResult===r.value ? r.color : T.TXT }}>
                    {r.label}
                  </div>
                  <div style={{ fontSize:11, color:T.MUT, marginTop:2 }}>{r.desc}</div>
                </button>
              ))}
            </div>
          </div>
          <div style={{ background:T.CARD, borderRadius:12, padding:20, border:`1px solid ${T.BOR}` }}>
            <div style={{ fontSize:13, color:T.MUT, marginBottom:8, fontWeight:600 }}>{t('ui.检验备注', '检验备注')}</div>
            <textarea value={form.comment} onChange={e=>setForm(p=>({...p,comment:e.target.value}))}
              placeholder={t('ui.填写检验意见', '填写检验意见...')} rows={4}
              style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:`1px solid ${T.BOR}`,
                borderRadius:8, padding:'10px 12px', color:T.TXT, fontSize:13,
                resize:'none', boxSizing:'border-box' }} />
          </div>
        </div>
      </div>

      <div style={{ background:T.CARD, borderTop:`1px solid ${T.BOR}`, padding:'16px 24px',
        display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <div style={{ flex:1, fontSize:13, color:T.MUT }}>
          {form.qcResult
            ? `${t('ui.已选择', '已选择')}：${QC_RESULTS.find(r=>r.value===form.qcResult)?.label}`
            : t('ui.请选择QC检验结论', '请选择 QC 检验结论')}
        </div>
        <button type="button" onClick={()=>router.push('/terminal/packaging/dashboard')}
          style={{ padding:'14px 28px', borderRadius:10, border:`1px solid ${T.BOR}`,
            background:'transparent', color:T.MUT, fontSize:15, cursor:'pointer' }}>{t('common.back', '返回')}</button>
        <button type="button" onClick={handleSubmit} disabled={!form.qcResult || submitting}
          style={{ padding:'14px 40px', borderRadius:10, border:'none',
            background: form.qcResult ? T.ACC : T.BOR,
            color: form.qcResult ? '#0f172a' : T.MUT,
            fontSize:16, fontWeight:700, cursor: form.qcResult ? 'pointer' : 'not-allowed',
            opacity: submitting ? 0.7 : 1 }}>
          {submitting ? t('ui.提交中', '提交中...') : t('ui.提交首检结论', '提交首检结论')}
        </button>
      </div>
    </div>
  );
}
