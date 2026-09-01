import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { DataSource } from 'typeorm';
import { hasPerm } from '../../../auth/permissions.util';
import { StoreScopePolicy } from './store-scope-policy.service';
import { DataScopeService } from '../../org/services/data-scope.service';

export type SalesActivitySource = 'ALL' | 'ORDER' | 'POS';
export type AvailableSalesActivitySource = Exclude<SalesActivitySource, 'ALL'>;

export interface SalesActivityQuery {
  source?: SalesActivitySource;
  page?: number;
  limit?: number;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  companyCode?: string;
  storeCode?: string;
  customerCode?: string;
  keyword?: string;
}

export interface SalesActivityRow {
  sourceType: AvailableSalesActivitySource;
  sourceId: string;
  documentNo: string;
  companyCode: string;
  storeCode: string | null;
  customerCode: string | null;
  customerName: string | null;
  status: string;
  displayCategory: string;
  amount: number;
  currency: string;
  businessDate: string;
  occurredAt: string;
  detailHref: string;
}

const ORDER_STATUSES = new Set([
  'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ALLOCATED', 'PICKED', 'LOADED',
  'SHIPPED', 'PARTIAL_SHIPPED', 'DELIVERED', 'RECEIVED', 'RECONCILED',
  'REJECTED', 'CANCELLED',
]);
const POS_STATUSES = new Set(['OPEN', 'COMPLETED', 'VOID', 'RETURNED']);

export function resolveRequestedSources(
  requested: SalesActivitySource,
  available: AvailableSalesActivitySource[],
): AvailableSalesActivitySource[] {
  if (requested === 'ALL') return available;
  if (!available.includes(requested)) throw new ForbiddenException(`无 ${requested} 来源查看权限`);
  return [requested];
}

export function mergeSalesActivityRows(rows: SalesActivityRow[], limit: number): SalesActivityRow[] {
  return [...rows].sort((a, b) => {
    const time = new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
    if (time !== 0) return time;
    const source = a.sourceType.localeCompare(b.sourceType);
    return source !== 0 ? source : a.sourceId.localeCompare(b.sourceId);
  }).slice(0, limit);
}

@Injectable()
export class SalesActivityService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cls: ClsService,
    private readonly storeScope: StoreScopePolicy,
    private readonly dataScopeService: DataScopeService,
  ) {}

  async list(query: SalesActivityQuery) {
    const source = String(query.source ?? 'ALL').toUpperCase() as SalesActivitySource;
    if (!['ALL', 'ORDER', 'POS'].includes(source)) throw new BadRequestException('source 必须是 ALL、ORDER 或 POS');
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const fetchLimit = page * limit + 1;

    const user = this.currentUser();
    const canOrder = this.canView(user, 'MENU_SALES2_ORDER');
    const canPos = this.canView(user, 'MENU_STORE_POS');
    const visibleStoreCodes = canPos ? await this.visiblePosStoreCodes() : [];
    const availableSources: AvailableSalesActivitySource[] = [];
    if (canOrder) availableSources.push('ORDER');
    if (canPos && visibleStoreCodes.length) availableSources.push('POS');
    const requestedSources = resolveRequestedSources(source, availableSources);

    const filteredSources = this.applyFilterSemantics(requestedSources, query);
    const results = await Promise.all(filteredSources.map(item => item === 'ORDER'
      ? this.queryOrders(query, fetchLimit)
      : this.queryPos(query, visibleStoreCodes, fetchLimit)));
    const merged = mergeSalesActivityRows(results.flat(), fetchLimit);
    const offset = (page - 1) * limit;
    return {
      data: merged.slice(offset, offset + limit),
      availableSources,
      page,
      limit,
      hasMore: merged.length > offset + limit,
      sort: ['occurredAt:DESC', 'sourceType:ASC', 'sourceId:ASC'],
      confirmationTiming: { ORDER: 'ORDER_CREATED', POS: 'POS_COMPLETED_OR_CREATED' },
    };
  }

  private currentUser(): any {
    try { return this.cls.get('user') ?? {}; } catch { return {}; }
  }

  private currentScope(): any {
    try { return this.cls.get('dataScope') ?? null; } catch { return null; }
  }

  private canView(user: any, menu: string): boolean {
    const roles = Array.isArray(user?.roles) ? user.roles : [user?.role].filter(Boolean);
    return roles.includes('ROLE_ADMIN') || hasPerm(user?.permissions, menu, 'V');
  }

  private async visiblePosStoreCodes(): Promise<string[]> {
    const user = this.currentUser();
    const roles = Array.isArray(user?.roles) ? user.roles : [user?.role].filter(Boolean);
    const userId = String(user?.userId ?? user?.id ?? '');
    if (!userId) return [];
    const rawVersion = Number(user?.perms_version);
    const posScope = await this.dataScopeService.resolve(
      userId,
      roles,
      'MENU_STORE_POS',
      Number.isFinite(rawVersion) ? rawVersion : undefined,
    );
    const stores = await this.storeScope.listMembershipStores(user, posScope);
    return stores
      .filter(store => store.hasSalesWarehouse && store.hasWarehouseScopeIntersection)
      .map(store => store.storeCode);
  }

  private applyFilterSemantics(
    sources: AvailableSalesActivitySource[],
    query: SalesActivityQuery,
  ): AvailableSalesActivitySource[] {
    let supported = sources;
    if (query.storeCode) supported = supported.filter(source => source === 'POS');
    if (query.status) {
      const status = query.status.toUpperCase();
      supported = supported.filter(source => source === 'ORDER' ? ORDER_STATUSES.has(status) : POS_STATUSES.has(status));
      if (sources.length === 1 && supported.length === 0) {
        throw new BadRequestException(`状态 ${query.status} 不适用于 ${sources[0]} 来源`);
      }
    }
    return supported;
  }

  private async queryOrders(query: SalesActivityQuery, fetchLimit: number): Promise<SalesActivityRow[]> {
    const scope = this.currentScope();
    const params: any[] = [];
    const where = ['1=1'];
    if (!scope?.isGlobal) {
      const companies = scope?.allowedCompanyCodes ?? [];
      if (!companies.length) where.push('1=0');
      else { params.push(companies); where.push(`company_code=ANY($${params.length}::text[])`); }
    }
    this.addCommonFilters(where, params, query, 'created_at', 'order_no');
    params.push(fetchLimit);
    const rows = await this.ds.query<any[]>(`
      SELECT 'ORDER' AS "sourceType",id::text AS "sourceId",order_no AS "documentNo",
             company_code AS "companyCode",NULL::text AS "storeCode",customer_code AS "customerCode",
             customer_name AS "customerName",status,
             CASE WHEN status='RECEIVED' THEN 'RECEIVED_ORDER' ELSE 'ORDER_' || status END AS "displayCategory",
             total_amount::float8 AS amount,currency_code AS currency,created_at::date::text AS "businessDate",
             created_at AS "occurredAt",'/sales2/orders?orderId=' || id::text AS "detailHref"
        FROM sal_sales_orders WHERE ${where.join(' AND ')}
       ORDER BY created_at DESC,id::text ASC LIMIT $${params.length}`, params);
    return rows.map(this.normalizeRow);
  }

  private async queryPos(query: SalesActivityQuery, storeCodes: string[], fetchLimit: number): Promise<SalesActivityRow[]> {
    const params: any[] = [storeCodes];
    const where = ['store_code=ANY($1::text[])'];
    this.addCommonFilters(where, params, query, 'COALESCE(completed_at,created_at)', 'sale_no', true);
    params.push(fetchLimit);
    const rows = await this.ds.query<any[]>(`
      SELECT 'POS' AS "sourceType",id::text AS "sourceId",sale_no AS "documentNo",
             company_code AS "companyCode",store_code AS "storeCode",customer_code AS "customerCode",
             COALESCE(customer_name,'散客') AS "customerName",status,
             CASE WHEN status='COMPLETED' THEN 'COMPLETED_SALE' ELSE 'POS_' || status END AS "displayCategory",
             total_amount::float8 AS amount,COALESCE(currency_code,'CNY') AS currency,
             COALESCE(business_date,created_at::date)::text AS "businessDate",
             COALESCE(completed_at,created_at) AS "occurredAt",
             '/store-pos?saleId=' || id::text || '&storeCode=' || store_code AS "detailHref"
        FROM sal_store_sales WHERE ${where.join(' AND ')}
       ORDER BY COALESCE(completed_at,created_at) DESC,id::text ASC LIMIT $${params.length}`, params);
    return rows.map(this.normalizeRow);
  }

  private addCommonFilters(
    where: string[], params: any[], query: SalesActivityQuery,
    dateColumn: string, documentColumn: string, isPos = false,
  ) {
    const add = (value: any, sql: (n: number) => string) => { params.push(value); where.push(sql(params.length)); };
    if (query.companyCode) add(query.companyCode, n => `company_code=$${n}`);
    if (query.customerCode) add(query.customerCode, n => `customer_code=$${n}`);
    if (query.status) add(query.status.toUpperCase(), n => `status=$${n}`);
    if (query.dateFrom) add(query.dateFrom, n => `${dateColumn}>=$${n}::date`);
    if (query.dateTo) add(query.dateTo, n => `${dateColumn}<($${n}::date + INTERVAL '1 day')`);
    if (isPos && query.storeCode) add(query.storeCode, n => `store_code=$${n}`);
    if (query.keyword) {
      add(`%${query.keyword}%`, n => isPos
        ? `(${documentColumn} ILIKE $${n} OR customer_name ILIKE $${n} OR store_name ILIKE $${n})`
        : `(${documentColumn} ILIKE $${n} OR customer_name ILIKE $${n})`);
    }
  }

  private normalizeRow(row: any): SalesActivityRow {
    return {
      ...row,
      sourceId: String(row.sourceId),
      amount: Number(row.amount ?? 0),
      businessDate: String(row.businessDate),
      occurredAt: new Date(row.occurredAt).toISOString(),
    };
  }
}
