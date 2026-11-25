'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { usePermission } from '@/hooks/usePermission';
import { hasMenuPerm } from '@/contexts/AuthContext';
import PageHeader from '@/components/PageHeader';
import { EmptyState, ErrorState, PresentationalTable, StatusBadge, type ColumnV3 } from '@/components/design-system';
import { CompanySelector, CustomerSelector, FarmSelector, HouseSelector } from '@/components/shared-selectors/MasterDataSelectors';
import FlockLifecycle, { isFlockLifecyclePage, type FlockLifecycleFormContext } from '@/components/FlockLifecycle';
import FlockLifecycleDocument, { LifecycleDetailDialog } from './FlockLifecycleDocument';
import { useLifecycleRead } from './flock-lifecycle-workspace-api';
import { useLifecycleLabels } from './flock-lifecycle-workspace-labels';
import {
  asRow, buildDocumentQuery, businessToday, datePattern, documentIdPattern, documentStatuses, formQueryKeys,
  isLifecycleKind, lifecycleBase, lifecycleSections, listFilterKeys, missing, pageLimit,
  sectionKinds, specializedMenus, stringify,
  type LifecycleDocument, type LifecycleKind, type LifecyclePage, type LifecycleRow, type LifecycleSection, type ListFilter,
} from './flock-lifecycle-workspace';
import css from './FlockLifecycleWorkspace.module.css';

type Label = ReturnType<typeof useLifecycleLabels>['label'];
type FormContext = Omit<FlockLifecycleFormContext, 'kind'>;
type View = { value: string; title: string };
const defaults: Partial<Record<LifecycleSection, string>> = {
  admissions: 'ADMIT', 'held-deliveries': 'batches', turnaround: 'houses',
};
const inboxViews = [{ value: 'submit', title: 'eligibleSubmit' }, { value: 'approve', title: 'eligibleApprove' }, { value: 'post', title: 'eligiblePost' }];
const sectionViews: Partial<Record<LifecycleSection, View[]>> = {
  'held-deliveries': [{ value: 'batches', title: 'batches' }, { value: 'records', title: 'deliveryRecords' }],
  turnaround: [{ value: 'houses', title: 'houses' }, { value: 'records', title: 'documents' }],
  inbox: inboxViews,
};

function getViews(section: LifecycleSection) {
  if (section === 'transfers') return [];
  return sectionViews[section] ?? [{ value: 'all', title: 'all' }, ...sectionKinds[section].map(kind => ({ value: kind, title: kind }))];
}

function errorTitle(status?: number) {
  if (status === 403 || status === 401) return 'accessDenied';
  if (status === 404) return 'unavailable';
  if (status === 400) return 'invalidFilters';
  return 'loadFailed';
}

function tableQuantity(value: unknown, label: Label, locale: string) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return missing;
  return `${new Intl.NumberFormat(locale).format(Number(value))} ${label('birds')}`;
}

function tableDate(value: unknown, locale: string) {
  const day = typeof value === 'string' ? value.slice(0, 10) : '';
  if (!datePattern.test(day) || !Number.isFinite(Date.parse(day))) return missing;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Asia/Singapore' }).format(new Date(day));
}

export default function FlockLifecycleWorkspace({ section, mobile = false }: { section: LifecycleSection; mobile?: boolean }) {
  const access = usePermission('MENU_FARM_DATA');
  const { label } = useLifecycleLabels();
  if (!access.canView) return <p className={css.root} role="alert">{label('accessDenied')}</p>;
  const identity = String(access.user.userId ?? access.user.id ?? access.user.username ?? '');
  return <Workspace key={identity} actor={String(access.user.username ?? identity)} section={section} mobile={mobile} />;
}

function Workspace({ actor, section, mobile }: { actor: string; section: LifecycleSection; mobile: boolean }) {
  const { label, blockerLabel, locale } = useLifecycleLabels();
  const router = useRouter();
  const pathname = usePathname();
  const currentSearch = useSearchParams().toString();
  const current = new URLSearchParams(currentSearch);
  const createAccess = usePermission('MENU_FLOCK_CREATE');
  const approvalAccess = usePermission('MENU_FLOCK_APPROVE');
  const postAccess = usePermission('MENU_FLOCK_POST');
  const settingsAccess = usePermission();
  const canCreate = (kind: LifecycleKind) => {
    if (!createAccess.canEdit) return false;
    const menu = specializedMenus[kind];
    if (!menu || createAccess.isSuper) return true;
    const permissions: string[] = Array.isArray(createAccess.user.permissions) ? createAccess.user.permissions : [];
    return hasMenuPerm(permissions, menu, 'A');
  };
  const views = getViews(section);
  const defaultView = section === 'inbox' ? approvalAccess.canApprove ? 'approve' : createAccess.canEdit ? 'submit'
    : postAccess.canEdit ? 'post' : 'approve' : defaults[section] ?? 'all';
  const requestedView = current.get('view');
  const view = views.some(item => item.value === requestedView) ? requestedView ?? defaultView : defaultView;
  const review = current.get('review') === 'pending';
  const reviewDay = current.get('date') ?? '';
  const reviewHouse = current.get('houseCode') ?? '';
  const validReview = !review || Boolean(reviewHouse && datePattern.test(reviewDay)
    && Number.isFinite(Date.parse(reviewDay)) && new Date(reviewDay).toISOString().slice(0, 10) === reviewDay);
  const picker = mobile && section === 'losses' && current.get('entry') === 'mortality' && !review;
  const pickerDay = picker ? current.get('date') : null;
  const validPickerDay = !pickerDay || datePattern.test(pickerDay) && Number.isFinite(Date.parse(pickerDay))
    && new Date(pickerDay).toISOString().slice(0, 10) === pickerDay;
  const cursor = current.get('cursor') ?? '';
  const heldView = section === 'held-deliveries' && view === 'batches' && !review;
  const houseView = section === 'turnaround' && view === 'houses' && !review;
  const resourceView = picker || heldView || houseView;
  const kind = current.get('kind');
  const formKind = !review && isLifecycleKind(kind) ? kind : undefined;
  const hasFormPage = Boolean(formKind && isFlockLifecyclePage(formKind, mobile));
  const docId = current.get('doc') ?? '';
  const expanded = current.get('full') === '1';
  const base = lifecycleBase(mobile);
  const hideLists = hasFormPage || Boolean(expanded && docId && !formKind);
  const context: FlockLifecycleFormContext | undefined = formKind ? {
    kind: formKind,
    houseCode: current.get('formHouseCode') ?? current.get('houseCode') ?? undefined,
    flockNo: current.get('formFlockNo') ?? current.get('flockNo') ?? undefined,
    date: current.get('date') ?? undefined,
    dailyLogId: current.get('dailyLogId') ?? undefined,
    shift: current.get('shift') ?? undefined,
    flockId: current.get('flockId') ?? undefined,
    heldId: current.get('heldId') ?? undefined,
    documentId: current.get('documentId') ?? undefined,
    occupancyId: current.get('occupancyId') ?? undefined,
  } : undefined;

  const query = buildDocumentQuery(section, view, current, review);
  const dataPath = resourceView || !validReview ? null
    : `/${section === 'inbox' && !review ? 'inbox' : 'documents/search'}?${query}`;
  const docs = useLifecycleRead<LifecyclePage<LifecycleDocument>>(dataPath);
  const resource = useLifecycleRead<LifecycleRow[]>(resourceView && !pickerDay ? heldView ? '/held' : '/houses' : null);
  const occupancyQuery = new URLSearchParams({ date: pickerDay ?? '', limit: String(pageLimit) });
  if (cursor) occupancyQuery.set('cursor', cursor);
  const occupancy = useLifecycleRead<LifecyclePage<LifecycleRow>>(pickerDay && validPickerDay ? `/occupancies/search?${occupancyQuery}` : null);
  const ref = useRef<HTMLDivElement>(null);
  const [returnFocus, setReturnFocus] = useState<{ id: string; index: number; scroll: number }>();
  const [previousCursors, setPreviousCursors] = useState<Record<string, string>>({});
  const [blockerSelection, setBlockerSelection] = useState<LifecycleRow>();
  const lastDoc = useRef('');
  const listFiltersKey = listFilterKeys.map(key => current.get(key) ?? '').join('|');

  function update(changes: Record<string, string | null>, mode: 'push' | 'replace' = 'push') {
    const next = new URLSearchParams(currentSearch);
    for (const [key, value] of Object.entries(changes)) {
      if (value == null || value === '') next.delete(key);
      else next.set(key, value);
    }
    const fragment = next.get('review') === 'pending' ? '#flock-documents' : '';
    router[mode](`${pathname}${next.size ? `?${next}` : ''}${fragment}`, { scroll: false });
  }

  function formChanges() {
    return Object.fromEntries(formQueryKeys.filter(key => key !== 'date' || !pickerDay).map(key => [key, null])) as Record<string, string | null>;
  }

  function closeForm() {
    update(formChanges(), 'replace');
  }

  function openForm(target: LifecycleKind, payload: FormContext = {}) {
    update({
      ...formChanges(), kind: target,
      formHouseCode: payload.houseCode ?? null,
      formFlockNo: payload.flockNo ?? null,
      heldId: payload.heldId ?? null,
      documentId: payload.documentId ?? null,
      occupancyId: payload.occupancyId ?? null,
      date: payload.date ?? pickerDay,
    });
  }

  function openDocument(id: string, index = -1) {
    if (!docId) {
      const scroll = document.getElementById('phx-content-scroll')?.scrollTop ?? window.scrollY;
      setReturnFocus({ id, index, scroll });
    }
    update({ doc: id, full: null, saved: null, sourceDoc: null });
  }

  function closeDocument() {
    update({ doc: null, full: null, saved: null, sourceDoc: null }, 'replace');
  }

  function reload() {
    docs.reload();
    resource.reload();
    occupancy.reload();
  }

  useEffect(() => {
    if (lastDoc.current && !docId) {
      const location = returnFocus;
      requestAnimationFrame(() => {
        const list = ref.current;
        const rowButtons = Array.from(list?.querySelectorAll<HTMLButtonElement>('[data-flock-document]') ?? []);
        const target = rowButtons.find(button => button.dataset.flockDocument === location?.id)
          ?? (location && location.index >= 0 ? rowButtons[Math.min(location.index, rowButtons.length - 1)] : null)
          ?? list;
        const scroll = document.getElementById('phx-content-scroll');
        if (location) {
          if (scroll) scroll.scrollTop = location.scroll;
          else window.scrollTo(0, location.scroll);
        }
        target?.focus({ preventScroll: true });
      });
    }
    lastDoc.current = docId;
  }, [docId, returnFocus]);

  const docsData = docs.data && Array.isArray(docs.data.items) ? docs.data : undefined;
  const docRows = docsData?.items ?? [];
  const resourceRows = pickerDay ? occupancy.data?.items ?? [] : (resource.data ?? []).filter(row => {
    if (picker && (row.entry_readiness !== 'OCCUPIED' || !row.flock_no)) return false;
    return Object.entries(resourceFilters).every(([key, field]) => {
      const filter = current.get(key);
      return !filter || String(row[field] ?? '') === filter;
    });
  });
  const resourcePageCount = Math.max(1, Math.ceil(resourceRows.length / pageLimit));
  const requestedPage = Number(current.get('page') ?? 1);
  const resourcePage = Number.isInteger(requestedPage) ? Math.max(1, Math.min(requestedPage, resourcePageCount)) : 1;
  const shownResources = resourceRows.slice((resourcePage - 1) * pageLimit, resourcePage * pageLimit);
  const heading = review ? label('review') : picker ? label('pickHouse') : label(section);
  const primaryKind = getPrimaryKind(section, view);
  const listEmpty = listFilterKeys.some(key => current.has(key)) || review || pickerDay ? label('emptyFiltered') : label('empty');
  const resourceAvailable = Boolean(resource.data || occupancy.data);
  const listError = pickerDay ? occupancy.error : resourceView ? resource.error : docs.error;
  const listLoading = pickerDay ? occupancy.loading : resourceView ? resource.loading : docs.loading;
  const listRefreshing = pickerDay ? occupancy.refreshing : resourceView ? resource.refreshing : docs.refreshing;
  const next = pickerDay ? occupancy.data?.nextCursor : docsData?.nextCursor;
  const cursorPagination = <nav className={css.pagination} aria-label={label('pagination')}>
    {!pickerDay && <span>{label('newest')}</span>}
    {cursor && <button type="button" onClick={() => update({ cursor: previousCursors[cursor] ?? null })}>
      {label(cursor in previousCursors ? 'previousPage' : 'firstPage')}
    </button>}
    {next && <button type="button" onClick={() => {
      setPreviousCursors(previous => ({ ...previous, [next]: cursor }));
      update({ cursor: next });
    }}>{label('nextPage')}</button>}
  </nav>;
  const reviewPermission = usePermission('MENU_PROD_INBOUND').canView;
  const actions = !review && !picker && primaryKind && canCreate(primaryKind) && !formKind
    ? <button type="button" className={css.primary} onClick={() => openForm(primaryKind)}>{label(createLabel[primaryKind])}</button> : null;

  return <div className={`${css.root} ${mobile ? css.mobile : ''}`}>
    <div hidden={hideLists}>
      <PageHeader title={heading} breadcrumb={[label('production'), label('lifecycle')]} />
      <nav className={css.nav} aria-label={label('lifecycle')}>
        {lifecycleSections.map(item => <Link key={item} href={`${base}/${item}`} aria-current={item === section && !review && !picker ? 'page' : undefined}>{label(item)}</Link>)}
      </nav>
      <div className={css.tools}>
        <div className={css.actions}>
          {review && reviewPermission && <Link href={mobile ? '/mobile/production-inbound' : '/breeding/production-inbound'}>{label('reviewBack')}</Link>}
          {!review && (mobile
            ? <Link href="/mobile/mortality">{label('mortalitySummary')}</Link>
            : <Link href="/breeding/flock">{label('archive')}</Link>)}
          {!review && !mobile && settingsAccess.isSuper && <Link href="/settings/roles">{label('configuration')}</Link>}
          <button type="button" disabled={listLoading || listRefreshing} onClick={reload}>{label('refresh')}</button>
          {actions}
        </div>
        {!review && !picker && views.length > 0 && <nav className={css.views} aria-label={label('view')}>
          {views.map(item => <button key={item.value} type="button" aria-pressed={item.value === view} onClick={() =>
            update({ view: item.value === defaultView ? null : item.value, cursor: null, page: null, doc: null, full: null })}>{label(item.title)}</button>)}
        </nav>}
      </div>

      <div id="flock-documents" ref={ref} tabIndex={-1} aria-label={heading} aria-busy={listLoading || listRefreshing}>
        {review && validReview && <p className={css.reviewScope}>{reviewHouse} · {tableDate(reviewDay, locale)}</p>}
        {review && !validReview && <p role="alert">{label('reviewMissing')}</p>}
        {pickerDay && validPickerDay && <p className={css.reviewScope}>{tableDate(pickerDay, locale)}</p>}
        {!validPickerDay && <p role="alert">{label('invalidPickerDate')}</p>}
        {!review && !picker && <LifecycleFilters key={listFiltersKey + ':' + view} current={current} section={section}
          resourceView={resourceView} onApply={values => update({ ...values, cursor: null, page: null })} />}
        {!review && !picker && section === 'corrections' && (view === 'REVERSE' || view === 'HISTORY_AUTH') &&
          <DocumentLookup help={view === 'REVERSE' ? 'chooseOriginal' : 'chooseHistory'} open={openDocument} />}
        {listError && <div role="alert">
          <ErrorState title={label(errorTitle(listError.status))} compact onRetry={reload} />
          {cursor && <button type="button" onClick={() => update({ cursor: null })}>{label('firstPage')}</button>}
        </div>}
        {validReview && !resourceView && !listLoading && !listError && !docsData &&
          <ErrorState title={label('unavailable')} compact onRetry={reload} />}
        {validReview && !resourceView && (listLoading || docsData) && <>
          <PresentationalTable columns={documentColumns(section, docRows, (id, index) => openDocument(id, index), label, blockerLabel, locale)}
            rowKey={row => row.id} rows={docRows} pageSize={pageLimit} loading={listLoading} emptyText={listEmpty} />
          {cursorPagination}
        </>}
        {resourceView && (listLoading || resourceAvailable) && <ResourceTable
          held={heldView} picker={picker} rows={shownResources} loading={listLoading} emptyText={listEmpty}
          canCreate={canCreate} onForm={openForm} onDocument={openDocument} onBlockers={setBlockerSelection}
        />}
        {pickerDay && validPickerDay && cursorPagination}
        {resourceView && !pickerDay && resourcePageCount > 1 && <nav className={css.pagination} aria-label={label('pagination')}>
          <button type="button" disabled={resourcePage === 1} onClick={() => update({ page: resourcePage > 2 ? String(resourcePage - 1) : null })}>{label('previousPage')}</button>
          <span>{resourcePage} / {resourcePageCount}</span>
          <button type="button" disabled={resourcePage === resourcePageCount} onClick={() => update({ page: String(resourcePage + 1) })}>{label('nextPage')}</button>
        </nav>}
      </div>
    </div>

    {context && formKind && (canCreate(formKind)
      ? <FlockLifecycle key={JSON.stringify(context)} context={context} mobile={mobile} onClose={closeForm}
        onSaved={(saved, sourceDocumentId?: string) => {
          reload();
          update({ ...formChanges(), doc: saved.id, full: null, saved: '1', sourceDoc: sourceDocumentId ?? context.documentId ?? null }, 'replace');
        }} />
      : <LifecycleDetailDialog title={label(formKind)} onClose={closeForm} expanded={hasFormPage}>
        <p role="alert">{label('accessDenied')}</p>
      </LifecycleDetailDialog>)}
    {docId && !formKind && <FlockLifecycleDocument key={docId} actor={actor} id={docId} expanded={expanded}
      created={current.get('saved') === '1'} sourceId={current.get('sourceDoc') ?? undefined}
      onClose={closeDocument} onExpand={() => update({ full: '1' })} onChanged={reload}
      onOpen={openDocument} onForm={openForm} canCreate={canCreate} />}
    {blockerSelection && !formKind && !docId && <TurnaroundBlockers row={blockerSelection} mobile={mobile} close={() => setBlockerSelection(undefined)} />}
  </div>;
}

const resourceFilters = { companyCode: 'company_code', farmCode: 'farm_code', siteCode: 'site_code', houseCode: 'house_code', flockNo: 'flock_no' };
const createLabel = {
  ADMIT: 'createAdmit', BASELINE: 'createBaseline', TRANSFER: 'createTransfer', MORTALITY: 'createMortality',
  CULL: 'createCull', ADJUST: 'createAdjust', REPORT_CORRECTION: 'createCorrection',
};

function getPrimaryKind(section: LifecycleSection, view: string) {
  if (section === 'admissions') return view === 'BASELINE' ? 'BASELINE' : 'ADMIT';
  if (section === 'transfers') return 'TRANSFER';
  if (section === 'losses') return view === 'CULL' ? 'CULL' : 'MORTALITY';
  if (section === 'corrections' && view === 'REPORT_CORRECTION') return 'REPORT_CORRECTION';
  if (section === 'corrections' && (view === 'all' || view === 'ADJUST')) return 'ADJUST';
  return undefined;
}

function formDataFor(values: URLSearchParams) {
  return Object.fromEntries(listFilterKeys.map(key => [key, values.get(key) ?? ''])) as Record<ListFilter, string>;
}

function LifecycleFilters({ current, section, resourceView, onApply }: {
  current: URLSearchParams;
  section: LifecycleSection;
  resourceView: boolean;
  onApply: (values: Record<ListFilter, string | null>) => void;
}) {
  const { label } = useLifecycleLabels();
  const [values, setValues] = useState(() => formDataFor(current));
  const [problem, setProblem] = useState('');
  const set = (key: ListFilter, value: string) => setValues(previous => ({ ...previous, [key]: value }));
  const props = (key: ListFilter) => ({
    ariaLabel: label(key), value: values[key], onChange: (value: string) => set(key, value), placeholder: label('all'), preserveValue: true,
  });
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = values.id.trim();
    if (id && !documentIdPattern.test(id)) {
      setProblem('invalidId');
      return;
    }
    if (values.dateFrom && values.dateTo && values.dateTo < values.dateFrom) {
      setProblem('invalidDate');
      return;
    }
    setProblem('');
    onApply({ ...values, id, flockNo: values.flockNo.trim() });
  }
  return <form className={css.filters} onSubmit={apply}>
    <div className={css.filterGrid}>
      <div><label>{label('companyCode')}<CompanySelector {...props('companyCode')} /></label></div>
      <div><label>{label('farmCode')}<FarmSelector {...props('farmCode')} /></label></div>
      {section === 'transfers' ? <>
        <div><label>{label('sourceHouseCode')}<HouseSelector {...props('sourceHouseCode')} farmCode={values.farmCode || undefined} /></label></div>
        <div><label>{label('targetHouseCode')}<HouseSelector {...props('targetHouseCode')} /></label></div>
      </> : <div><label>{label('houseCode')}<HouseSelector {...props('houseCode')} farmCode={values.farmCode || undefined} /></label></div>}
      <div><label>{label('flockNo')}<input value={values.flockNo} onChange={event => set('flockNo', event.target.value)} /></label></div>
      {!resourceView && <>
        <div><label>{label('dateFrom')}<input type="date" value={values.dateFrom} onChange={event => set('dateFrom', event.target.value)} /></label></div>
        <div><label>{label('dateTo')}<input type="date" value={values.dateTo} onChange={event => set('dateTo', event.target.value)} /></label></div>
        {section !== 'inbox' && <div><label>{label('status')}<select value={values.status} onChange={event => set('status', event.target.value)}>
          <option value="">{label('all')}</option>
          {documentStatuses.map(status => <option value={status} key={status}>{label(status)}</option>)}
        </select></label></div>}
        {section === 'held-deliveries' && <div><label>{label('customerCode')}<CustomerSelector {...props('customerCode')} /></label></div>}
        <div><label>{label('id')}<input value={values.id} placeholder={label('fullId')} onChange={event => set('id', event.target.value)} /></label></div>
        {section === 'inbox' && <label className={css.checkbox}><input type="checkbox" checked={values.mine === 'true'}
          onChange={event => set('mine', event.target.checked ? 'true' : '')} />{label('mine')}</label>}
      </>}
    </div>
    <div className={css.actions}>
      <button type="submit">{label('search')}</button>
      <button type="button" onClick={() => {
        const blank = formDataFor(new URLSearchParams());
        setValues(blank);
        setProblem('');
        onApply(blank);
      }}>{label('reset')}</button>
    </div>
    {problem && <p role="alert">{label(problem)}</p>}
  </form>;
}

function DocumentLookup({ help, open }: { help: string; open: (id: string) => void }) {
  const { label } = useLifecycleLabels();
  const [id, setId] = useState('');
  const [invalid, setInvalid] = useState(false);
  return <form className={css.lookup} onSubmit={event => {
    event.preventDefault();
    const value = id.trim();
    setInvalid(!documentIdPattern.test(value));
    if (documentIdPattern.test(value)) open(value);
  }}>
    <p>{label(help)}</p>
    <label>{label('id')} <input value={id} placeholder={label('fullId')} onChange={event => setId(event.target.value)} /></label>
    <button type="submit">{label('documentSearch')}</button>
    {invalid && <span role="alert">{label('invalidId')}</span>}
  </form>;
}

function documentColumns(
  section: LifecycleSection, rows: LifecycleDocument[], open: (id: string, index: number) => void, label: Label, blockerLabel: (code: string) => string, locale: string,
): ColumnV3<LifecycleDocument>[] {
  const common: ColumnV3<LifecycleDocument>[] = [
    { key: 'id', title: label('id'), render: row => <button type="button" className={css.textButton} data-flock-document={row.id} onClick={() => open(row.id, rows.indexOf(row))}>{row.id}</button> },
    { key: 'business_date', title: label('date'), render: row => tableDate(row.business_date, locale) },
    { key: 'kind', title: label('type'), render: row => label(row.kind) },
    { key: 'flock_no', title: label('flockNo'), render: row => stringify(row.flock_no) },
  ];
  const qty = (value: unknown) => tableQuantity(value, label, locale);
  const payload = (row: LifecycleDocument) => asRow(row.payload);
  const extras: Partial<Record<LifecycleSection, ColumnV3<LifecycleDocument>[]>> = {
    admissions: [
      { key: 'source', title: label('source'), render: row => stringify(payload(row).sourceCode ?? payload(row).sourceFarmCode) },
      { key: 'receipt', title: label('sourceReceipt'), render: row => stringify(payload(row).sourceReceipt ?? payload(row).differenceReceipt) },
      { key: 'difference', title: label('difference'), align: 'right', render: row =>
        row.kind === 'BASELINE' && payload(row).expectedLegacyQty != null ? qty(Number(payload(row).quantity) - Number(payload(row).expectedLegacyQty)) : missing },
    ],
    transfers: [
      { key: 'target', title: label('targetHouseCode'), render: row => stringify(payload(row).targetHouseCode) },
      { key: 'capacity', title: label('capacity'), align: 'right', render: row => qty(row.target_capacity ?? row.targetCapacity) },
    ],
    losses: [
      { key: 'disposal', title: label('dispose'), render: row => stringify(payload(row).disposalMethod) },
      { key: 'position', title: label('position'), render: row => stringify(payload(row).positionCode) },
    ],
    'held-deliveries': [
      { key: 'customer', title: label('customerCode'), render: row => stringify(asRow(row.settlement).customer_code ?? payload(row).customerCode) },
      { key: 'amount', title: label('amount'), align: 'right', render: row => {
        const settlement = asRow(row.settlement);
        const amount = settlement.amount ?? row.settlement_amount;
        const currency = settlement.currency_code ?? row.settlement_currency_code ?? payload(row).currencyCode;
        return amount == null ? stringify(currency) : `${stringify(currency)} ${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount))}`;
      } },
      { key: 'finance', title: label('settlement'), render: row => {
        const finance = asRow(row.settlement).finance_status ?? row.finance_status;
        return typeof finance === 'string' ? label('receipt') : missing;
      } },
    ],
    corrections: [
      { key: 'original', title: label('original'), render: row => stringify(payload(row).originalDocumentId ?? payload(row).dailyLogId) },
      { key: 'occupancy', title: label('occupancy'), render: row => stringify(row.occupancy_id ?? payload(row).originalOccupancyId) },
      { key: 'sourceDate', title: label('sourceDate'), render: row => payload(row).periodFrom
        ? `${tableDate(payload(row).periodFrom, locale)} – ${tableDate(payload(row).periodTo, locale)}` : tableDate(row.business_date, locale) },
      { key: 'authorization', title: label('authorization'), render: row => stringify(payload(row).periodApprovalRef ?? row.authorization_status) },
    ],
    inbox: [
      { key: 'creator', title: label('creator') },
      { key: 'blockers', title: label('blockers'), render: row => (row.blockers ?? []).map(blockerLabel).join(' · ') || missing },
    ],
  };
  return [
    ...common,
    { key: 'house_code', title: label(section === 'transfers' ? 'sourceHouseCode' : 'houseCode'), render: row => stringify(row.house_code) },
    ...(extras[section] ?? []),
    { key: 'quantity', title: label('quantity'), align: 'right', render: row => {
      const amount = row.kind === 'TRANSFER' ? row.transferred_quantity ?? row.estimated_quantity
        : asRow(row.settlement).quantity ?? payload(row).quantity;
      const display = qty(amount);
      return row.kind === 'TRANSFER' && row.status !== 'POSTED' && display !== missing ? `${label('estimate')} ${display}` : display;
    } },
    { key: 'status', title: label('status'), render: row => <StatusBadge status={row.status} label={label(row.status)} /> },
    { key: 'actions', title: label('actions'), render: row => <button type="button" className={css.textButton} onClick={() => open(row.id, rows.indexOf(row))}>{label('view')}</button> },
  ];
}

function ResourceTable({ held, picker, rows, loading, emptyText, canCreate, onForm, onDocument, onBlockers }: {
  held: boolean;
  picker: boolean;
  rows: LifecycleRow[];
  loading: boolean;
  emptyText: string;
  canCreate: (kind: LifecycleKind) => boolean;
  onForm: (kind: LifecycleKind, context: FormContext) => void;
  onDocument: (id: string) => void;
  onBlockers: (row: LifecycleRow) => void;
}) {
  const { label, locale } = useLifecycleLabels();
  const context = (row: LifecycleRow): FormContext => ({
    houseCode: String(row.house_code ?? ''), flockNo: String(row.flock_no ?? ''), occupancyId: String(row.occupancy_id ?? ''),
  });
  const cell = (kind: LifecycleKind, key: string, row: LifecycleRow, extra?: FormContext) => canCreate(kind)
    ? <button type="button" key={kind} onClick={() => onForm(kind, { ...context(row), ...extra })}>{label(key)}</button> : null;
  const quantity = (value: unknown) => tableQuantity(value, label, locale);
  if (picker && !loading) return rows.length ? <ul className={css.picker}>
    {rows.map(row => <li key={String(row.occupancy_id ?? row.house_code)}>
      <strong>{String(row.house_name || row.house_code)}</strong>
      <p>{stringify(row.flock_no)}{row.quantity != null && ' · ' + quantity(row.quantity)}</p>
      <div className={css.actions}>{cell('MORTALITY', 'createMortality', row)}{cell('CULL', 'createCull', row)}</div>
    </li>)}
  </ul> : <EmptyState title={emptyText} />;
  const leading: ColumnV3<LifecycleRow>[] = held ? [{ key: 'id', title: label('batch') }] : [];
  const facts: ColumnV3<LifecycleRow>[] = held ? [
    { key: 'position_code', title: label('position') },
    { key: 'source', title: label('source'), render: row => typeof row.document_id === 'string' &&
        <button type="button" className={css.textButton} onClick={() => onDocument(String(row.document_id))}>{row.document_id}</button> },
  ] : [
    { key: 'entry_readiness', title: label('houseStatus'), render: row =>
      <StatusBadge status={stringify(row.entry_readiness)} label={label(stringify(row.entry_readiness))} /> },
    { key: 'lastAcceptance', title: label('lastAcceptance'), render: row => tableDate(row.last_acceptance_on ?? row.last_accepted_on, locale) },
  ];
  const columns: ColumnV3<LifecycleRow>[] = [
    ...leading,
    { key: 'house_code', title: label('houseCode'), render: row => stringify(row.house_name ?? row.house_code) },
    { key: 'flock_no', title: label('flockNo'), render: row => stringify(row.flock_no) },
    ...facts,
    { key: 'quantity', title: label('balance'), align: 'right', render: row => quantity(row.quantity) },
    { key: 'actions', title: label('actions'), render: row => held
      ? Number(row.quantity) > 0 && cell('SELL_HELD', 'createSell', row, { heldId: String(row.id) })
      : <div className={css.actions}>
        {row.entry_readiness === 'OCCUPIED' && <>
          {cell('CLOSE', 'createClose', row)}
          {Boolean(row.occupancy_id) && <button type="button" onClick={() => onBlockers(row)}>{label('checkBlockers')}</button>}
        </>}
        {['DIRTY', 'FIRST_CLEAN'].includes(String(row.entry_readiness)) && cell('CLEAN_START', 'createClean', row)}
        {row.entry_readiness === 'CLEANING' && cell('CLEAN_ACCEPT', 'createAccept', row)}
        {row.entry_readiness === 'READY' && cell('ADMIT', 'createAdmit', row)}
      </div>,
    },
  ];
  return <PresentationalTable columns={columns} rowKey={row => String(row.id ?? row.house_code)}
    rows={rows} loading={loading} pageSize={pageLimit} emptyText={emptyText} />;
}

function TurnaroundBlockers({ row, mobile, close }: { row: LifecycleRow; mobile: boolean; close: () => void }) {
  const { label, blockerLabel } = useLifecycleLabels();
  const canOpenWorkbench = usePermission('MENU_PROD_INBOUND').canView;
  const [date, setDate] = useState(businessToday);
  const path = datePattern.test(date) ? `/occupancies/${encodeURIComponent(String(row.occupancy_id))}/close-blockers?${new URLSearchParams({ businessDate: date })}` : null;
  const blockers = useLifecycleRead<LifecycleRow[]>(path);
  return <LifecycleDetailDialog title={label('blockers')} subtitle={String(row.house_name ?? row.house_code)} onClose={close}>
    <label>{label('date')} <input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
    {blockers.loading && <p role="status">{label('loading')}</p>}
    {blockers.error && <ErrorState title={label(errorTitle(blockers.error.status))} onRetry={blockers.reload} compact />}
    {blockers.data?.length === 0 && <p>{label('noBlockers')}</p>}
    {blockers.data?.map((blocker, index) => {
      const code = String(blocker.reason ?? '');
      if (code === 'OTHER_SCOPE_REVIEW') return <p key={code}>{label('blockedOtherScope')}</p>;
      return <div className={css.event} key={`${code}:${index}`}>
        <p>{blockerLabel(code)} · {stringify(blocker.reference)}</p>
        <p>{label('handoverHandoff')}</p>
      </div>;
    })}
    {canOpenWorkbench && blockers.data?.some(row => row.reason !== 'OTHER_SCOPE_REVIEW') &&
      <p><Link href={mobile ? '/mobile/production-inbound' : '/breeding/production-inbound'}>{label('reviewBack')}</Link></p>}
  </LifecycleDetailDialog>;
}
