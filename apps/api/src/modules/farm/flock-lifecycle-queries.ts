import { BadRequestException, HttpException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { EntityManager } from 'typeorm';
import { OrgScope, scopeWhere } from './farm.service';
import {
  FLOCK_PENDING_ACTIONS, FlockActor, PendingFlockAction, hasFlockActionPermission, hasFlockSpecialPermission,
} from './flock-lifecycle-access';
import {
  FLOCK_DOCUMENT_KINDS, assertFlockCloseReadiness, assertFlockEvidence, assertNoHealthPending, assertOrdinaryFlockState, flockBusinessDate,
  flockReportSnapshotColumns, isOrdinaryFlockAction, reportHash,
} from './flock-lifecycle.service';
import { assertHouseReadyForEntry } from './flock-house-turnaround';
import { assertFlockTransferSource } from './flock-transfer-source';
import { resolveHouseCapacity } from './house-capacity';

export type FlockSearchInput = Record<string, unknown>;

const documentStatuses = ['DRAFT', 'SUBMITTED', 'APPROVED', 'POSTED', 'CANCELLED'] as const;
const pendingActions = ['submit', 'approve', 'post'] as const;
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function value(input: FlockSearchInput, key: string, maxLength = 128) {
  const raw = input[key];
  if (raw === undefined || raw === '') return undefined;
  if (typeof raw !== 'string' || !raw.trim() || raw.length > maxLength) {
    throw new BadRequestException('筛选参数无效');
  }
  return raw.trim();
}

function selected<T extends string>(input: FlockSearchInput, singular: string, plural: string, allowed: readonly T[]): T[] | undefined {
  const singularValue = value(input, singular);
  const pluralValue = value(input, plural, 512);
  if (singularValue && pluralValue) throw new BadRequestException('同一筛选条件不能重复');
  const raw = singularValue ? [singularValue] : pluralValue?.split(',');
  if (!raw) return undefined;
  if (raw.some(item => !allowed.includes(item as T))) throw new BadRequestException('筛选类型或状态无效');
  return [...new Set(raw as T[])].sort();
}

function day(input: FlockSearchInput, key: string) {
  const text = value(input, key);
  return text ? flockBusinessDate(text) : undefined;
}

function uuid(input: FlockSearchInput, key: string) {
  const text = value(input, key);
  if (text && !uuidPattern.test(text)) throw new BadRequestException('编号必须是完整 UUID');
  return text?.toLowerCase();
}

function reportId(input: FlockSearchInput, key: string) {
  const text = value(input, key);
  if (text && (!/^\d+$/.test(text) || Number(text) < 1 || Number(text) > 2_147_483_647)) {
    throw new BadRequestException('日报编号无效');
  }
  return text ? Number(text) : undefined;
}

type Cursor = { filter: string; at: string; id: string };
type SearchRow = { search_time: string; search_id: string };
type SearchPage<Row> = { items: Row[]; nextCursor: string | null };

class FlockPage {
  readonly params: unknown[] = [];
  private readonly clauses: string[] = [];
  private readonly limit: number;
  private readonly filter: string;
  private readonly after?: Cursor;

  constructor(resource: string, options: object, input: FlockSearchInput, clock: RegExp, key: RegExp) {
    const limit = value(input, 'limit') ?? '50';
    if (!/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 100) {
      throw new BadRequestException('分页大小必须为 1–100');
    }
    this.limit = Number(limit);
    this.filter = createHash('sha256').update(JSON.stringify([resource, options])).digest('base64url');
    const cursor = value(input, 'cursor', 512);
    if (!cursor) return;
    try {
      if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error();
      const current = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as Cursor;
      if (current.filter !== this.filter || !clock.test(current.at) || !key.test(current.id)) throw new Error();
      flockBusinessDate(current.at.slice(0, 10));
      if (clock === timestampPattern && !Number.isFinite(Date.parse(current.at))) throw new Error();
      if (key === numericPattern && Number(current.id) > 2_147_483_647) throw new Error();
      this.after = current;
    } catch {
      throw new BadRequestException('分页游标无效或筛选条件已改变');
    }
  }

  param(value: unknown) {
    this.params.push(value);
    return '$' + this.params.length;
  }

  where(clause?: string) {
    if (clause) this.clauses.push(clause);
  }

  match(column: string, value?: string | number) {
    if (value !== undefined) this.where(`${column}=${this.param(value)}`);
  }

  oneOf(column: string, values?: readonly string[]) {
    if (values) this.where(`${column}=ANY(${this.param(values)})`);
  }

  sql(order: string, id: string, orderType: 'date' | 'timestamptz', idType: 'integer' | 'text') {
    if (this.after) {
      this.where(`(${order},${id})<(${this.param(this.after.at)}::${orderType},${this.param(this.after.id)}::${idType})`);
    }
    return `${this.clauses.length ? 'WHERE ' + this.clauses.join(' AND ') : ''}
      ORDER BY ${order} DESC,${id} DESC LIMIT ${this.param(this.limit + 1)}`;
  }

  result<Row extends SearchRow, Item>(rows: Row[], item: (row: Row) => Item): SearchPage<Item> {
    const items = rows.slice(0, this.limit);
    const last = items.at(-1);
    const nextCursor = rows.length > this.limit && last
      ? Buffer.from(JSON.stringify({filter: this.filter, at: last.search_time, id: last.search_id})).toString('base64url')
      : null;
    return {items: items.map(item), nextCursor};
  }
}
const numericPattern = /^[1-9]\d{0,9}$/;

function documentFilters(input: FlockSearchInput) {
  const review = value(input, 'review');
  const houseCode = value(input, 'houseCode');
  const date = day(input, 'date');
  const dateFrom = day(input, 'dateFrom');
  const dateTo = day(input, 'dateTo');
  if ((review && (review !== 'pending' || !houseCode || !date)) || (dateFrom && dateTo && dateFrom > dateTo)) {
    throw new BadRequestException('复核须指定鸡舍和日期，日期范围须按先后顺序');
  }
  return {
    review, date, dateFrom, dateTo, houseCode, id: uuid(input, 'id'),
    kinds: selected(input, 'kind', 'kinds', FLOCK_DOCUMENT_KINDS),
    statuses: selected(input, 'status', 'statuses', documentStatuses),
    companyCode: value(input, 'companyCode'), farmCode: value(input, 'farmCode'), siteCode: value(input, 'siteCode'),
    sourceHouseCode: value(input, 'sourceHouseCode'), targetHouseCode: value(input, 'targetHouseCode'),
    flockNo: value(input, 'flockNo'), customerCode: value(input, 'customerCode'),
  };
}

const scopedHouses = `SELECT h.house_code,h.farm_code,h.capacity,h.max_capacity,h.status,
  f.company_code,COALESCE(f.mapped_site_code,'') AS site_code,f.status AS farm_status
  FROM brd_houses h JOIN brd_farms f ON f.farm_code=h.farm_code WHERE NULLIF(f.company_code,'') IS NOT NULL`;

function requiredHouseChecks(scope: OrgScope, page: FlockPage) {
  return {
    source: () => {
      const scoped = scopeWhere(scope, page.params, 'source.');
      return `EXISTS(SELECT 1 FROM (${scopedHouses}) source WHERE source.house_code=d.house_code
        AND source.company_code=d.company_code AND source.farm_code=d.farm_code AND source.site_code=d.site_code
        ${scoped ? 'AND ' + scoped : ''})`;
    },
    target: () => {
      const scoped = scopeWhere(scope, page.params, 'target.');
      return `(NULLIF(d.payload->>'targetHouseCode','') IS NULL OR EXISTS(SELECT 1 FROM (${scopedHouses}) target
        WHERE target.house_code=d.payload->>'targetHouseCode' AND target.company_code=d.company_code ${scoped ? 'AND ' + scoped : ''}))`;
    },
    current: () => {
      const scoped = scopeWhere(scope, page.params, 'current_house.');
      return `(d.kind NOT IN ('REPORT_CORRECTION','SELL_HELD','REVERSE')
        OR NOT EXISTS(SELECT 1 FROM brd_flock_balances WHERE flock_no=d.flock_no)
        OR EXISTS(SELECT 1 FROM brd_flock_balances current_balance JOIN (${scopedHouses}) current_house ON current_house.house_code=current_balance.house_code
          WHERE current_balance.flock_no=d.flock_no ${scoped ? 'AND ' + scoped : ''}))`;
    },
    admissionOrigin: () => {
      const scoped = scopeWhere(scope, page.params, 'origin.');
      return `(d.kind<>'ADMIT' OR d.payload->>'sourceKind' IS DISTINCT FROM 'INTERNAL' OR EXISTS(
        SELECT 1 FROM (SELECT farm_code,company_code,mapped_site_code AS site_code FROM brd_farms) origin
        WHERE origin.farm_code=d.payload->>'sourceFarmCode' AND origin.company_code=d.company_code
        ${scoped ? 'AND ' + scoped : ''}))`;
    },
  };
}

const summaryPayload = `jsonb_strip_nulls(jsonb_build_object(
  'kind',d.kind,'quantity',d.payload->'quantity','targetHouseCode',d.payload->'targetHouseCode',
  'sourceKind',d.payload->'sourceKind','sourceFarmCode',d.payload->'sourceFarmCode','sourceCode',d.payload->'sourceCode',
  'sourceReceipt',d.payload->'sourceReceipt','expectedLegacyQty',d.payload->'expectedLegacyQty',
  'disposalMethod',d.payload->'disposalMethod','positionCode',d.payload->'positionCode',
  'customerCode',d.payload->'customerCode','currencyCode',d.payload->'currencyCode','unitPrice',d.payload->'unitPrice',
  'heldId',d.payload->'heldId','originalDocumentId',d.payload->'originalDocumentId','dailyLogId',d.payload->'dailyLogId',
  'originalOccupancyId',d.payload->'originalOccupancyId','periodFrom',d.payload->'periodFrom','periodTo',d.payload->'periodTo'
))`;

const breedConfirmationRequired = `CASE WHEN d.kind='BASELINE' AND d.status IN ('DRAFT','SUBMITTED','APPROVED') THEN NOT EXISTS(
  SELECT 1 FROM brd_flocks x JOIN sys_dict k ON k.dict_type='BRD_BREED' AND k.status='ACTIVE' AND k.dict_code=x.breed_code
  WHERE x.flock_no=d.flock_no AND x.house_code=d.house_code AND x.farm_code=d.farm_code AND NULLIF(BTRIM(x.breed_code),'') IS NOT NULL)
  ELSE false END`;

type ActionFacts = {
  id: string;
  kind: string;
  status: string;
  flock_no: string;
  company_code: string;
  farm_code: string;
  site_code: string;
  business_date: string;
  created_by: string;
  house_code: string;
  payload: Record<string, unknown>;
  breed_confirmation_required: boolean;
  today: string;
  active_source: boolean;
  active_target: boolean | null;
  target_capacity: number | null;
  target_state: string | null;
  balance_house: string | null;
  balance_farm: string | null;
  balance_company: string | null;
  balance_site: string | null;
  balance_quantity: number | null;
  balance_version: number | null;
  balance_closed_on: string | null;
};

function balanceMatchesSource(row: ActionFacts) {
  return row.balance_house === row.house_code && row.balance_farm === row.farm_code
    && row.balance_company === row.company_code && row.balance_site === row.site_code;
}

function rowBlockers(row: ActionFacts, action: PendingFlockAction) {
  const directPosition = isOrdinaryFlockAction(row.kind) || row.kind === 'BASELINE';
  // Ordinary operations cannot use the quantity, date or status of a balance in another house.
  if (directPosition && row.balance_version !== null && !balanceMatchesSource(row)) {
    return ['FLOCK_OWNERSHIP_CHANGED'];
  }
  const blockers: string[] = [];
  if (row.breed_confirmation_required) blockers.push('FLOCK_BASELINE_BREED_REQUIRED');
  if (action === 'post' && row.business_date > row.today) blockers.push('FLOCK_FUTURE_DATE');
  if (action === 'post' && row.balance_version === null && (isOrdinaryFlockAction(row.kind)
    || ['SELL_HELD','REPORT_CORRECTION','REVERSE'].includes(row.kind))) blockers.push('FLOCK_BASELINE_REQUIRED');
  if (directPosition) {
    const balance = row.balance_version === null ? undefined : {
      house_code: row.balance_house!, farm_code: row.balance_farm!, company_code: row.balance_company!,
      site_code: row.balance_site, closed_on: row.balance_closed_on,
    };
    try {
      assertOrdinaryFlockState(row.kind, balance, row);
    } catch (error) {
      blockers.push(blockerCode(error, 'FLOCK_OWNERSHIP_CHANGED'));
    }
  }
  if (action === 'post' && !row.active_source && !['REPORT_CORRECTION', 'REVERSE'].includes(row.kind)) {
    blockers.push('FLOCK_INACTIVE_HOUSE');
  }
  if (['ADMIT', 'TRANSFER'].includes(row.kind)) {
    const active = row.kind === 'ADMIT' ? row.active_source : row.active_target;
    if (!active) blockers.push('FLOCK_INACTIVE_HOUSE');
    if (row.target_state !== 'READY') blockers.push('FLOCK_HOUSE_ENTRY_NOT_READY');
    const quantity = row.kind === 'ADMIT' ? row.payload.quantity : row.balance_quantity;
    if (row.target_capacity === null || typeof quantity === 'number' && quantity > row.target_capacity) {
      blockers.push('FLOCK_HOUSE_CAPACITY');
    }
  }
  if (action === 'post' && row.balance_version !== null && row.balance_version !== row.payload.expectedVersion
    && !['HISTORY_AUTH','CLEAN_START','CLEAN_ACCEPT'].includes(row.kind)) blockers.push('FLOCK_STALE_BALANCE');
  if (action === 'post' && row.balance_quantity !== null) {
    if (['MORTALITY','CULL'].includes(row.kind) && typeof row.payload.quantity === 'number' && row.payload.quantity > row.balance_quantity) {
      blockers.push('FLOCK_LOSS_EXCEEDS_BALANCE');
    }
    if (row.kind === 'CLOSE' && row.balance_quantity !== 0) blockers.push('FLOCK_CLOSE_NONZERO_BALANCE');
  }
  return [...new Set(blockers)];
}

const actionJoins = `
  LEFT JOIN brd_flock_balances balance ON balance.flock_no=d.flock_no
  LEFT JOIN (${scopedHouses}) source_house ON source_house.house_code=d.house_code
  LEFT JOIN (${scopedHouses}) target_house ON target_house.house_code=CASE WHEN d.kind='ADMIT' THEN d.house_code ELSE d.payload->>'targetHouseCode' END
  LEFT JOIN brd_flock_house_states target_state ON target_state.house_code=target_house.house_code
`;

const actionColumns = `(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Singapore')::date::text AS today,
  source_house.status='ACTIVE' AND source_house.farm_status='ACTIVE' AS active_source,
  target_house.status='ACTIVE' AND target_house.farm_status='ACTIVE' AS active_target,
  target_house.capacity AS target_base_capacity,target_house.max_capacity AS target_max_capacity,target_state.state AS target_state,
  balance.house_code AS balance_house,balance.farm_code AS balance_farm,balance.company_code AS balance_company,balance.site_code AS balance_site,balance.quantity AS balance_quantity,balance.version AS balance_version,balance.closed_on::text AS balance_closed_on`;

type RawActionFacts = Omit<ActionFacts, 'target_capacity'> & { target_base_capacity: number | null; target_max_capacity: number | null };
function withTargetCapacity<Row extends RawActionFacts>({target_base_capacity, target_max_capacity, ...row}: Row) {
  return {...row, target_capacity: resolveHouseCapacity({capacity: target_base_capacity, max_capacity: target_max_capacity})};
}

function pendingAction(status: string) {
  return pendingActions.find(action => FLOCK_PENDING_ACTIONS[action] === status) ?? null;
}

function applyDocumentFilters(page: FlockPage, filters: ReturnType<typeof documentFilters>) {
  page.match('d.id', filters.id);
  page.match('d.company_code', filters.companyCode);
  page.match('d.farm_code', filters.farmCode);
  page.match('d.site_code', filters.siteCode);
  page.match('d.flock_no', filters.flockNo);
  page.match('d.house_code', filters.sourceHouseCode);
  page.match("d.payload->>'targetHouseCode'", filters.targetHouseCode);
  page.match("d.payload->>'customerCode'", filters.customerCode);
  page.oneOf('d.kind', filters.kinds);
  page.oneOf('d.status', filters.statuses);
  page.match('d.business_date', filters.date);
  if (filters.dateFrom) page.where(`d.business_date>=${page.param(filters.dateFrom)}`);
  if (filters.dateTo) page.where(`d.business_date<=${page.param(filters.dateTo)}`);
  if (filters.review) {
    page.match('d.house_code', filters.houseCode);
    page.where("d.kind IN ('REPORT_CORRECTION','CLOSE') AND d.status IN ('SUBMITTED','APPROVED')");
  } else if (filters.houseCode) {
    const house = page.param(filters.houseCode);
    page.where(`(d.house_code=${house} OR d.payload->>'targetHouseCode'=${house})`);
  }
}

export async function searchFlockDocuments(db: EntityManager, scope: OrgScope, input: FlockSearchInput, inboxActor?: FlockActor) {
  const filters = documentFilters(input);
  const actionFilter = value(input, 'action');
  const mine = value(input, 'mine');
  if ((!inboxActor && (actionFilter || mine)) || (inboxActor && filters.review)
    || (actionFilter && !pendingActions.includes(actionFilter as PendingFlockAction))
    || (mine && !['true', 'false'].includes(mine))) throw new BadRequestException('待办筛选无效');

  const page = new FlockPage(inboxActor ? 'inbox' : 'documents',
    {...filters, actionFilter, mine, actor: inboxActor?.id}, input, timestampPattern, uuidPattern);
  page.where(scopeWhere(scope, page.params, 'd.'));
  applyDocumentFilters(page, filters);

  let inboxColumns = '';
  let inboxJoins = '';
  if (inboxActor) {
    const allowedKinds = FLOCK_DOCUMENT_KINDS.filter(kind => hasFlockSpecialPermission(inboxActor, kind));
    const actions = pendingActions.filter(action => (!actionFilter || actionFilter === action) && hasFlockActionPermission(inboxActor, action));
    if (!actions.length || !allowedKinds.length) return {items: [], nextCursor: null};
    page.oneOf('d.kind', allowedKinds);
    const { source, target, current, admissionOrigin } = requiredHouseChecks(scope, page);
    page.where(source());
    page.where(target());
    const actor = actions.includes('approve') || mine === 'true' ? page.param(inboxActor.id) : undefined;
    const eligibility = actions.map(action => {
      const status = `d.status='${FLOCK_PENDING_ACTIONS[action]}'`;
      if (action === 'approve') return `(${status} AND d.created_by<>${actor})`;
      if (action === 'post') return `(${status} AND ${current()} AND ${admissionOrigin()})`;
      return status;
    });
    page.where('(' + eligibility.join(' OR ') + ')');
    if (mine === 'true') page.where(`d.created_by=${actor}`);
    inboxColumns = `,${actionColumns}, d.payload->'expectedVersion' AS expected_version`;
    inboxJoins = actionJoins;
  }
  const visibleTransferTarget = scopeWhere(scope, page.params, 'transfer_house.');
  const rows = await db.query(`SELECT d.id,d.id AS search_id,
    to_char(d.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS search_time,
    d.kind,d.status,d.version,d.created_by,d.approved_by,d.posted_by,d.created_at,d.posted_at,d.business_date::text AS business_date,
    d.company_code,d.farm_code,d.site_code,d.house_code,d.flock_no,${summaryPayload} AS payload,
    ${breedConfirmationRequired} AS breed_confirmation_required,
    CASE WHEN d.kind='TRANSFER' AND d.status='POSTED' THEN (
      SELECT -e.quantity_delta FROM brd_flock_events e WHERE e.document_id=d.id AND e.kind='TRANSFER_OUT' LIMIT 1
    ) END AS transferred_quantity,
    CASE WHEN d.kind='TRANSFER' AND d.status IN ('DRAFT','SUBMITTED','APPROVED') THEN (
      SELECT b.quantity FROM brd_flock_balances b WHERE b.flock_no=d.flock_no AND b.house_code=d.house_code
        AND b.company_code=d.company_code AND b.farm_code=d.farm_code AND b.site_code=d.site_code AND b.closed_on IS NULL
    ) END AS estimated_quantity,
    CASE WHEN d.kind='TRANSFER' THEN (
      SELECT jsonb_build_object('capacity',transfer_house.capacity,'max_capacity',transfer_house.max_capacity)
      FROM (${scopedHouses}) transfer_house WHERE transfer_house.house_code=d.payload->>'targetHouseCode'
        AND transfer_house.company_code=d.company_code ${visibleTransferTarget ? 'AND ' + visibleTransferTarget : ''}
    ) END AS transfer_target,
    CASE WHEN d.kind='SELL_HELD' AND d.status='POSTED' THEN (
      SELECT jsonb_build_object('amount',s.amount::text,'currency_code',s.currency_code,'finance_status',s.finance_status,
        'customer_code',s.customer_code,'quantity',s.quantity)
      FROM brd_flock_sales_settlements s WHERE s.document_id=d.id AND s.company_code=d.company_code
    ) END AS settlement ${inboxColumns}
    FROM brd_flock_documents d ${inboxJoins} ${page.sql('d.created_at', 'd.id', 'timestamptz', 'text')}`, page.params) as (SearchRow & RawActionFacts & {
      expected_version?: number; transfer_target: Parameters<typeof resolveHouseCapacity>[0] | null;
    })[];
  return page.result(rows, ({search_id, search_time, expected_version, transfer_target, ...row}) => {
    const targetCapacity = transfer_target ? resolveHouseCapacity(transfer_target) : null;
    if (!inboxActor) return {...row,target_capacity:targetCapacity};
    const facts = withTargetCapacity({...row, payload: {...row.payload, expectedVersion: expected_version}});
    const {today, active_source, active_target, target_state, balance_house, balance_farm, balance_company, balance_site,
      balance_quantity, balance_version, balance_closed_on, target_capacity, ...item} = facts;
    const nextAction = pendingAction(row.status);
    return {...item, payload: row.payload, nextAction, target_capacity:targetCapacity,
      blockers: nextAction ? rowBlockers(facts, nextAction) : []};
  });
}

export async function readFlockActionEligibility(db: EntityManager, id: string, scope: OrgScope, actor: FlockActor) {
  const page = new FlockPage('detail', {id}, {}, timestampPattern, uuidPattern);
  const {source, target, current, admissionOrigin} = requiredHouseChecks(scope, page);
  const [raw] = await db.query(`SELECT d.id,d.kind,d.status,d.business_date::text,d.created_by,d.house_code,d.flock_no,d.company_code,d.farm_code,d.site_code,d.payload,
    ${source()} AS source_matches,${target()} AS target_in_scope,${current()} AS current_in_scope,${admissionOrigin()} AS origin_in_scope,
    ${breedConfirmationRequired} AS breed_confirmation_required,${actionColumns}
    FROM brd_flock_documents d ${actionJoins} WHERE d.id=${page.param(id)}`, page.params) as (RawActionFacts & {source_matches: boolean; target_in_scope: boolean; current_in_scope: boolean; origin_in_scope: boolean})[];
  if (!raw) return {allowedActions: [], nextAction: null, blockers: []};
  const row = withTargetCapacity(raw);
  const nextAction = pendingAction(row.status);
  const allowedActions: string[] = [];
  if (nextAction && row.source_matches && row.target_in_scope && hasFlockSpecialPermission(actor, row.kind)) {
    if (hasFlockActionPermission(actor, nextAction) &&
      (nextAction !== 'approve' || row.created_by !== actor.id) &&
      (nextAction !== 'post' || row.current_in_scope && row.origin_in_scope)) allowedActions.push(nextAction);
    if (hasFlockActionPermission(actor, 'cancel') &&
      (row.status !== 'APPROVED' || hasFlockActionPermission(actor, 'approve'))) allowedActions.push('cancel');
  }
  const blockers: string[] = [];
  if (nextAction && hasFlockActionPermission(actor, nextAction) && hasFlockSpecialPermission(actor, row.kind)) {
    if (!row.source_matches) blockers.push('FLOCK_OWNERSHIP_CHANGED');
    else if (!row.target_in_scope || nextAction === 'post' && (!row.current_in_scope || !row.origin_in_scope)) blockers.push('FLOCK_REQUIRED_HOUSE_SCOPE');
    else if (nextAction === 'approve' && actor.id === row.created_by) blockers.push('FLOCK_SELF_APPROVAL');
    else {
      blockers.push(...rowBlockers(row, nextAction).filter(code => code !== 'FLOCK_HOUSE_ENTRY_NOT_READY'));
      if (!blockers.includes('FLOCK_OWNERSHIP_CHANGED')) blockers.push(...await detailedBlockers(db, row, nextAction, scope));
    }
  }
  const reversal = row.status === 'POSTED' && ['MORTALITY','CULL','ADJUST'].includes(row.kind)
    ? await readReversalFacts(db, id) : null;
  return {allowedActions, nextAction, blockers: [...new Set(blockers)], reversal,
    target_capacity: raw.kind === 'TRANSFER' && row.source_matches && row.target_in_scope ? row.target_capacity : null,
    estimated_quantity: raw.kind === 'TRANSFER' && nextAction && row.source_matches
      && balanceMatchesSource(row) && !row.balance_closed_on ? row.balance_quantity : null};
}

function blockerCode(error: unknown, fallback: string) {
  if (!(error instanceof HttpException)) throw error;
  const response = error.getResponse();
  return typeof response === 'object' && 'code' in response && typeof response.code === 'string' ? response.code : fallback;
}

async function checkedBlocker(check: () => Promise<unknown>, fallback: string) {
  try {
    await check();
    return [];
  } catch (error) {
    return [blockerCode(error, fallback)];
  }
}

async function readReversalFacts(db: EntityManager, id: string) {
  const events = await db.query(`SELECT e.quantity_delta,
    EXISTS(SELECT 1 FROM brd_flock_events reversed WHERE reversed.reversal_of=e.id) AS already_reversed,
    EXISTS(SELECT 1 FROM brd_flock_occupancies o JOIN brd_flock_documents d
      ON d.id=o.closed_document_id AND d.status='POSTED' AND d.kind='TRANSFER'
      WHERE o.id=e.occupancy_id AND o.flock_no=e.flock_no AND o.house_code=e.house_code) AS reclassify_without_changing_quantity
    FROM brd_flock_events e WHERE e.document_id=$1 LIMIT 2`, [id]);
  return events.length === 1 ? events[0] : null;
}

async function detailedBlockers(db: EntityManager, row: ActionFacts, action: PendingFlockAction, scope: OrgScope) {
  const blockers: string[] = [];
  const {kind, payload, business_date: day, house_code: house, flock_no: flock} = row;
  if (kind === 'ADMIT' || kind === 'TRANSFER') {
    const target = kind === 'TRANSFER' ? payload.targetHouseCode : house;
    if (typeof target !== 'string') return ['FLOCK_TRANSFER_TARGET_REQUIRED'];
    const expected = kind === 'ADMIT' && typeof payload.expectedHouseVersion === 'number' ? payload.expectedHouseVersion : undefined;
    blockers.push(...await checkedBlocker(() => assertHouseReadyForEntry(db, target, day, expected), 'FLOCK_HOUSE_ENTRY_NOT_READY'));
    if (kind === 'TRANSFER') {
      blockers.push(...await checkedBlocker(() => assertFlockTransferSource(db, flock, house, day), 'FLOCK_TRANSFER_SOURCE_REVIEW'));
      const [reports] = await db.query('SELECT 1 FROM brd_daily_logs WHERE house_code=ANY($1) AND log_date>=$2 LIMIT 1', [[house,target],day]);
      if (reports) blockers.push('FLOCK_TRANSFER_RECORDED_PRODUCTION');
    }
  }
  if (action === 'approve' || action === 'post') blockers.push(...await checkedBlocker(
    () => assertFlockEvidence(db, {evidence:payload.evidence}, row, row.created_by), 'FLOCK_EVIDENCE_UNAVAILABLE',
  ));
  if (action !== 'post') return blockers;
  if (kind === 'CLOSE' && row.balance_quantity === 0 && !row.balance_closed_on && row.balance_house === house) {
    const [occupancy] = await db.query(`SELECT id FROM brd_flock_occupancies WHERE flock_no=$1 AND house_code=$2 AND began_on<=$3
      AND (ended_on IS NULL OR ended_on>$3) ORDER BY began_on DESC,id DESC LIMIT 1`, [flock,house,day]);
    const production = payload.finalProductionStatus;
    if (!occupancy) blockers.push('FLOCK_OCCUPANCY_REQUIRED');
    else if (production !== 'REPORTED' && production !== 'CONFIRMED_ZERO') blockers.push('FLOCK_CLOSE_REVIEW_REQUIRED');
    else blockers.push(...await checkedBlocker(
      () => assertFlockCloseReadiness(db, {...row, payload: {businessDate: day, finalProductionStatus: production}}, occupancy.id, scope),
      'FLOCK_CLOSE_REVIEW_REQUIRED',
    ));
  }
  if (kind === 'SELL_HELD') {
    const [held] = await db.query(`SELECT version,quantity FROM brd_flock_held_balances
      WHERE id=$1 AND flock_no=$2 AND company_code=$3 AND house_code=$4`, [payload.heldId,flock,row.company_code,house]);
    if (!held || held.version !== payload.expectedHeldVersion) blockers.push('FLOCK_STALE_HELD');
    else if (typeof payload.quantity === 'number' && payload.quantity > held.quantity) blockers.push('FLOCK_HELD_EXCEEDS_BALANCE');
  }
  if (kind === 'REPORT_CORRECTION') {
    if (payload.dailyLogId) {
      const [report] = await db.query(`SELECT ${flockReportSnapshotColumns('d')} FROM brd_daily_logs d
        WHERE d.id=$1 AND d.flock_no=$2 AND d.house_code=$3 AND d.log_date=$4`, [payload.dailyLogId,flock,house,day]);
      if (!report || reportHash(report) !== payload.expectedReportHash) blockers.push('FLOCK_REPORT_SNAPSHOT_CHANGED');
    } else {
      const [existing] = await db.query('SELECT 1 FROM brd_daily_logs WHERE house_code=$1 AND log_date=$2 LIMIT 1', [house,day]);
      if (existing) blockers.push('FLOCK_REPORT_DAY_ALREADY_RECORDED');
    }
  }
  if (kind === 'REVERSE' && typeof payload.originalDocumentId === 'string') {
    const [original] = await db.query(`SELECT id FROM brd_flock_documents WHERE id=$1 AND status='POSTED'
      AND kind IN ('MORTALITY','CULL','ADJUST') AND house_code=$2 AND flock_no=$3 AND company_code=$4`,
      [payload.originalDocumentId,house,flock,row.company_code]);
    const event = original ? await readReversalFacts(db, original.id) : null;
    if (!event || event.already_reversed) blockers.push('FLOCK_REVERSAL_SOURCE_UNAVAILABLE');
    else {
      const replacement = Number(payload.replacementQuantity ?? 0) * (payload.replacementKind === 'ADJUST' ? 1 : -1);
      if (event.reclassify_without_changing_quantity && replacement !== Number(event.quantity_delta)) blockers.push('FLOCK_TRANSFER_CORRECTION_HOLD');
    }
  }
  return blockers;
}

export async function readFlockClosePreview(db: EntityManager, scope: OrgScope, id: string, date: unknown, production: unknown) {
  const businessDate = flockBusinessDate(date);
  const finalProductionStatus = production ?? 'REPORTED';
  if (finalProductionStatus !== 'REPORTED' && finalProductionStatus !== 'CONFIRMED_ZERO') {
    throw new BadRequestException('最后产蛋确认方式无效');
  }
  const params: unknown[] = [id];
  const originalScope = scopeWhere(scope, params, 'o.');
  const currentScope = scopeWhere(scope, params, 'h.');
  const [occupancy] = await db.query(`SELECT o.id,o.flock_no,o.house_code,o.company_code,
    o.began_on::text,o.ended_on::text,b.flock_no AS current_flock,b.quantity,b.closed_on::text
    FROM brd_flock_occupancies o JOIN (${scopedHouses}) h ON h.house_code=o.house_code
    LEFT JOIN brd_flock_balances b ON b.flock_no=o.flock_no AND b.house_code=o.house_code
      AND b.company_code=o.company_code AND b.farm_code=o.farm_code AND b.site_code=o.site_code
    WHERE o.id=$1 AND o.company_code=h.company_code AND o.farm_code=h.farm_code AND o.site_code=h.site_code
      ${originalScope ? 'AND ' + originalScope : ''} ${currentScope ? 'AND ' + currentScope : ''}`, params);
  if (!occupancy) throw new NotFoundException('占栏记录不存在或不可见');
  if (!occupancy.current_flock) {
    return {blockers:['FLOCK_OWNERSHIP_CHANGED']};
  }
  if (occupancy.closed_on) return {blockers:['FLOCK_ALREADY_CLOSED']};
  if (businessDate < occupancy.began_on || occupancy.ended_on && businessDate >= occupancy.ended_on) {
    return {blockers:['FLOCK_OCCUPANCY_REQUIRED']};
  }
  if (occupancy.quantity !== 0) return {blockers:['FLOCK_CLOSE_NONZERO_BALANCE']};
  const blockers = await checkedBlocker(() => assertFlockCloseReadiness(db, {
    id:'', flock_no:occupancy.flock_no, house_code:occupancy.house_code, company_code:occupancy.company_code,
    payload:{businessDate,finalProductionStatus},
  }, id, scope), 'FLOCK_CLOSE_REVIEW_REQUIRED');
  return {blockers};
}

export async function readFlockDeliveryBlockers(db: EntityManager, scope: OrgScope, id: string, date: unknown) {
  const day = flockBusinessDate(date);
  const params: unknown[] = [id];
  const originalScope = scopeWhere(scope, params, 'h.');
  const currentScope = scopeWhere(scope, params, 'c.');
  const [held] = await db.query(`SELECT he.flock_no,EXISTS(SELECT 1 FROM brd_flock_balances b
    JOIN (${scopedHouses}) c ON c.house_code=b.house_code
    WHERE b.flock_no=he.flock_no AND b.company_code=he.company_code AND c.company_code=he.company_code
      AND b.farm_code=c.farm_code AND b.site_code=c.site_code
      ${currentScope ? 'AND ' + currentScope : ''}) AS current_in_scope
    FROM brd_flock_held_balances he JOIN (${scopedHouses}) h ON h.house_code=he.house_code
    WHERE he.id=$1 AND he.company_code=h.company_code AND he.farm_code=h.farm_code ${originalScope ? 'AND ' + originalScope : ''}`, params);
  if (!held) throw new NotFoundException('待售批次不存在或不可见');
  if (!held.current_in_scope) return {blocked:true,reason:'FLOCK_REQUIRED_HOUSE_SCOPE'};
  const [reason] = await checkedBlocker(() => assertNoHealthPending(db, held.flock_no, day, true), 'FLOCK_WITHDRAWAL_HOLD');
  return {blocked:Boolean(reason),reason:reason??null};
}

export async function searchFlockOccupancies(db: EntityManager, scope: OrgScope, input: FlockSearchInput) {
  const filters = {id: uuid(input, 'id'), day: day(input, 'date'), flockNo: value(input, 'flockNo'), house: value(input, 'houseCode')};
  const page = new FlockPage('occupancies', filters, input, datePattern, uuidPattern);
  page.where(scopeWhere(scope, page.params, 'o.'));
  page.match('o.id', filters.id);
  page.match('o.house_code', filters.house);
  page.match('o.flock_no', filters.flockNo);
  if (filters.day) {
    const on = page.param(filters.day);
    page.where(`o.began_on<=${on} AND (o.ended_on IS NULL OR o.ended_on>${on})`);
  }
  const rows = await db.query(`SELECT o.id AS occupancy_id,o.flock_no,o.house_code,o.began_on::text AS began_on,
    o.ended_on::text AS ended_on,o.began_on::text AS search_time,o.id AS search_id
    FROM brd_flock_occupancies o ${page.sql('o.began_on', 'o.id', 'date', 'text')}`, page.params) as SearchRow[];
  return page.result(rows, ({search_time, search_id, ...row}) => row);
}

export async function searchFlockReports(db: EntityManager, scope: OrgScope, input: FlockSearchInput) {
  const filters = {id: reportId(input, 'id'), day: day(input, 'date'), flockNo: value(input, 'flockNo'),
    house: value(input, 'houseCode'), shift: value(input, 'shift'), occupancyId: uuid(input, 'occupancyId')};
  const page = new FlockPage('reports', filters, input, datePattern, numericPattern);
  page.where(scopeWhere(scope, page.params, 'o.'));
  page.match('d.id', filters.id);
  page.match('d.house_code', filters.house);
  page.match('d.flock_no', filters.flockNo);
  page.match('d.log_date', filters.day);
  page.match('d.shift', filters.shift);
  page.match('o.id', filters.occupancyId);
  const rows = await db.query(`SELECT ${flockReportSnapshotColumns('d')},d.log_date::text AS search_time,d.id::text AS search_id
    FROM brd_daily_logs d JOIN brd_flock_occupancies o ON o.id=d.occupancy_id AND o.flock_no=d.flock_no AND o.house_code=d.house_code
      AND o.began_on<=d.log_date AND (o.ended_on IS NULL OR o.ended_on>d.log_date)
    ${page.sql('d.log_date', 'd.id', 'date', 'integer')}`, page.params) as SearchRow[];
  const result = page.result(rows, ({search_time, search_id, ...row}) => ({...row, report_hash: reportHash(row)}));
  if (!filters.house || !filters.day) return result;
  const params: unknown[] = [filters.house, filters.day];
  const scoped = scopeWhere(scope, params, 'h.');
  const occupancyScope = scopeWhere(scope, params, 'o.');
  const [house] = await db.query(`SELECT EXISTS(SELECT 1 FROM brd_daily_logs WHERE house_code=$1 AND log_date=$2) AS has_reports
    FROM (${scopedHouses}) h WHERE h.house_code=$1 ${scoped ? 'AND ' + scoped : ''}
      AND EXISTS(SELECT 1 FROM brd_flock_occupancies o WHERE o.house_code=h.house_code AND o.began_on<=$2
        AND (o.ended_on IS NULL OR o.ended_on>$2) ${occupancyScope ? 'AND ' + occupancyScope : ''})`, params);
  return {...result, ...(house ? {hasHouseDayReports: Boolean(house.has_reports)} : {})};
}
