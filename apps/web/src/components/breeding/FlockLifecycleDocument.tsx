'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { DrawerV2, ErrorState, LoadingSkeleton, StatusBadge } from '@/components/design-system';
import { usePermission } from '@/hooks/usePermission';
import { useLanguage } from '@/contexts/LanguageContext';
import { downloadProtectedPdf } from '@/lib/attachments';
import FlockBreedConfirmation from './FlockBreedConfirmation';
import {
  detailPath, readLifecycleDocument, readLifecycleEvidence, sendLifecycleAction, useLifecycleRead,
} from './flock-lifecycle-workspace-api';
import { useLifecycleLabels } from './flock-lifecycle-workspace-labels';
import {
  asRow, documentIdPattern, missing, stringify,
  type LifecycleAction, type LifecycleDocument, type LifecycleKind, type LifecycleRow,
} from './flock-lifecycle-workspace';
import css from './FlockLifecycleWorkspace.module.css';

type DialogProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  expanded?: boolean;
  blocked?: boolean;
};

export function LifecycleDetailDialog({ title, subtitle, children, onClose, expanded, blocked }: DialogProps) {
  const { label } = useLifecycleLabels();
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (expanded) heading.current?.focus({ preventScroll: true });
  }, [expanded]);
  if (!expanded) return <DrawerV2 open title={title} onClose={onClose} closeDisabled={blocked} width={660}>
    {subtitle && <code className={css.documentId} data-dialog-initial-focus tabIndex={-1}>{subtitle}</code>}
    {children}
  </DrawerV2>;
  return <article className={css.detailPage} aria-labelledby={titleId}>
    <header className={css.detailHeader}>
      <div>
        <h2 id={titleId} ref={heading} tabIndex={-1}>{title}</h2>
        {subtitle && <code>{subtitle}</code>}
      </div>
      <button type="button" onClick={onClose} disabled={blocked}>{label('back')}</button>
    </header>
    <div className={css.detailBody}>{children}</div>
  </article>;
}

type DetailProps = {
  id: string;
  actor: string;
  expanded: boolean;
  created?: boolean;
  sourceId?: string;
  onClose: () => void;
  onExpand: () => void;
  onChanged: () => void;
  onOpen: (id: string) => void;
  onForm: (kind: LifecycleKind, context: { documentId: string }) => void;
  canCreate: (kind: LifecycleKind) => boolean;
};

const expectedState: Record<LifecycleAction, string> = {
  submit: 'SUBMITTED', approve: 'APPROVED', post: 'POSTED', cancel: 'CANCELLED',
};
const nextStep: Record<string, LifecycleAction> = { DRAFT: 'submit', SUBMITTED: 'approve', APPROVED: 'post' };

function pendingActionKey(actor: string, id: string) {
  return `flock-lifecycle-action:${encodeURIComponent(actor)}:${id}`;
}

function recordPendingAction(key: string, action: LifecycleAction, version: number) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ action, version, sentAt: Date.now() }));
  } catch {
    // The detail is always reloaded before an uncertain action can be retried.
  }
}

function removePendingAction(key: string) {
  try { sessionStorage.removeItem(key); } catch { /* The server remains authoritative. */ }
}

function hasPendingAction(key: string) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return false;
    const { sentAt } = JSON.parse(raw);
    if (typeof sentAt === 'number' && Date.now() - sentAt < 12 * 60 * 60 * 1000) return true;
    removePendingAction(key);
  } catch { /* Invalid or unavailable session storage. */ }
  return false;
}

function settlementFacts(row: LifecycleRow) {
  return [
    ['customerCode', row.customer_code],
    ['batch', row.held_id],
    ['currency', row.currency_code],
    ['unitPrice', row.unit_price],
    ['amount', row.amount],
    ['receipt', row.receipt_reference],
  ] as const;
}

const fullKinds = new Set<LifecycleKind>(['BASELINE', 'CLOSE', 'REVERSE', 'REPORT_CORRECTION']);

export default function FlockLifecycleDocument({
  id, actor, expanded, created, sourceId, onClose, onExpand, onChanged, onOpen, onForm, canCreate,
}: DetailProps) {
  const { label, blockerLabel, locale } = useLifecycleLabels();
  const { translateLiteral } = useLanguage();
  const mayReview = usePermission('MENU_FLOCK_APPROVE').canApprove;
  const mayConfirmBreed = usePermission('MENU_FLOCK_BASELINE').canApprove;
  const validId = documentIdPattern.test(id);
  const load = useLifecycleRead<LifecycleDocument>(validId ? detailPath(id) : null);
  const [updated, setUpdated] = useState<LifecycleDocument>();
  const [confirm, setConfirm] = useState<LifecycleAction>();
  const confirmHeading = useRef<HTMLHeadingElement>(null);
  const confirmTrigger = useRef<HTMLButtonElement>(null);
  const [working, setWorking] = useState(false);
  const running = useRef(false);
  const [receipt, setReceipt] = useState<{ action: LifecycleAction; version: number; status: string }>();
  const [resultMessage, setResultMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [unknownResult, setUnknownResult] = useState(false);
  const [breedOpen, setBreedOpen] = useState(false);
  const [evidenceBusy, setEvidenceBusy] = useState('');
  const [evidenceError, setEvidenceError] = useState('');
  const [preview, setPreview] = useState('');
  const [copied, setCopied] = useState('');
  const previewAbort = useRef<AbortController>(null);
  const previewTrigger = useRef<HTMLButtonElement>(null);
  const previewClose = useRef<HTMLButtonElement>(null);
  const pendingKey = pendingActionKey(actor, id);

  const denied = [401, 403, 404].includes(load.error?.status ?? 0);
  const detail = denied ? undefined : updated && (!load.data || updated.version >= load.data.version) ? updated : load.data;

  useEffect(() => {
    if (!load.data || !hasPendingAction(pendingKey)) return;
    const notice = requestAnimationFrame(() => {
      setResultMessage('observedUpdate');
      removePendingAction(pendingKey);
    });
    return () => cancelAnimationFrame(notice);
  }, [load.data, pendingKey]);

  useEffect(() => {
    if (confirm) confirmHeading.current?.focus();
  }, [confirm]);
  useEffect(() => () => {
    previewAbort.current?.abort();
  }, []);
  useEffect(() => {
    if (!preview) return;
    previewClose.current?.focus();
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  function readAgain() {
    setUpdated(undefined);
    setActionError('');
    setUnknownResult(false);
    setResultMessage('observedUpdate');
    load.reload();
  }

  async function finishAction(action: LifecycleAction) {
    if (!detail || running.current) return;
    const version = detail.version;
    running.current = true;
    setWorking(true);
    setConfirm(undefined);
    setResultMessage('');
    setActionError('');
    recordPendingAction(pendingKey, action, version);
    try {
      const result = await sendLifecycleAction(id, action, version);
      setReceipt({ action, version: result.version, status: result.status });
      setUpdated({ ...detail, ...result, allowedActions: [], blockers: [], nextAction: null });
      removePendingAction(pendingKey);
      onChanged();
      try {
        setUpdated(await readLifecycleDocument(id));
      } catch {
        setUnknownResult(true);
      }
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error();
      const status = (error as Error & { status?: number }).status;
      try {
        const current = await readLifecycleDocument(id);
        setUpdated(current);
        removePendingAction(pendingKey);
        if (current.version > version) {
          setResultMessage(status === 409 ? 'versionChanged' : 'observedUpdate');
          onChanged();
          const audit = current.audits?.find(event =>
            Number(event.version) === version + 1 && String(event.action).toLowerCase() === action && event.actor === actor);
          if (audit && current.status === expectedState[action]) {
            setReceipt({ action, version: current.version, status: current.status });
          }
        } else {
          setActionError(error.message || label('actionFailed'));
        }
      } catch {
        setUnknownResult(true);
      }
    } finally {
      running.current = false;
      setWorking(false);
    }
  }

  async function showEvidence(fileId: string, index: number) {
    previewAbort.current?.abort();
    const controller = new AbortController();
    previewAbort.current = controller;
    setEvidenceBusy(fileId);
    setEvidenceError('');
    setPreview('');
    try {
      const blob = await readLifecycleEvidence(id, fileId, controller.signal);
      if (controller.signal.aborted) return;
      if (blob.type === 'application/pdf') downloadProtectedPdf(blob, `flock-evidence-${index + 1}.pdf`);
      else setPreview(URL.createObjectURL(blob));
    } catch {
      if (!controller.signal.aborted) setEvidenceError('attachmentError');
    } finally {
      if (!controller.signal.aborted) setEvidenceBusy('');
    }
  }

  function closePreview() {
    setPreview('');
    requestAnimationFrame(() => previewTrigger.current?.focus());
  }

  function closeConfirmation() {
    setConfirm(undefined);
    requestAnimationFrame(() => confirmTrigger.current?.focus());
  }


  const payload = asRow(detail?.payload);
  const settlement = asRow(detail?.settlement);
  const blockers = detail?.blockers ?? [];
  const createdVersion = detail?.audits?.find(event => String(event.action).toUpperCase() === 'CREATE')?.version;
  const images = Array.isArray(payload.evidence) ? payload.evidence.filter((value): value is string => typeof value === 'string') : [];
  const next = detail?.nextAction ?? nextStep[detail?.status ?? ''];
  const sourceDocument = sourceId ?? detail?.authorized_document_id;
  const visibleSourceId = typeof sourceDocument === 'string' && sourceDocument !== id && documentIdPattern.test(sourceDocument)
    ? sourceDocument : undefined;
  const date = (value: unknown) => {
    if (!value) return missing;
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.valueOf()) ? stringify(value) : new Intl.DateTimeFormat(locale, {
      timeZone: 'Asia/Singapore', dateStyle: 'medium',
    }).format(parsed);
  };
  const time = (value: unknown) => {
    if (!value) return missing;
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.valueOf()) ? stringify(value) : new Intl.DateTimeFormat(locale, {
      timeZone: 'Asia/Singapore', dateStyle: 'medium', timeStyle: 'short',
    }).format(parsed);
  };
  const quantity = (value: unknown) => value == null || value === '' ? missing
    : `${new Intl.NumberFormat(locale).format(Number(value))} ${label('birds')}`;
  const clickId = (value: unknown) => {
    const ref = stringify(value);
    return documentIdPattern.test(ref) ? <button className={css.textButton} onClick={() => onOpen(ref)}>{ref}</button> : ref;
  };
  const basics = detail ? [
    ['type', label(detail.kind)], ['status', <StatusBadge key="status" status={detail.status} label={label(detail.status)} />],
    ['date', date(detail.business_date)], ['version', detail.version],
    ['companyCode', detail.company_code], ['farmCode', detail.farm_code], ['houseCode', detail.house_code],
    ['flockNo', detail.flock_no], ['creator', detail.created_by], ['approver', detail.approved_by],
    ['reason', payload.reason], ['responsible', payload.responsible], ['receiver', payload.receiver],
  ] : [];
  const kindFacts: Partial<Record<LifecycleKind, readonly (readonly [string, unknown])[]>> = {
    ADMIT: [['source', payload.sourceCode ?? payload.sourceFarmCode], ['sourceReceipt', payload.sourceReceipt], ['quantity', quantity(payload.quantity)]],
    BASELINE: [['quantity', quantity(payload.quantity)], ['opening', quantity(payload.expectedLegacyQty)], ['receipt', payload.differenceReceipt]],
    MORTALITY: [['quantity', quantity(payload.quantity)], ['dispose', payload.disposalMethod]],
    CULL: [['quantity', quantity(payload.quantity)], ['position', payload.positionCode]],
    TRANSFER: [['sourceHouseCode', detail?.house_code], ['targetHouseCode', payload.targetHouseCode],
      ['quantity', quantity(detail?.status === 'POSTED' ? detail.events?.find(event => event.kind === 'TRANSFER_IN')?.quantity_delta : detail?.estimated_quantity ?? payload.quantity)],
      ['capacity', quantity(detail?.target_capacity)]],
    SELL_HELD: Object.keys(settlement).length ? settlementFacts(settlement) : [
      ['customerCode', payload.customerCode], ['batch', payload.heldId], ['currency', payload.currencyCode],
      ['unitPrice', payload.unitPrice], ['receipt', payload.salesRef],
    ],
    REVERSE: [['original', clickId(payload.originalDocumentId)], ['quantity', quantity(payload.replacementQuantity)], ['position', payload.positionCode],
      ['dispose', payload.disposalMethod], ['receipt', payload.differenceReceipt]],
    ADJUST: [['difference', quantity(payload.quantity)], ['receipt', payload.differenceReceipt]],
    REPORT_CORRECTION: [['report', payload.dailyLogId || missing], ['occupancy', payload.originalOccupancyId],
      ['receipt', payload.differenceReceipt]],
    HISTORY_AUTH: [['sourceDate', `${date(payload.periodFrom)} – ${date(payload.periodTo)}`]],
  };
  const canReverse = detail?.status === 'POSTED' && ['MORTALITY', 'CULL', 'ADJUST'].includes(detail.kind)
    && Boolean(detail.reversal) && !asRow(detail.reversal).already_reversed && canCreate('REVERSE');
  const canAuthorize = detail && ['DRAFT', 'SUBMITTED', 'APPROVED'].includes(detail.status)
    && ['ADJUST', 'REVERSE', 'REPORT_CORRECTION'].includes(detail.kind) && canCreate('HISTORY_AUTH');

  return <>
    <LifecycleDetailDialog title={detail ? label(detail.kind) : label('detail')} subtitle={id}
    expanded={expanded} blocked={working} onClose={confirm ? closeConfirmation : preview ? closePreview : onClose}>
    {!validId && <p role="alert">{label('invalidId')}</p>}
    {load.loading && <div aria-label={label('loading')} role="status"><LoadingSkeleton variant="table" rows={5} /></div>}
    {load.error && <div role="alert"><ErrorState compact title={label(load.error.status === 403 ? 'accessDenied'
      : load.error.status === 404 ? 'missingDocument' : 'loadFailed')} onRetry={load.reload} /></div>}
    {detail && <>
      <div className={css.actions}>
        <button onClick={() => {
          const writing = navigator.clipboard?.writeText(id);
          if (writing) void writing.then(() => setCopied('copied'), () => setCopied('copyFailed'));
          else setCopied('copyFailed');
        }}>{label('copyId')}</button>
        {!expanded && fullKinds.has(detail.kind) && <button onClick={onExpand}>{label('fullDetail')}</button>}
        {visibleSourceId && <button onClick={() => onOpen(visibleSourceId)}>{label('openOriginal')}</button>}
        {copied && <span role="status">{label(copied)}</span>}
      </div>
      <dl className={css.facts}>
        {[...basics, ...(kindFacts[detail.kind] ?? [])].map(([key, value]) =>
          <div key={String(key)}><dt>{label(String(key))}</dt><dd>{value && typeof value === 'object' ? value as ReactNode : stringify(value)}</dd></div>)}
      </dl>
      {detail.kind === 'SELL_HELD' && Object.keys(settlement).length > 0 && <section className={css.detailSection}>
        <h3>{label('settlement')}</h3>
        <p><StatusBadge status={stringify(settlement.finance_status)} label={label(stringify(settlement.finance_status))} /> {quantity(settlement.quantity)}</p>
      </section>}
      {detail.kind === 'REPORT_CORRECTION' && <ReportDifference payload={payload} />}
      {blockers.length > 0 && <section className={css.detailSection}>
        <h3>{label('blockers')}</h3>
        <ul>{blockers.map(code => <li key={code}>{blockerLabel(code)}</li>)}</ul>
      </section>}
      {(detail.breed_confirmation_required || blockers.includes('FLOCK_BASELINE_BREED_REQUIRED')) && <section className={css.detailSection}>
        <p role="status">{blockerLabel('FLOCK_BASELINE_BREED_REQUIRED')}</p>
        {mayReview && mayConfirmBreed && <button onClick={() => setBreedOpen(true)}>{label('breedConfirm')}</button>}
      </section>}

      <section className={css.detailSection}>
        <h3>{label('actions')}</h3>
        {created && detail.created_by === actor && <p className={css.receipt} role="status">{label('saved')} · {label('version')} {stringify(createdVersion ?? detail.version)}</p>}
        {receipt && <p className={css.receipt} role="status">
          {label('actionComplete', { action: label(receipt.action) })} · {label(receipt.status)} · {label('version')} {receipt.version}
        </p>}
        {resultMessage && <p role="status">{label(resultMessage)}</p>}
        {actionError && <p role="alert">{translateLiteral(actionError)}</p>}
        {unknownResult && <div role="alert">
          <p>{label(receipt ? 'receiptReloadFailed' : 'outcomeUnknown')}</p>
          <button onClick={readAgain}>{label('refresh')}</button>
        </div>}
        {working && <p role="status">{label('processing')}</p>}
        {!unknownResult && !working && !confirm && <div className={css.actions}>
          {(detail.allowedActions ?? []).map(action => <button type="button" key={action}
            className={action === next ? css.primary : undefined}
            disabled={load.loading || load.refreshing || Boolean(load.error) || (action !== 'cancel' && blockers.length > 0)}
            onClick={event => {
              confirmTrigger.current = event.currentTarget;
              setConfirm(action);
            }}>{label(action)}</button>)}
          {canReverse && <button onClick={() => onForm('REVERSE', { documentId: id })}>{label('createReverse')}</button>}
          {canAuthorize && <button onClick={() => onForm('HISTORY_AUTH', { documentId: id })}>{label('createHistory')}</button>}
        </div>}
        {!working && !confirm && !unknownResult && next && !(detail.allowedActions ?? []).includes(next) &&
          <p>{next === 'approve' && detail.created_by === actor ? label('selfReview') : label('nextRole', { action: label(next) })}</p>}
        {confirm && <section className={css.confirm} aria-labelledby="flock-confirm-action">
          <h4 id="flock-confirm-action" ref={confirmHeading} tabIndex={-1}>{label('confirm', { action: label(confirm) })}</h4>
          <p>{id} · {label('version')} {detail.version}</p>
          <div className={css.actions}>
            <button type="button" onClick={closeConfirmation}>{label('backToDetail')}</button>
            <button type="button" className={confirm === 'cancel' ? css.danger : css.primary}
              onClick={() => void finishAction(confirm)}>{label(confirm)}</button>
          </div>
        </section>}
      </section>

      <section className={css.detailSection}>
        <h3>{label('events')}</h3>
        {(detail.events?.length ?? 0) === 0 && <p>{label('empty')}</p>}
        {detail.events?.map(event => <article key={stringify(event.id)} className={css.event}>
          <strong>{label(stringify(event.kind))} · {stringify(event.house_code)}</strong>
          <p>{date(event.business_date)} · {quantity(event.quantity_delta)} · {label('heldDelta')} {quantity(event.held_delta)}</p>
          <p>{label('opening')} {quantity(event.document_opening_qty)} · {label('closing')} {quantity(event.document_closing_qty)}</p>
          <p>{label('actor')} {stringify(event.actor)} · {label('approver')} {stringify(event.approved_by)}</p>
        </article>)}
      </section>
      {Boolean(detail.amendments?.length) && <section className={css.detailSection}>
        <h3>{label('amendments')}</h3>
        {detail.amendments?.map(item => <div key={stringify(item.id)}>{clickId(item.id)} · {date(item.business_date)} · {stringify(item.difference_receipt)}</div>)}
      </section>}
      <section className={css.detailSection}>
        <h3>{label('audits')}</h3>
        {(detail.audits?.length ?? 0) === 0 && <p>{label('empty')}</p>}
        <ol className={css.audit}>{detail.audits?.map(row =>
          <li key={stringify(row.id)}><strong>{label(String(row.action).toLowerCase() === 'create' ? 'CREATE' : String(row.action).toLowerCase())}</strong>
            {' · '}{stringify(row.actor)} · {time(row.recorded_at)} · {label('version')} {stringify(row.version)}</li>,
        )}</ol>
      </section>
      <section className={css.detailSection}>
        <h3>{label('evidence')}</h3>
        {images.length === 0 && <p>{label('empty')}</p>}
        <div className={css.actions}>
          {images.map((fileId, index) => <button key={fileId} disabled={evidenceBusy === fileId} onClick={event => {
            previewTrigger.current = event.currentTarget;
            void showEvidence(fileId, index);
          }}>
            {evidenceBusy === fileId ? label('loading') : label('attachment', { number: index + 1 })}
          </button>)}
        </div>
        {evidenceError && <p role="alert">{label(evidenceError)}</p>}
        {preview && <div className={css.preview}>
          <button type="button" onClick={closePreview} ref={previewClose}>{label('close')}</button>
          <iframe title={label('evidence')} src={preview} sandbox="allow-same-origin" referrerPolicy="no-referrer" />
        </div>}
      </section>
    </>}
    </LifecycleDetailDialog>
    {breedOpen && detail && <FlockBreedConfirmation flockNo={detail.flock_no} onClose={() => setBreedOpen(false)} onConfirmed={() => {
      setBreedOpen(false);
      setUpdated(undefined);
      load.reload();
      onChanged();
    }} />}
  </>;
}

function ReportDifference({ payload }: { payload: LifecycleRow }) {
  const { label } = useLifecycleLabels();
  const next = asRow(payload.correction);
  const original = asRow(payload.originalReport ?? payload.reportSnapshot ?? payload.originalSnapshot);
  if (!Object.keys(next).length) return null;
  const format = (value: unknown) => value && typeof value === 'object'
    ? Object.entries(asRow(value)).map(([code, count]) => `${code} ${stringify(count)}`).join(' · ') || missing : stringify(value);
  const fields = [
    ['eggsByGrade', 'eggs_by_grade'], ['feedConsumed', 'feed_consumed'], ['waterConsumed', 'water_consumed'], ['notes', 'notes'],
  ];
  return <section className={css.detailSection}>
    <h3>{label('reportDifference')}</h3>
    <table className={css.comparison}>
      <thead><tr><th scope="col">{label('type')}</th><th scope="col">{label('originalValue')}</th><th scope="col">{label('proposedValue')}</th></tr></thead>
      <tbody>{fields.map(([name, stored]) => <tr key={name}>
        <th scope="row">{label(name)}</th><td>{format(original[name] ?? original[stored])}</td><td>{format(next[name])}</td>
      </tr>)}</tbody>
    </table>
  </section>;
}
