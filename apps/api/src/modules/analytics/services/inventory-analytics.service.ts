import { officialInventoryPredicate, officialLedgerPredicate, officialInventoryCostAggregate } from '../../wms/official-inventory';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

/**
 * G6-D — 库存分析中心
 *
 * 6 个核心指标：周转 / 资金占用 / 库龄 / 滞销 / 冻结 / 隔离
 * 全部基于 G4-D 治理后的 inv_batches / inv_ledger 唯一台账。
 */
@Injectable()
export class InventoryAnalyticsService {
  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  private async safe<T = any>(sql: string): Promise<T[]> {
    try { return await this.em.query(sql); } catch (e: any) { console.error("[catch-audit] safe() SQL failed:", e?.message); return []; }
  }

  async compute(q: { companyCode?: string; warehouseCode?: string }) {
    const wFilter = q.warehouseCode ? `AND warehouse_code = '${q.warehouseCode.replace(/'/g, "''")}'` : '';

    const cFilter=q.companyCode?`AND company_code = '${q.companyCode.replace(/'/g,"''")}'`:'';
    // 5 态分布
    const dist = await this.safe<{ status: string; cnt: string; value: string|null;cost_pending_batches:number;cost_pending_quantity:string }>(
      `SELECT COALESCE(status,'UNKNOWN') AS status,
              COUNT(*)::text AS cnt,
              ${officialInventoryCostAggregate('inv_batches')}
         FROM inv_batches WHERE ${officialInventoryPredicate('inv_batches')} AND 1=1 ${wFilter} ${cFilter}
         GROUP BY COALESCE(status,'UNKNOWN')`,
    );
    const byStatus: Record<string, { count: number; value: number|null;costPendingBatches:number;costPendingQuantity:number }> = {};
    for (const d of dist) {
      byStatus[d.status] = { count: parseInt(d.cnt, 10), value:d.value===null?null:parseFloat(d.value),costPendingBatches:d.cost_pending_batches,costPendingQuantity:Number(d.cost_pending_quantity) };
    }

    // 库存周转 = 30 天出库量 / 当前库存
    const outRows = await this.safe<{ v: string }>(
      `SELECT COALESCE(SUM(ABS(qty_change)),0)::text AS v FROM inv_ledger
         WHERE ${officialLedgerPredicate()} AND change_type IN ('OUTBOUND','SALES','TRANSFER')
           AND created_at > NOW() - INTERVAL '30 days'`,
    );
    const onHandRows = await this.safe<{ v: string }>(
      `SELECT COALESCE(SUM(qty),0)::text AS v FROM inv_batches WHERE ${officialInventoryPredicate('inv_batches')} AND status='AVAILABLE' ${wFilter} ${cFilter}`,
    );
    const out30 = parseFloat(outRows[0]?.v ?? '0');
    const onHand = parseFloat(onHandRows[0]?.v ?? '0');
    const turnover = onHand > 0 ? Math.round((out30 / onHand) * 100) / 100 : 0;

    // 库龄分析（基于 created_at）
    const aging = await this.safe<{ bucket: string; cnt: string; value: string|null;cost_pending_batches:number;cost_pending_quantity:string }>(
      `SELECT CASE
                WHEN created_at > NOW() - INTERVAL '30 days'  THEN '0-30'
                WHEN created_at > NOW() - INTERVAL '60 days'  THEN '31-60'
                WHEN created_at > NOW() - INTERVAL '90 days'  THEN '61-90'
                WHEN created_at > NOW() - INTERVAL '180 days' THEN '91-180'
                ELSE '180+'
              END AS bucket,
              COUNT(*)::text AS cnt,
              ${officialInventoryCostAggregate('inv_batches')}
         FROM inv_batches WHERE ${officialInventoryPredicate('inv_batches')} AND status IN ('AVAILABLE','QUARANTINE','RESERVED') ${wFilter} ${cFilter}
         GROUP BY 1
         ORDER BY 1`,
    );

    // 滞销：库存 ≥90 天且最近 30 天无出库
    const slow = await this.safe<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM inv_batches b
         WHERE ${officialInventoryPredicate('b')} AND b.status='AVAILABLE' AND b.created_at < NOW() - INTERVAL '90 days' ${wFilter} ${cFilter}
           AND NOT EXISTS (
             SELECT 1 FROM inv_ledger l
               WHERE l.batch_no = b.batch_no
                 AND l.change_type IN ('OUTBOUND','SALES')
                 AND l.created_at > NOW() - INTERVAL '30 days'
           )`,
    );

    return {
      turnover30Day: turnover,
      capitalOccupation:Object.values(byStatus).some(v=>v.value===null)?null:Object.values(byStatus).reduce((s,v)=>s+(v.value??0),0),
      costPendingBatches:Object.values(byStatus).reduce((s,v)=>s+v.costPendingBatches,0),
      costPendingQuantity:Object.values(byStatus).reduce((s,v)=>s+v.costPendingQuantity,0),
      byStatus,
      aging: aging.map(a => ({ bucket: a.bucket, count: parseInt(a.cnt, 10), value:a.value===null?null:parseFloat(a.value),costPendingBatches:a.cost_pending_batches,costPendingQuantity:Number(a.cost_pending_quantity) })),
      slowMovingCount: parseInt(slow[0]?.c ?? '0', 10),
      frozenValue:byStatus['FROZEN']?byStatus['FROZEN'].value:0,
      quarantineValue:byStatus['QUARANTINE']?byStatus['QUARANTINE'].value:0,
      damagedValue:byStatus['DAMAGED']?byStatus['DAMAGED'].value:0,
      asOf: new Date().toISOString(),
    };
  }
}
