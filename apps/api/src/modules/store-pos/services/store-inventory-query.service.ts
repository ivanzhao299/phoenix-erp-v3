import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { StoreScopePolicy } from './store-scope-policy.service';

const INVENTORY_STATUSES = ['AVAILABLE', 'RESERVED', 'QUARANTINE', 'DAMAGED', 'FROZEN'] as const;
type InventoryStatus = typeof INVENTORY_STATUSES[number];

export interface StoreInventoryQuery {
  storeCode: string;
  status?: InventoryStatus;
  warehouseCode?: string;
  zoneCode?: string;
  locationCode?: string;
  sku?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class StoreInventoryQueryService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly storeScope: StoreScopePolicy,
  ) {}

  async query(input: StoreInventoryQuery) {
    if (input.status && !INVENTORY_STATUSES.includes(input.status)) {
      throw new BadRequestException('无效库存状态');
    }
    const context = await this.storeScope.resolveInventory(input.storeCode);
    if (input.warehouseCode && !context.warehouseCodes.includes(input.warehouseCode)) {
      throw new BadRequestException('仓库不在当前门店授权范围');
    }
    const page = Math.max(1, Number(input.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(input.limit) || 50));
    const params: any[] = [context.warehouseCodes];
    const where = [`b.warehouse_code=ANY($1::varchar[])`, `COALESCE(b.qty,0)>0`];
    const [summary] = await this.ds.query<any[]>(`
      SELECT COALESCE(SUM(b.qty),0)::numeric AS "onHand",
             COALESCE(SUM(CASE WHEN b.status='AVAILABLE' THEN b.qty_available ELSE 0 END),0)::numeric AS available,
             COALESCE(SUM(CASE WHEN b.status='QUARANTINE' THEN b.qty ELSE 0 END),0)::numeric AS quarantine,
             COALESCE(SUM(CASE WHEN b.status='RESERVED' THEN b.qty ELSE 0 END),0)::numeric AS reserved
        FROM inv_batches b
       WHERE b.warehouse_code=ANY($1::varchar[]) AND COALESCE(b.qty,0)>0`, [context.warehouseCodes]);
    const add = (sql: string, value: unknown) => { params.push(value); where.push(sql.replace('?', `$${params.length}`)); };
    if (input.status) add('b.status=?', input.status);
    if (input.warehouseCode) add('b.warehouse_code=?', input.warehouseCode);
    if (input.zoneCode) add('z.zone_code=?', input.zoneCode);
    if (input.locationCode) add('b.location_code=?', input.locationCode);
    if (input.sku) {
      params.push(`%${input.sku.trim()}%`);
      where.push(`(b.sku_code ILIKE $${params.length} OR b.product_code ILIKE $${params.length} OR b.batch_no ILIKE $${params.length}
        OR sku.sku_name ILIKE $${params.length} OR sku.sku_name_en ILIKE $${params.length} OR sku.sku_name_lo ILIKE $${params.length})`);
    }
    const whereSql = where.join(' AND ');
    const [{ total }] = await this.ds.query<Array<{ total: string }>>(`
      SELECT COUNT(*)::text AS total FROM inv_batches b
        LEFT JOIN product_skus sku ON sku.sku_code=b.sku_code
        LEFT JOIN wms_locations l ON l.warehouse_code=b.warehouse_code AND l.location_code=b.location_code
        LEFT JOIN wms_zones z ON z.warehouse_code=l.warehouse_code AND z.zone_code=l.zone_code
       WHERE ${whereSql}`, params);
    const rowParams = [...params, limit, (page - 1) * limit];
    const rows = await this.ds.query<any[]>(`
      SELECT b.batch_no,b.sku_code,b.product_code,b.quality_grade,b.packaging_spec,
             b.qty,b.qty_available,b.status,b.warehouse_code,b.location_code,
             sku.sku_name,sku.sku_name_en,sku.sku_name_lo,
             z.zone_code,z.zone_name,z.zone_type,l.location_name,b.source_type,b.source_no,b.created_at,
             w.warehouse_name,w.warehouse_name_zh,w.warehouse_name_en,w.warehouse_name_lo,
             ledger.id AS ledger_id,ledger.change_type AS ledger_change_type,
             ledger.qty_change AS ledger_qty_change,ledger.created_at AS ledger_created_at
        FROM inv_batches b
        LEFT JOIN product_skus sku ON sku.sku_code=b.sku_code
        LEFT JOIN wms_warehouses w ON w.warehouse_code=b.warehouse_code
        LEFT JOIN wms_locations l ON l.warehouse_code=b.warehouse_code AND l.location_code=b.location_code
        LEFT JOIN wms_zones z ON z.warehouse_code=l.warehouse_code AND z.zone_code=l.zone_code
        LEFT JOIN LATERAL (
          SELECT il.id,il.change_type,il.qty_change,il.created_at
            FROM inv_ledger il
           WHERE il.batch_no=b.batch_no AND il.warehouse_code=b.warehouse_code
           ORDER BY il.created_at DESC,il.id DESC LIMIT 1
        ) ledger ON TRUE
       WHERE ${whereSql}
       ORDER BY CASE b.status WHEN 'QUARANTINE' THEN 0 WHEN 'AVAILABLE' THEN 1 ELSE 2 END,b.created_at DESC,b.batch_no
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, rowParams);
    return {
      store: { code: context.storeCode, name: context.storeName, companyCode: context.companyCode },
      warehouseCodes: context.warehouseCodes,
      summary: {
        onHand: Number(summary?.onHand ?? 0), available: Number(summary?.available ?? 0),
        quarantine: Number(summary?.quarantine ?? 0), reserved: Number(summary?.reserved ?? 0),
      },
      rows,
      pagination: { page, limit, total: Number(total ?? 0) },
    };
  }
}
