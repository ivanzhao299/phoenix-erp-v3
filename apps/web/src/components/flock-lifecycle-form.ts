export const flockLifecycleEndpoint = '/v3/farm/flock-lifecycle';

export const flockLifecycleKinds = [
  'ADMIT', 'BASELINE', 'TRANSFER', 'MORTALITY', 'CULL', 'SELL_HELD', 'CLOSE',
  'CLEAN_START', 'CLEAN_ACCEPT', 'ADJUST', 'REVERSE', 'REPORT_CORRECTION', 'HISTORY_AUTH',
] as const;
export type FlockLifecycleKind = typeof flockLifecycleKinds[number];
export type FlockRow = Record<string, unknown>;

export interface FlockLifecycleDocument extends FlockRow {
  id: string;
  kind: FlockLifecycleKind;
  status: string;
  version: number;
  house_code: string;
  flock_no: string;
  business_date: string;
  source_key: string;
  created_by: string;
  payload: FlockRow;
}

export interface FlockLifecycleFormContext {
  kind: string;
  houseCode?: string;
  date?: string;
  dailyLogId?: string;
  shift?: string;
  flockId?: string;
  flockNo?: string;
  heldId?: string;
  documentId?: string;
  occupancyId?: string;
}

export const flockSpecialMenus: Partial<Record<FlockLifecycleKind, string>> = {
  BASELINE: 'MENU_FLOCK_BASELINE', ADJUST: 'MENU_FLOCK_ADJUST', REVERSE: 'MENU_FLOCK_REVERSE',
  REPORT_CORRECTION: 'MENU_FLOCK_REPORT', HISTORY_AUTH: 'MENU_FLOCK_HISTORY',
  CLOSE: 'MENU_FLOCK_CLOSE', CLEAN_START: 'MENU_FLOCK_CLEAN', CLEAN_ACCEPT: 'MENU_FLOCK_CLEAN',
};

export const shortFlockTasks = ['MORTALITY', 'CULL', 'CLEAN_START', 'CLEAN_ACCEPT'];
export const isFlockLifecyclePage = (kind: string, mobile = false) =>
  mobile || ['BASELINE', 'CLOSE', 'REVERSE', 'REPORT_CORRECTION'].includes(kind);
export const isFlockLifecycleKind = (kind: string): kind is FlockLifecycleKind =>
  flockLifecycleKinds.some(value => value === kind);

export function flockBusinessToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date());
}

export function flockDay(value: unknown): string {
  const day = String(value ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && !day.startsWith('0000-')
    && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day ? day : '';
}

export function flockFormParams(params: Record<string, string | undefined>): string {
  return new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => Boolean(e[1]))).toString();
}

export function readyForFlockEntry(house: FlockRow) {
  return house.entry_readiness === 'READY'
    || (house.entry_readiness === undefined && house.status === 'ACTIVE' && house.state === 'READY' && !house.turnaround_history_review);
}

export const flockEntryHint: Record<string, string> = {
  FIRST_CLEAN: 'flockEntry.firstClean', DIRTY: 'flockEntry.dirty', CLEANING: 'flockEntry.cleaning',
  OCCUPIED: 'flockEntry.occupied', HISTORY_REVIEW: 'flockEntry.historyReview', INACTIVE: 'flockEntry.inactive',
};

export function flockFormIdentity(context: FlockLifecycleFormContext): string {
  return JSON.stringify([context.kind, context.houseCode, context.date, context.dailyLogId, context.shift,
    context.flockNo, context.flockId, context.heldId, context.documentId, context.occupancyId]);
}

function scopeValues(value: unknown) {
  return Array.isArray(value) ? value.map(String).sort() : String(value ?? '');
}

export function flockFormActor(user: FlockRow): string | null {
  const id = user.userId ?? user.id ?? user.sub ?? user.username;
  if (!id) return null;
  const impersonator = user.impersonatedBy as {id?: unknown} | undefined;
  return JSON.stringify([id, user.username, impersonator?.id, Number(user.perms_version ?? 1), user.primaryOrg, user.storeCode,
    scopeValues(user.boundFarmCodes), scopeValues(user.boundSites), scopeValues(user.roles), scopeValues(user.permissions)]);
}

export interface PendingFlockCreate {
  owner: string;
  identity: string;
  sentAt: number;
  request: string;
  sourceKey: string;
  houseCode: string;
  companyCode: string;
  originalId?: string;
}

const storagePrefix = 'phoenix-flock-create:';
const draftTtl = 24 * 60 * 60 * 1000;

function createKey(identity: string) {
  return storagePrefix + identity;
}

export function loadFlockCreate(owner: string, identity: string): PendingFlockCreate | null {
  try {
    const storage = window.sessionStorage;
    for (const key of Object.keys(storage)) {
      if (!key.startsWith(storagePrefix)) continue;
      try {
        const pending = JSON.parse(storage.getItem(key) ?? 'null') as PendingFlockCreate | null;
        if (!pending || pending.owner !== owner || !Number.isFinite(pending.sentAt)
          || Date.now() - pending.sentAt >= draftTtl) storage.removeItem(key);
      } catch {
        storage.removeItem(key);
      }
    }
    const pending = JSON.parse(storage.getItem(createKey(identity)) ?? 'null') as PendingFlockCreate | null;
    const body = pending && JSON.parse(pending.request) as FlockRow | null;
    return pending && pending.owner === owner && pending.identity === identity && body
      && body.houseCode === pending.houseCode && body.sourceKey === pending.sourceKey ? pending : null;
  } catch {
    return null;
  }
}

export function retainFlockCreate(pending: PendingFlockCreate) {
  window.sessionStorage.setItem(createKey(pending.identity), JSON.stringify(pending));
}

export function clearFlockCreate(pending: PendingFlockCreate) {
  try {
    const key = createKey(pending.identity);
    const stored = JSON.parse(window.sessionStorage.getItem(key) ?? 'null') as PendingFlockCreate | null;
    if (stored?.owner === pending.owner && stored.sourceKey === pending.sourceKey) window.sessionStorage.removeItem(key);
  } catch {
    // The in-memory operation has already resolved.
  }
}

export function flockInteger(value: string): number | null {
  if (!/^-?\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function flockSettlementPreview(amount: string, quantity: number | null): string | null {
  if (quantity === null || quantity <= 0 || !/^\d{1,9}(?:\.\d{1,6})?$/.test(amount)) return null;
  const [whole, fraction = ''] = amount.split('.');
  const micros = BigInt(whole + fraction.padEnd(6, '0'));
  if (micros <= BigInt(0)) return null;
  const cents = (micros * BigInt(quantity) + BigInt(5000)) / BigInt(10000);
  const padded = String(cents).padStart(3, '0');
  return padded.slice(0, -2) + '.' + padded.slice(-2);
}

export const flockEvidenceKinds = [
  'CLOSE', 'HISTORY_AUTH', 'REPORT_CORRECTION', 'BASELINE', 'ADJUST', 'REVERSE',
  'CLEAN_ACCEPT', 'ADMIT', 'MORTALITY', 'CULL', 'SELL_HELD',
];
export const flockDifferenceKinds = ['REPORT_CORRECTION', 'BASELINE', 'ADJUST', 'REVERSE'];
export const flockCountKinds = ['BASELINE', 'ADMIT', 'MORTALITY', 'CULL', 'SELL_HELD'];
export const flockReverseKinds = ['MORTALITY', 'CULL', 'ADJUST'];

export function createPendingFlockCreate(data: Omit<PendingFlockCreate, "sentAt">): PendingFlockCreate {
  return { ...data, sentAt: Date.now() };
}
