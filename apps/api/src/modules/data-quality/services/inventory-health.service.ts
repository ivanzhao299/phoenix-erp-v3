import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

export interface InventoryHealthReport {
  score: number;
  byStatus: Record<string, number>;  // 5 态分布
  negativeQty: number;
  longStanding: { quarantineDays30Plus: number; damagedDays30Plus: number; reservedDays7Plus: number };
  withoutBatch: number;              // inv_ledger.batch_no 引用不存在的 batch
  asOf: string;
}

/**
 * G5 — 库存健康
 *
 * 检查（基于 G4-D 统一的 5 态 INV_STOCK_STATUS）：
 *   - 5 态分布
 *   - 负库存（qty < 0）
 *   - 长期滞留：QUARANTINE / DAMAGED 超过 30 天；RESERVED 超过 7 天
 *   - 孤儿账：inv_ledger 引用不存在的 batch_no
 *
 * 评分：
 *   100 起步
 *   - 负库存每条 -2
 *   - 长期滞留每条 -1
 *   - 孤儿账每条 -1
 *   - 地板 0
 */
@Injectable()
export class InventoryHealthService {
  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  private async safe<T = any>(sql: string): Promise<T[]> {
    try { return await this.em.query(sql); } catch (e: any) { console.error("[catch-audit] safe() SQL failed:", e?.message); return []; }
  }

  async compute(): Promise<InventoryHealthReport> {
    // 5 态分布
    const dist = await this.safe<{ status: string; c: string }>(
      `SELECT COALESCE(status,'UNKNOWN') AS status, COUNT(*)::text AS c
         FROM inv_batches GROUP BY COALESCE(status,'UNKNOWN')`,
    );
    const byStatus: Record<string, number> = {};
    for (const d of dist) byStatus[d.status] = parseInt(d.c, 10);

    // 负库存
    const negRows = await this.safe<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM inv_batches WHERE qty < 0 OR COALESCE(qty_available,0) < 0`,
    );
    const negativeQty = parseInt(negRows[0]?.c ?? '0', 10);

    // 长期滞留
    const q30 = await this.safe<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM inv_batches
         WHERE status='QUARANTINE' AND updated_at < NOW() - INTERVAL '30 days'`,
    );
    const d30 = await this.safe<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM inv_batches
         WHERE status='DAMAGED' AND updated_at < NOW() - INTERVAL '30 days'`,
    );
    const r7 = await this.safe<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM inv_batches
         WHERE status='RESERVED' AND updated_at < NOW() - INTERVAL '7 days'`,
    );

    // 孤儿账
    const orphan = await this.safe<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM inv_ledger l
         WHERE l.batch_no IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM inv_batches b WHERE b.batch_no = l.batch_no)`,
    );

    const longStanding = {
      quarantineDays30Plus: parseInt(q30[0]?.c ?? '0', 10),
      damagedDays30Plus:    parseInt(d30[0]?.c ?? '0', 10),
      reservedDays7Plus:    parseInt(r7[0]?.c ?? '0', 10),
    };
    const withoutBatch = parseInt(orphan[0]?.c ?? '0', 10);

    const deduct =
      negativeQty * 2 +
      longStanding.quarantineDays30Plus +
      longStanding.damagedDays30Plus +
      longStanding.reservedDays7Plus +
      withoutBatch;

    const score = Math.max(0, Math.min(100, 100 - deduct));

    return { score, byStatus, negativeQty, longStanding, withoutBatch, asOf: new Date().toISOString() };
  }
}
