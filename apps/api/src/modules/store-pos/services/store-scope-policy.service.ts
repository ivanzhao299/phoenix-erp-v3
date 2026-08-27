import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { DataSource } from 'typeorm';

export type StoreWarehousePurpose = 'SALES' | 'RETURNS';
export interface StoreContext {
  storeId: string;
  storeCode: string;
  storeName: string;
  companyCode: string;
  role: string;
  roles: string[];
  warehouseCodes: string[];
  timezone: string;
  businessDayCutoff: string;
}

@Injectable()
export class StoreScopePolicy {
  private readonly logger = new Logger(StoreScopePolicy.name);
  private static shadowMatch = 0;
  private static shadowMismatch = 0;

  constructor(@InjectDataSource() private readonly ds: DataSource, private readonly cls: ClsService) {}

  private get user(): any { try { return this.cls.get('user') ?? {}; } catch { return {}; } }
  private get scope(): any { try { return this.cls.get('dataScope') ?? null; } catch { return null; } }
  private get membershipEnabled(): boolean {
    const mode = process.env.STORE_SCOPE_MODE ?? 'membership_shadow';
    return mode === 'membership_shadow';
  }

  async listMembershipStores(): Promise<Array<Omit<StoreContext, 'warehouseCodes'> & { hasSalesWarehouse: boolean }>> {
    const userId = this.user?.userId ?? this.user?.id;
    if (!userId || !this.membershipEnabled) return [];
    const rows = await this.ds.query<any[]>(`
      SELECT s.id::text AS "storeId", s.store_code AS "storeCode", s.store_name AS "storeName",
             s.company_code AS "companyCode", s.timezone, s.business_day_cutoff::text AS "businessDayCutoff",
             m.role, EXISTS (
               SELECT 1 FROM store_warehouse_bindings b JOIN wms_warehouses w ON w.warehouse_code=b.warehouse_code
               WHERE b.store_id=s.id AND b.purpose='SALES' AND b.status='ACTIVE'
                 AND (b.effective_from IS NULL OR b.effective_from<=NOW()) AND (b.effective_to IS NULL OR b.effective_to>=NOW())
                 AND w.status='ACTIVE' AND w.domain='OPERATIONAL'
             ) AS "hasSalesWarehouse"
        FROM store_memberships m JOIN store_master s ON s.id=m.store_id
       WHERE m.user_id=$1 AND m.status='ACTIVE' AND s.status='ACTIVE'
         AND (m.effective_from IS NULL OR m.effective_from<=NOW()) AND (m.effective_to IS NULL OR m.effective_to>=NOW())
       ORDER BY s.store_code`, [userId]);
    const scoped = rows.filter(r => this.scope?.isGlobal || this.scope?.allowedCompanyCodes?.includes(r.companyCode));
    const rolePriority = ['ADMIN', 'STORE_MANAGER', 'CASHIER'];
    const byStore = new Map<string, any>();
    for (const row of scoped) {
      const key = row.storeId || row.storeCode;
      const existing = byStore.get(key);
      if (!existing) {
        byStore.set(key, { ...row, roles: [row.role] });
      } else if (!existing.roles.includes(row.role)) {
        existing.roles.push(row.role);
      }
    }
    return [...byStore.values()].map(store => {
      store.roles.sort((a: string, b: string) => a.localeCompare(b));
      store.role = rolePriority.find(role => store.roles.includes(role)) ?? store.roles[0];
      return store;
    });
  }

  async resolve(storeCode: string | undefined, purpose: StoreWarehousePurpose = 'SALES'): Promise<StoreContext> {
    if (!storeCode) throw new ForbiddenException('POS 请求必须显式指定门店');
    if (!this.membershipEnabled) throw new ForbiddenException('门店授权处于 fail-closed 模式');
    const userId = this.user?.userId ?? this.user?.id;
    const scope = this.scope;
    if (!userId || !scope) throw new ForbiddenException('缺少门店或数据范围上下文');
    const stores = await this.listMembershipStores();
    const store = stores.find(s => s.storeCode === storeCode);
    if (!store) throw new ForbiddenException('无此门店的有效 membership');

    const bindings = await this.ds.query<Array<{ warehouseCode: string }>>(`
      SELECT b.warehouse_code AS "warehouseCode"
        FROM store_warehouse_bindings b JOIN wms_warehouses w ON w.warehouse_code=b.warehouse_code
       WHERE b.store_id=$1 AND b.purpose=$2 AND b.status='ACTIVE'
         AND (b.effective_from IS NULL OR b.effective_from<=NOW()) AND (b.effective_to IS NULL OR b.effective_to>=NOW())
         AND w.status='ACTIVE' AND w.domain='OPERATIONAL'
       ORDER BY b.priority,b.id`, [store.storeId, purpose]);
    const allowed = new Set<string>(scope.isGlobal ? bindings.map(b => b.warehouseCode) : (scope.allowedWarehouseCodes ?? []));
    const warehouseCodes = bindings.map(b => b.warehouseCode).filter(code => allowed.has(code));
    if (!warehouseCodes.length) throw new ForbiddenException(`请先配置门店仓绑定：无有效 ${purpose} 仓权限交集`);
    this.shadowCompare(storeCode, stores.map(s => s.storeCode));
    return { ...store, warehouseCodes };
  }

  async assertSaleScoped(id: number, purpose: StoreWarehousePurpose = 'SALES'): Promise<{ sale: any; context: StoreContext }> {
    const userId = this.user?.userId ?? this.user?.id;
    const [identity] = await this.ds.query<any[]>(`
      SELECT s.store_code FROM sal_store_sales s
      JOIN store_master sm ON sm.store_code=s.store_code
      JOIN store_memberships m ON m.store_id=sm.id AND m.user_id=$2 AND m.status='ACTIVE'
       AND (m.effective_from IS NULL OR m.effective_from<=NOW()) AND (m.effective_to IS NULL OR m.effective_to>=NOW())
      WHERE s.id=$1`, [id, userId]);
    if (!identity) throw new ForbiddenException('销售单不存在或不在授权范围');
    const context = await this.resolve(identity.store_code, purpose);
    const [sale] = await this.ds.query<any[]>(`SELECT * FROM sal_store_sales WHERE id=$1 AND store_code=$2 AND company_code=$3`, [id, context.storeCode, context.companyCode]);
    if (!sale) throw new ForbiddenException('销售单不存在或不在授权范围');
    return { sale, context };
  }

  private shadowCompare(requested: string, membershipCodes: string[]) {
    const legacy = String(this.user?.storeCode ?? this.user?.store_code ?? '').split(',').map((v: string) => v.trim()).filter(Boolean);
    const matches = legacy.includes(requested);
    if (matches) StoreScopePolicy.shadowMatch++;
    else {
      StoreScopePolicy.shadowMismatch++;
      this.logger.warn(JSON.stringify({ event: 'store_scope_legacy_mismatch', requestedStoreCode: requested, membershipCount: membershipCodes.length }));
    }
  }

  static metrics() { return { shadowMatch: this.shadowMatch, shadowMismatch: this.shadowMismatch }; }
}

@Injectable()
export class StoreContextResolver extends StoreScopePolicy {}
