'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import request from '@/lib/api-client';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePermission } from '@/hooks/usePermission';
import { ConfirmDialogV2, StatusBadge } from '@/components/design-system';

type FinanceSummary = {
  invoice_id?: string;
  ar_no?: string;
  currency_code: string;
  received_amount?: string;
  outstanding_amount?: string;
  collection_status: string;
};

export default function FlockSettlementFinance({ documentId }: { documentId: string }) {
  const permission = usePermission('MENU_FIN2_AR');
  return permission.canView ? <FinanceSummaryPanel key={documentId} documentId={documentId} editable={permission.canEdit} /> : null;
}

function FinanceSummaryPanel({ documentId, editable }: { documentId: string; editable: boolean }) {
  const { t, translateLiteral } = useLanguage();
  const path = '/v2/finance/ar/flock-settlements/' + encodeURIComponent(documentId);
  const [summary, setSummary] = useState<FinanceSummary>();
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    request<FinanceSummary>(path,{ signal:controller.signal,silent:true }).then(result=>{
      if (!controller.signal.aborted) setSummary(result);
    }).catch((failure: unknown)=>{
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : '');
    });
    return () => controller.abort();
  },[path,revision]);

  async function create() {
    setBusy(true);
    setError('');
    try {
      setSummary(await request<FinanceSummary>(path,{ method:'POST',body:'{}',silent:true }));
      setConfirm(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('flockCash.loadError'));
    } finally {
      setBusy(false);
    }
  }

  const label = (status: string) => t(String('flockCash.' + status),status);
  return <section aria-label={t('flockCash.title')}>
    <h4>{t('flockCash.title')}</h4>
    {error && <p role="alert">{translateLiteral(error)} <button type="button" disabled={busy} onClick={() => {
      setError('');
      setRevision(value=>value+1);
    }}>{t('flockForm.reload')}</button></p>}
    {!summary && !error && <p role="status">{t('flockForm.loading')}</p>}
    {summary && <p>
      <StatusBadge status={summary.collection_status} label={label(summary.collection_status)} />
      {summary.invoice_id && <> · {t('flockCash.received')} {summary.received_amount} {summary.currency_code}
        {' · '}{t('flockCash.outstanding')} {summary.outstanding_amount} {summary.currency_code}</>}
    </p>}
    {summary?.invoice_id && <Link href={{pathname:'/finance2/ar',query:{invoiceId:summary.invoice_id}}}>{summary.ar_no}</Link>}
    {summary && !summary.invoice_id && editable && <button type="button" onClick={() => setConfirm(true)}>{t('flockCash.create')}</button>}
    <ConfirmDialogV2 open={confirm} title={t('flockCash.create')} message={<>
      <p>{t('flockCash.createExplanation')}</p>{error && <p role="alert">{translateLiteral(error)}</p>}
    </>} onConfirm={() => void create()} onCancel={() => { setConfirm(false); setError(''); }} loading={busy} />
  </section>;
}
