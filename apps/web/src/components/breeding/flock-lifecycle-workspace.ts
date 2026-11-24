export const lifecycleApi = '/v3/farm/flock-lifecycle';

export const lifecycleSections = ['admissions', 'transfers', 'losses', 'held-deliveries', 'turnaround', 'corrections', 'inbox'] as const;
export type LifecycleSection = typeof lifecycleSections[number];

export const lifecycleKinds = [
  'ADMIT', 'BASELINE', 'TRANSFER', 'MORTALITY', 'CULL', 'SELL_HELD', 'CLOSE',
  'CLEAN_START', 'CLEAN_ACCEPT', 'ADJUST', 'REVERSE', 'REPORT_CORRECTION', 'HISTORY_AUTH',
] as const;
export type LifecycleKind = typeof lifecycleKinds[number];
export type LifecycleAction = 'submit' | 'approve' | 'post' | 'cancel';
export const documentStatuses = ['DRAFT', 'SUBMITTED', 'APPROVED', 'POSTED', 'CANCELLED'] as const;

export const sectionKinds = {
  admissions: ['ADMIT', 'BASELINE'],
  transfers: ['TRANSFER'],
  losses: ['MORTALITY', 'CULL'],
  'held-deliveries': ['SELL_HELD'],
  turnaround: ['CLOSE', 'CLEAN_START', 'CLEAN_ACCEPT'],
  corrections: ['ADJUST', 'REVERSE', 'REPORT_CORRECTION', 'HISTORY_AUTH'],
  inbox: lifecycleKinds,
} satisfies Record<LifecycleSection, readonly LifecycleKind[]>;

export const specializedMenus: Partial<Record<LifecycleKind, string>> = {
  BASELINE: 'MENU_FLOCK_BASELINE', CLOSE: 'MENU_FLOCK_CLOSE', CLEAN_START: 'MENU_FLOCK_CLEAN',
  CLEAN_ACCEPT: 'MENU_FLOCK_CLEAN', ADJUST: 'MENU_FLOCK_ADJUST', REVERSE: 'MENU_FLOCK_REVERSE',
  REPORT_CORRECTION: 'MENU_FLOCK_REPORT', HISTORY_AUTH: 'MENU_FLOCK_HISTORY',
};

export function isLifecycleSection(value: string): value is LifecycleSection {
  return lifecycleSections.some(section => section === value);
}

export function isLifecycleKind(value: string | null): value is LifecycleKind {
  return lifecycleKinds.some(kind => kind === value);
}

export function sectionForKind(kind: LifecycleKind): LifecycleSection {
  return lifecycleSections.find(section => sectionKinds[section].some(value => value === kind)) ?? 'admissions';
}

export function lifecycleBase(mobile: boolean) {
  return mobile ? '/mobile/flock-lifecycle' : '/breeding/flock-lifecycle';
}

export const formQueryKeys = ['kind', 'formHouseCode', 'date', 'dailyLogId', 'shift', 'flockId', 'formFlockNo', 'heldId', 'documentId', 'occupancyId'] as const;
export const listFilterKeys = [
  'companyCode', 'farmCode', 'siteCode', 'houseCode', 'sourceHouseCode', 'targetHouseCode',
  'flockNo', 'customerCode', 'dateFrom', 'dateTo', 'status', 'id', 'mine',
] as const;
export type ListFilter = typeof listFilterKeys[number];
export const pageLimit = 25;
export const missing = '—';

export type LegacySearch = Record<string, string | string[] | undefined>;
export function lifecycleLegacyLocation(mobile: boolean, search: LegacySearch) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    for (const entry of typeof value === 'string' ? [value] : value ?? []) query.append(key, entry);
  }
  const kind = query.get('kind');
  const review = query.get('review') === 'pending';
  const section = review ? 'turnaround' : isLifecycleKind(kind) ? sectionForKind(kind) : mobile ? 'losses' : 'admissions';
  if (review) {
    query.delete('kind');
  } else if (isLifecycleKind(kind)) {
    const house = query.get('houseCode');
    const flock = query.get('flockNo');
    if (house) query.set('formHouseCode', house);
    if (flock) query.set('formFlockNo', flock);
    query.delete('houseCode');
    query.delete('flockNo');
  } else if (mobile && !query.has('doc') && !query.has('id')) {
    query.set('entry', 'mortality');
  }
  if (!query.has('doc') && query.has('id') && !isLifecycleKind(kind) && !review) {
    query.set('doc', query.get('id') ?? '');
    query.delete('id');
  }
  return `${lifecycleBase(mobile)}/${section}${query.size ? `?${query}` : ''}${review ? '#flock-documents' : ''}`;
}

export type LifecycleRow = Record<string, unknown>;
export type LifecycleDocument = LifecycleRow & {
  id: string;
  kind: LifecycleKind;
  status: string;
  version: number;
  house_code: string;
  flock_no: string;
  created_by: string;
  business_date: string;
  payload: LifecycleRow;
  blockers?: string[];
  nextAction?: LifecycleAction | null;
  allowedActions?: LifecycleAction[];
  breed_confirmation_required?: boolean;
  events?: LifecycleRow[];
  audits?: LifecycleRow[];
  amendments?: LifecycleRow[];
  settlement?: LifecycleRow | null;
};

export type LifecyclePage<T> = { items: T[]; nextCursor: string | null };
export type LifecycleEnvelope<T> = { code: number; data: T };
export const stringify = (value: unknown) => value == null || value === '' ? missing : String(value);
export const asRow = (value: unknown): LifecycleRow => value && typeof value === 'object' && !Array.isArray(value) ? value as LifecycleRow : {};
export const asList = (value: unknown): LifecycleRow[] => Array.isArray(value) ? value.map(asRow) : [];
export const businessToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date());
export const datePattern = /^\d{4}-\d{2}-\d{2}$/;
export const documentIdPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export function buildDocumentQuery(section: LifecycleSection, view: string, search: URLSearchParams, review: boolean) {
  const query = new URLSearchParams({ limit: String(pageLimit) });
  if (review) {
    query.set('review', 'pending');
    query.set('houseCode', search.get('houseCode') ?? '');
    query.set('date', search.get('date') ?? '');
  } else {
    for (const key of listFilterKeys) {
      const value = search.get(key);
      if (value && (key !== 'mine' || section === 'inbox')) query.set(key, value);
    }
    if (section === 'inbox') query.set('action', view);
    else query.set('kinds', isLifecycleKind(view) && sectionKinds[section].some(kind => kind === view) ? view : sectionKinds[section].join(','));
  }
  const cursor = search.get('cursor');
  if (cursor) query.set('cursor', cursor);
  return query;
}
