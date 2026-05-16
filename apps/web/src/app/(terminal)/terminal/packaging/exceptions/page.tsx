'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { packagingApi } from '@/lib/packaging-api';
import { MOCK_EXCEPTIONS } from '@/lib/packaging-mock';
import { EXCEPTION_TYPE_LABEL } from '@/types/packaging-terminal';
import type { ExceptionType, ExceptionTicket } from '@/types/packaging-terminal';
import { usePackagingDicts, buildQuickTypes, FALLBACK_DICTS } from '@/hooks/usePackagingDicts';

const BG='#0f172a', CARD='#1e293b', BOR='#334155';
const ACC='#f59e0b', TXT='#f1f5f9', MUT='#94a3b8', GRN='#22c55e', RED='#ef4444';

const SEV_COLORS = { LOW:'#22c55e', MEDIUM:'#f59e0b', HIGH:'#f97316', CRITICAL:'#ef4444' };

export default function ExceptionsPage() {
  const router = useRouter();
  const { t } = useLanguage();
  // ── 从数据字典加载异常快捷类型 ─────────────────────────────────────────────
  const { dicts } = usePackagingDicts(['PKG_ANOMALY_REASON']);
  const QUICK_TYPES = buildQuickTypes(
    dicts.PKG_ANOMALY_REASON ?? FALLBACK_DICTS.PKG_ANOMALY_REASON
  ) as { type: ExceptionType; label: string; icon: string }[];

  const STATUS_LABEL: Record<string,string> = {
    REPORTED:     t('ui.已上报', '已上报'),
    ACKNOWLEDGED: t('ui.已受理', '已受理'),
    IN_PROGRESS:  t('ui.处理中', '处理中'),
    RESOLVED:     t('ui.已处理', '已处理'),
    CLOSED:       t('ui.已关闭', '已关闭'),
    CANCELLED:    t('ui.已取消', '已取消'),
  };

  const [tickets, setTickets] = useState<ExceptionTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);

  useEffect(() => {
    packagingApi.getTodayExceptions()
      .then(data => setTickets((Array.isArray(data) ? data : []) as ExceptionTicket[]))
      .catch(() => setTickets(MOCK_EXCEPTIONS as ExceptionTicket[]))
      .finally(() => setTicketsLoading(false));
  }, []);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    type:'' as ExceptionType|'', severity:'MEDIUM' as 'LOW'|'MEDIUM'|'HIGH'|'CRITICAL',
    quantity:'', description:'', batchId:'SB-20260516-001',
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!form.type) return;
    setSubmitting(true);
    try {
      const result = await packagingApi.reportException({
        type: form.type as ExceptionType,
        severity: form.severity,
        quantity: Number(form.quantity)||undefined,
        description: form.description,
        relatedBatchId: form.batchId,
        reportedBy: '当前用户',
        status: 'REPORTED',
      });
      setTickets(prev=>[result as ExceptionTicket, ...prev]);
      setShowForm(false);
      setForm({ type:'', severity:'MEDIUM', quantity:'', description:'', batchId:'SB-20260516-001' });
    } finally { setSubmitting(false); }
  };

  const openCount = tickets.filter(t=>!['CLOSED','CANCELLED'].includes(t.status)).length;

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', background:BG, overflow:'hidden' }}>
      <div style={{ background:CARD, borderBottom:`1px solid ${BOR}`, padding:'14px 24px', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <span style={{ fontSize:24 }}>⚠️</span>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:18, fontWeight:700, color:TXT }}>{t('terminal.exceptions', '异常处理')}</div>
          <div style={{ fontSize:12, color:MUT }}>{t('ui.未关闭', '未关闭')} {openCount} {t('ui.条', '条')} · {t('ui.重大异常未关闭不得交班', '重大异常未关闭不得交班')}</div>
        </div>
        <button onClick={()=>setShowForm(true)}
          style={{ padding:'12px 24px', background:RED, color:'#fff', border:'none',
            borderRadius:10, fontSize:15, fontWeight:700, cursor:'pointer' }}>
          + {t('ui.上报异常', '上报异常')}
        </button>
      </div>

      <div style={{ flex:1, overflow:'auto', padding:16 }}>
        {tickets.length === 0 ? (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:12 }}>
            <div style={{ fontSize:48 }}>✅</div>
            <div style={{ color:MUT, fontSize:16 }}>{t('common.no_data', '暂无异常记录')}</div>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {tickets.map(ticket=>(
              <div key={ticket.id} style={{ background:CARD, borderRadius:12, padding:16,
                border:`1px solid ${ticket.status==='CLOSED'?BOR:`${SEV_COLORS[ticket.severity]}40`}`,
                opacity: ticket.status==='CLOSED'?0.6:1 }}>
                <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
                  <div style={{ padding:'4px 10px', borderRadius:6, fontSize:11, fontWeight:700,
                    background:`${SEV_COLORS[ticket.severity]}20`, color:SEV_COLORS[ticket.severity], flexShrink:0 }}>
                    {ticket.severity}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:600, color:TXT }}>
                      {EXCEPTION_TYPE_LABEL[ticket.type]}
                    </div>
                    {ticket.description && <div style={{ fontSize:12, color:MUT, marginTop:2 }}>{ticket.description}</div>}
                    <div style={{ fontSize:11, color:MUT, marginTop:4 }}>
                      {t('ui.上报人', '上报人')}：{ticket.reportedBy} · {ticket.reportedAt.slice(0,16).replace('T',' ')}
                    </div>
                  </div>
                  <div style={{ padding:'4px 10px', borderRadius:6, fontSize:11,
                    background:'rgba(255,255,255,0.06)', color:MUT, flexShrink:0 }}>
                    {STATUS_LABEL[ticket.status]||ticket.status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 快速上报表单 */}
      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', display:'flex',
          alignItems:'center', justifyContent:'center', zIndex:200 }}>
          <div style={{ background:CARD, borderRadius:16, padding:32, width:480,
            border:`1px solid ${BOR}`, maxHeight:'90vh', overflow:'auto' }}>
            <div style={{ fontSize:18, fontWeight:700, color:TXT, marginBottom:20 }}>{t('ui.快速上报异常', '快速上报异常')}</div>

            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, color:MUT, marginBottom:8 }}>{t('ui.异常类型', '异常类型')}</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {QUICK_TYPES.map(qt=>(
                  <button key={qt.type} onClick={()=>setForm(p=>({...p,type:qt.type}))}
                    style={{ padding:'12px', borderRadius:8, cursor:'pointer', textAlign:'left',
                      border:`2px solid ${form.type===qt.type?RED:BOR}`,
                      background:form.type===qt.type?'rgba(239,68,68,0.1)':'rgba(255,255,255,0.03)',
                      display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontSize:18 }}>{qt.icon}</span>
                    <span style={{ fontSize:13, color:form.type===qt.type?RED:TXT }}>{qt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, color:MUT, marginBottom:8 }}>{t('ui.严重程度', '严重程度')}</div>
              <div style={{ display:'flex', gap:8 }}>
                {(['LOW','MEDIUM','HIGH','CRITICAL'] as const).map(s=>(
                  <button key={s} onClick={()=>setForm(p=>({...p,severity:s}))}
                    style={{ flex:1, padding:'10px', borderRadius:8, cursor:'pointer',
                      border:`2px solid ${form.severity===s?SEV_COLORS[s]:BOR}`,
                      background:form.severity===s?`${SEV_COLORS[s]}20`:'rgba(255,255,255,0.03)',
                      color:form.severity===s?SEV_COLORS[s]:MUT, fontSize:12, fontWeight:600 }}>
                    {s==='LOW' ? t('ui.低', '低') : s==='MEDIUM' ? t('ui.中', '中') : s==='HIGH' ? t('ui.高', '高') : t('ui.严重', '严重')}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, color:MUT, marginBottom:4 }}>{t('ui.涉及数量枚可选', '涉及数量（枚，可选）')}</div>
              <input type="number" value={form.quantity} onChange={e=>setForm(p=>({...p,quantity:e.target.value}))}
                placeholder="0"
                style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:`1px solid ${BOR}`,
                  borderRadius:8, padding:'12px 14px', color:TXT, fontSize:15, boxSizing:'border-box' }} />
            </div>

            <div style={{ marginBottom:24 }}>
              <div style={{ fontSize:12, color:MUT, marginBottom:4 }}>{t('ui.异常描述', '异常描述')}</div>
              <textarea value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))}
                placeholder={t('ui.描述异常情况', '描述异常情况...')} rows={3}
                style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:`1px solid ${BOR}`,
                  borderRadius:8, padding:'10px 12px', color:TXT, fontSize:13,
                  resize:'none', boxSizing:'border-box' }} />
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button onClick={()=>setShowForm(false)}
                style={{ flex:1, padding:'14px', background:'transparent', border:`1px solid ${BOR}`,
                  borderRadius:8, color:MUT, fontSize:15, cursor:'pointer' }}>{t('common.cancel', '取消')}</button>
              <button onClick={handleSubmit} disabled={!form.type||submitting}
                style={{ flex:2, padding:'14px', background:form.type?RED:BOR, border:'none',
                  borderRadius:8, color:form.type?'#fff':MUT, fontSize:15, fontWeight:700,
                  cursor:form.type?'pointer':'not-allowed', opacity:submitting?0.7:1 }}>
                {submitting ? t('ui.提交中', '提交中...') : `⚠️ ${t('ui.提交异常', '提交异常')}`}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ background:CARD, borderTop:`1px solid ${BOR}`, padding:'16px 24px',
        display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <button onClick={()=>router.push('/terminal/packaging/dashboard')}
          style={{ padding:'14px 28px', borderRadius:10, border:`1px solid ${BOR}`,
            background:'transparent', color:MUT, fontSize:15, cursor:'pointer' }}>{t('ui.返回首页', '返回首页')}</button>
        <div style={{ flex:1, fontSize:13, color: openCount>0?RED:GRN }}>
          {openCount>0
            ? `⚠️ ${openCount} ${t('ui.条未关闭异常请尽快处理', '条未关闭异常，请尽快处理')}`
            : `✅ ${t('ui.无未关闭异常可以交班', '无未关闭异常，可以交班')}`}
        </div>
      </div>
    </div>
  );
}
