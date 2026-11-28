import { officialInventoryPredicate, officialLedgerPredicate, officialInventoryCostAggregate, officialInventoryCostKnownPredicate } from '../../wms/official-inventory';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { DataScopeContext } from '../../org/services/data-scope.service';

export interface InventoryAnalyticsResult {
  status: 'AVAILABLE' | 'UNAVAILABLE';
  turnover30Day: number | null;
  salesOutToAvailableStatus: 'AVAILABLE' | 'MIXED_UNITS' | 'NO_STOCK' | 'UNAVAILABLE';
  salesOutToAvailable30Day: number | null;
  salesOutToAvailableByUnit: Array<{ unit: string; sold30Day: number; available: number; rate: number | null }> | null;
  otherMovementsByUnit: Array<{ unit: string; transferOut: number; saleReturn: number; otherOut: number; reserved: number; released: number }> | null;
  capitalOccupation: number | null;
  costPendingBatches: number | null;
  costPendingQuantity: number | null;
  costPendingByUnit: Array<{ unit: string; quantity: number }> | null;
  byStatus: Record<string, { count: number; value: number | null; costPendingBatches: number; costPendingQuantity: number }> | null;
  aging: Array<{ bucket: string; count: number; value: number | null; costPendingBatches: number; costPendingQuantity: number }> | null;
  slowMovingCount: number | null;
  frozenValue: number | null;
  quarantineValue: number | null;
  damagedValue: number | null;
  asOf: string;
}

interface ScopeFilters {
  companyCodes: string[] | null;
  warehouseCodes: string[] | null;
}

@Injectable()
export class InventoryAnalyticsService {
  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  private scopeFilters(q: { companyCode?: string; warehouseCode?: string }, scope: DataScopeContext): ScopeFilters {
    if (!scope) throw new ForbiddenException('数据范围无法解析');
    if (scope.isGlobal) {
      return {
        companyCodes: q.companyCode ? [q.companyCode] : null,
        warehouseCodes: q.warehouseCode ? [q.warehouseCode] : null,
      };
    }

    if (!scope.allowedCompanyCodes.length || !scope.allowedWarehouseCodes.length) {
      throw new ForbiddenException('库存分析数据范围为空');
    }
    if (q.companyCode && !scope.allowedCompanyCodes.includes(q.companyCode)) {
      throw new ForbiddenException('无权查看该公司的库存分析');
    }
    if (q.warehouseCode && !scope.allowedWarehouseCodes.includes(q.warehouseCode)) {
      throw new ForbiddenException('无权查看该仓库的库存分析');
    }

    return {
      companyCodes: q.companyCode ? [q.companyCode] : scope.allowedCompanyCodes,
      warehouseCodes: q.warehouseCode ? [q.warehouseCode] : scope.allowedWarehouseCodes,
    };
  }

  async compute(q: { companyCode?: string; warehouseCode?: string; productCode?: string; skuCode?: string; unit?: string }, scope: DataScopeContext): Promise<InventoryAnalyticsResult> {
    const filters = this.scopeFilters(q, scope);
    const params = [filters.companyCodes, filters.warehouseCodes, q.unit ?? null, q.productCode ?? null, q.skuCode ?? null];
    const where = (alias: string) => `($1::text[] IS NULL OR ${alias}.company_code=ANY($1::text[]))
      AND ($2::text[] IS NULL OR ${alias}.warehouse_code=ANY($2::text[]))
      AND ($3::text IS NULL OR ${alias}.unit=$3)
      AND ($4::text IS NULL OR ${alias}.product_code=$4)
      AND ($5::text IS NULL OR ${alias}.sku_code=$5)`;

    try {
      const [distribution, legacyOut, costPendingByUnit, legacyOnHand, salesByUnit, stockByUnit, movementTotals, aging, slow] = await Promise.all([
        this.em.query(
          `SELECT COALESCE(b.status,'UNKNOWN') AS status, COUNT(*)::text AS cnt,
             ${officialInventoryCostAggregate('b')}
           FROM inv_batches b WHERE ${officialInventoryPredicate('b')} AND ${where('b')}
           GROUP BY COALESCE(b.status,'UNKNOWN')`, params),
        this.em.query(
          `SELECT COALESCE(SUM(ABS(l.qty_change)),0)::text AS qty
           FROM inv_ledger l JOIN inv_batches b ON b.batch_no=l.batch_no
           WHERE ${officialLedgerPredicate('l')} AND ${officialInventoryPredicate('b')}
             AND l.company_code=b.company_code AND l.warehouse_code=b.warehouse_code
             AND l.change_type IN ('OUTBOUND','SALES','TRANSFER')
             AND l.created_at >= NOW() - INTERVAL '30 days' AND ${where('b')}`, params),
        this.em.query(
          `SELECT COALESCE(NULLIF(btrim(b.unit),''),'UNKNOWN') AS unit,
             COALESCE(SUM(b.qty) FILTER (WHERE b.qty>0 AND NOT (${officialInventoryCostKnownPredicate('b')})),0)::text AS quantity
           FROM inv_batches b WHERE ${officialInventoryPredicate('b')} AND ${where('b')}
           GROUP BY COALESCE(NULLIF(btrim(b.unit),''),'UNKNOWN')`, params),
        this.em.query(
          `SELECT COALESCE(SUM(b.qty),0)::text AS qty FROM inv_batches b
           WHERE ${officialInventoryPredicate('b')} AND b.status='AVAILABLE' AND ${where('b')}`, params),
        this.em.query(
          `SELECT COALESCE(NULLIF(btrim(b.unit),''),'UNKNOWN') AS unit,
             COALESCE(SUM(ABS(l.qty_change)),0)::text AS qty
           FROM inv_ledger l JOIN inv_batches b ON b.batch_no=l.batch_no
           WHERE ${officialLedgerPredicate('l')} AND ${officialInventoryPredicate('b')}
             AND l.company_code=b.company_code AND l.warehouse_code=b.warehouse_code AND l.qty_change<0
             AND l.change_type IN ('FIFO_OUT','SALE_OUTBOUND')
             AND l.created_at >= NOW() - INTERVAL '30 days' AND ${where('b')}
           GROUP BY COALESCE(NULLIF(btrim(b.unit),''),'UNKNOWN')`, params),
        this.em.query(
          `SELECT COALESCE(NULLIF(btrim(b.unit),''),'UNKNOWN') AS unit,
             COALESCE(SUM(b.qty_available),0)::text AS qty
           FROM inv_batches b WHERE ${officialInventoryPredicate('b')} AND b.status='AVAILABLE' AND ${where('b')}
           GROUP BY COALESCE(NULLIF(btrim(b.unit),''),'UNKNOWN')`, params),
        this.em.query(
          `SELECT COALESCE(NULLIF(btrim(b.unit),''),'UNKNOWN') AS unit,
             COALESCE(SUM(ABS(l.qty_change)) FILTER (WHERE l.change_type IN ('TRANSFER','TRANSFER_OUT','DEFECT_TRANSFER_OUT')),0)::text AS transfer_out,
             COALESCE(SUM(ABS(l.qty_change)) FILTER (WHERE l.change_type IN ('SALE_RETURN','SALES_RETURN_INBOUND')),0)::text AS sale_return,
             COALESCE(SUM(ABS(l.qty_change)) FILTER (WHERE l.qty_change<0 AND l.change_type NOT IN
               ('FIFO_OUT','SALE_OUTBOUND','TRANSFER','TRANSFER_OUT','DEFECT_TRANSFER_OUT','SALE_RETURN','SALES_RETURN_INBOUND','RESERVED','RELEASED')),0)::text AS other_out,
             COALESCE(SUM(ABS(l.qty_change)) FILTER (WHERE l.change_type='RESERVED'),0)::text AS reserved,
             COALESCE(SUM(ABS(l.qty_change)) FILTER (WHERE l.change_type='RELEASED'),0)::text AS released
           FROM inv_ledger l JOIN inv_batches b ON b.batch_no=l.batch_no
           WHERE ${officialLedgerPredicate('l')} AND ${officialInventoryPredicate('b')}
             AND l.company_code=b.company_code AND l.warehouse_code=b.warehouse_code
             AND l.created_at >= NOW() - INTERVAL '30 days' AND ${where('b')}
           GROUP BY COALESCE(NULLIF(btrim(b.unit),''),'UNKNOWN')`, params),
        this.em.query(
          `SELECT CASE
              WHEN b.created_at > NOW() - INTERVAL '30 days' THEN '0-30'
              WHEN b.created_at > NOW() - INTERVAL '60 days' THEN '31-60'
              WHEN b.created_at > NOW() - INTERVAL '90 days' THEN '61-90'
              WHEN b.created_at > NOW() - INTERVAL '180 days' THEN '91-180'
              ELSE '180+'
            END AS bucket, COUNT(*)::text AS cnt, ${officialInventoryCostAggregate('b')}
           FROM inv_batches b WHERE ${officialInventoryPredicate('b')} AND b.status IN ('AVAILABLE','QUARANTINE','RESERVED')
             AND ${where('b')} GROUP BY 1 ORDER BY 1`, params),
        this.em.query(
          `SELECT COUNT(*)::text AS c FROM inv_batches b
           WHERE ${officialInventoryPredicate('b')} AND b.status='AVAILABLE' AND b.qty_available>0
             AND b.created_at < NOW() - INTERVAL '90 days' AND ${where('b')}
             AND NOT EXISTS (
               SELECT 1 FROM inv_ledger l WHERE l.batch_no=b.batch_no
                 AND l.company_code=b.company_code AND l.warehouse_code=b.warehouse_code AND l.qty_change<0
                 AND l.change_type IN ('FIFO_OUT','SALE_OUTBOUND')
                 AND l.created_at > NOW() - INTERVAL '30 days'
             )`, params),
      ]);

      const byStatus: InventoryAnalyticsResult['byStatus'] = {};
      for (const row of distribution) {
        byStatus![row.status] = {
          count: Number(row.cnt),
          value: row.value === null ? null : Number(row.value),
          costPendingBatches: Number(row.cost_pending_batches),
          costPendingQuantity: Number(row.cost_pending_quantity),
        };
      }

      const unitTotals = new Map<string, { sold30Day: number; available: number }>();
      for (const row of salesByUnit) unitTotals.set(row.unit, { sold30Day: Number(row.qty), available: 0 });
      for (const row of stockByUnit) {
        const values = unitTotals.get(row.unit) ?? { sold30Day: 0, available: 0 };
        values.available = Number(row.qty);
        unitTotals.set(row.unit, values);
      }
      const turnoverByUnit = [...unitTotals].map(([unit, values]) => ({
        unit,
        ...values,
        rate: values.available > 0 ? values.sold30Day / values.available : null,
      }));
      const salesOutToAvailableStatus = turnoverByUnit.length > 1 ? 'MIXED_UNITS'
        : turnoverByUnit.length === 0 || turnoverByUnit[0].available === 0 ? 'NO_STOCK' : 'AVAILABLE';
      const salesOutToAvailable = salesOutToAvailableStatus === 'AVAILABLE' ? turnoverByUnit[0] : null;
      const legacyDenominator = Number(legacyOnHand[0]?.qty ?? 0);
      const legacyTurnover = legacyDenominator > 0
        ? Math.round((Number(legacyOut[0]?.qty ?? 0) / legacyDenominator) * 100) / 100 : 0;
      const agingRows = aging.map((row: any) => ({
        bucket: row.bucket,
        count: Number(row.cnt),
        value: row.value === null ? null : Number(row.value),
        costPendingBatches: Number(row.cost_pending_batches),
        costPendingQuantity: Number(row.cost_pending_quantity),
      }));
      const pendingByUnit = costPendingByUnit.map((row: any) => ({ unit: row.unit, quantity: Number(row.quantity) }));
      const otherMovementsByUnit = movementTotals.map((row: any) => ({
        unit: row.unit,
        transferOut: Number(row.transfer_out),
        saleReturn: Number(row.sale_return),
        otherOut: Number(row.other_out),
        reserved: Number(row.reserved),
        released: Number(row.released),
      }));

      return {
        status: 'AVAILABLE',
        turnover30Day: legacyTurnover,
        salesOutToAvailableStatus,
        salesOutToAvailable30Day: salesOutToAvailable?.rate ?? null,
        salesOutToAvailableByUnit: turnoverByUnit,
        otherMovementsByUnit,
        capitalOccupation: Object.values(byStatus!).some(value => value.value === null)
          ? null : Object.values(byStatus!).reduce((sum, value) => sum + (value.value ?? 0), 0),
        costPendingBatches: Object.values(byStatus!).reduce((sum, value) => sum + value.costPendingBatches, 0),
        costPendingQuantity: Object.values(byStatus!).reduce((sum, value) => sum + value.costPendingQuantity, 0),
        costPendingByUnit: pendingByUnit,
        byStatus,
        aging: agingRows,
        slowMovingCount: Number(slow[0]?.c ?? 0),
        frozenValue: byStatus!.FROZEN ? byStatus!.FROZEN.value : 0,
        quarantineValue: byStatus!.QUARANTINE ? byStatus!.QUARANTINE.value : 0,
        damagedValue: byStatus!.DAMAGED ? byStatus!.DAMAGED.value : 0,
        asOf: new Date().toISOString(),
      };
    } catch {
      return {
        status: 'UNAVAILABLE',
        turnover30Day: null,
        salesOutToAvailableStatus: 'UNAVAILABLE',
        salesOutToAvailable30Day: null,
        salesOutToAvailableByUnit: null,
        otherMovementsByUnit: null,
        capitalOccupation: null,
        costPendingBatches: null,
        costPendingQuantity: null,
        costPendingByUnit: null,
        byStatus: null,
        aging: null,
        slowMovingCount: null,
        frozenValue: null,
        quarantineValue: null,
        damagedValue: null,
        asOf: new Date().toISOString(),
      };
    }
  }
}
