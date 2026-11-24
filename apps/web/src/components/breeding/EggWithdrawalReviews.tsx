'use client';

import { useEffect, useState } from 'react';
import { AttachmentUploader } from '@/components/design-system/forms/AttachmentUploader';
import { usePermission } from '@/hooks/usePermission';
import { useLanguage } from '@/contexts/LanguageContext';
import request from '@/lib/api-client';
import css from '@/components/FlockLifecycle.module.css';

type Source = {
  medication_id: number; medication_code: string; daily_log_id: string; production_date: string;
  verified_source:boolean; unresolved_source:boolean; shift: string; flock_no: string; house_code: string; company_code: string; site_code: string; treatment_house: string;
  current_house_code: string | null; held: boolean; course_status: string; review_id: string | null;
  vet_name: string | null; vet_reason: string | null; outcome: 'RELEASE' | 'RETAIN' | 'DISPOSE' | null; qa_name: string | null;
};
const api = '/v3/farm/egg-withdrawal';

export default function EggWithdrawalReviews({quality = false}: {quality?: boolean}) {
  const {t} = useLanguage();
  const access = usePermission(quality ? 'MENU_QA_OP' : 'MENU_FARM_VET');
  const [day,setDay] = useState(() => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore'}).format(new Date()));
  const [revision,setRevision] = useState(0);
  const [rows,setRows] = useState<Source[] | null>(null);
  const [error,setError] = useState('');
  useEffect(() => {
    let current = true;
    setRows(null);
    setError('');
    if (access.canView && day) request<{data:Source[]}>(`${api}/${quality ? 'quality' : 'vet'}?day=${encodeURIComponent(day)}`)
      .then(r => { if (current) setRows(r.data); })
      .catch(e => { if (current) setError(e.message); });
    return () => { current = false; };
  },[access.canView,day,quality,revision]);
  if (!access.canView) return null;
  return <section className={css.panel}>
    <h2>{t('vet.eggReviews','产蛋日隔离复核')}</h2>
    <label>{t('vet.productionDay','产蛋日')} <input type="date" value={day} onChange={e => setDay(e.target.value)} /></label>
    {error && <p role="alert">{error}</p>}
    {rows?.length === 0 && <p>{t('vet.noSources','该日没有可见的隔离来源。')}</p>}
    {rows?.map(row => <ReviewRow key={`${row.medication_id}:${row.daily_log_id}:${row.review_id}:${row.outcome}`}
      row={row} quality={quality} canEdit={access.canEdit} onSaved={() => setRevision(n => n+1)}/>)}
  </section>;
}

function ReviewRow({row,quality,canEdit,onSaved}: {row:Source;quality:boolean;canEdit:boolean;onSaved:()=>void}) {
  const {t} = useLanguage();
  const [reason,setReason] = useState('');
  const [requestId] = useState(() => crypto.randomUUID());
  const [files,setFiles] = useState<string[]>([]);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const send = async (outcome?: 'RELEASE' | 'RETAIN' | 'DISPOSE') => {
    setBusy(true);
    setError('');
    try {
      await request(outcome ? `${api}/reviews/${row.review_id}/decision` : `${api}/reviews`,{
        method:'POST',body:JSON.stringify(outcome ? {outcome,evidence:files[0]} :
          {medicationId:row.medication_id,dailyLogId:row.daily_log_id,reason,requestId})});
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : t('common.error','操作失败')); }
    finally { setBusy(false); }
  };
  return <article className={css.document}>
    <strong>{row.flock_no} · {row.medication_code} #{row.medication_id} · {row.held ? t('vet.held','隔离中') : t('vet.released','隔离已解除')}</strong>
    <p>{t('vet.treatmentHouse','用药舍')} {row.treatment_house} · {t('vet.layingHouse','产蛋舍')} {row.house_code} · {row.shift} · #{row.daily_log_id}
      {row.current_house_code && <> · {t('vet.careHouse','当前照管舍')} {row.current_house_code}</>}</p>
    {row.unresolved_source && <p>{t('vet.unresolved','该日有未核实占栏的历史日报，整日产出继续隔离。')}</p>}
    {row.review_id && <p>{t('vet.reviewedBy','兽医核查')} {row.vet_name} · {row.vet_reason} · {row.qa_name || t('vet.pendingQuality','待质检签认')}
      {row.outcome && <> · {row.outcome === 'RETAIN' ? t('vet.retain','继续隔离') : row.outcome === 'DISPOSE' ? t('vet.dispose','签认报损处置') : t('vet.releaseCourse','解除本单隔离')}</>}</p>}
    {canEdit && row.verified_source && !quality && (!row.review_id || row.outcome === 'RETAIN') && <>
      <label>{t('vet.reviewBasis','兽医核查依据')} <textarea value={reason} maxLength={1000} onChange={e => setReason(e.target.value)} /></label>
      <button disabled={busy || !reason.trim()} onClick={() => send()}>{t('vet.submitReview','提交质检复核')}</button></>}
    {canEdit && quality && row.review_id && !row.outcome && <>
      <AttachmentUploader label={t('vet.qualityEvidence','本次质检凭证')} value={files} onChange={v => setFiles(v.slice(-1))}
        ownership={{moduleCode:'EGG_WITHDRAWAL',ownerType:'EGG_REVIEW',ownerId:row.review_id,companyCode:row.company_code,storeCode:row.site_code}}/>
      <div className={css.actions}><button disabled={busy || !files.length} onClick={() => send('RETAIN')}>{t('vet.retain','继续隔离')}</button>
        <button disabled={busy || !files.length} onClick={() => send('DISPOSE')}>{t('vet.dispose','签认报损处置')}</button>
        {row.course_status === 'CANCELLED' && <button disabled={busy || !files.length} onClick={() => send('RELEASE')}>{t('vet.releaseCourse','解除本单隔离')}</button>}</div></>}
    {error && <p role="alert">{error}</p>}
  </article>;
}
