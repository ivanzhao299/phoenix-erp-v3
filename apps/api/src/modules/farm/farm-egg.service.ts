import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Farm Egg — 集蛋记录（只读）
 * ────────────────────────────────────────────────────────────────────────
 * R1（删除重复库存体系）：Farm Egg 不再作为库存系统。
 *   · 已删除：onModuleInit 创建 EGG-STOCK-* 批次、inbound/outbound/writeOff 写库存逻辑。
 *   · 仅保留：getStock / getLedger 只读查询（历史集蛋记录/流水，供台账查看）。
 *   · 库存来源唯一由 InventorySourceMode 控制：TEMP_PRODUCTION_INBOUND / PACKAGING_INBOUND。
 *   · 销售扣减统一走 Sales V2 Inventory Runtime（EggInventoryService FIFO）/ Store POS。
 * 依据：docs/production-runtime-rebuild-phase-r1-delete-duplicate-inventory.md
 */

// 8 个蛋品规格（仅供只读快照按等级归类）
export const EGG_GRADES = [
  { code: '0', name: '0号蛋', sort: 0 },
  { code: '1', name: '1号蛋', sort: 1 },
  { code: '2', name: '2号蛋', sort: 2 },
  { code: '3', name: '3号蛋', sort: 3 },
  { code: '4', name: '4号蛋', sort: 4 },
  { code: '5', name: '5号蛋', sort: 5 },
  { code: 'DIRTY', name: '脏蛋', sort: 6 },
  { code: 'BROKEN', name: '破损蛋', sort: 7 },
];

const WAREHOUSE = 'FARM_EGG';

function batchNo(grade: string) {
  return `EGG-STOCK-${grade}`;
}

export interface EggStockRow {
  grade: string;
  name: string;
  qty: number;        // 当前库存（枚）
  trays: number;      // 提数（÷180）
}

export interface EggLedgerEntry {
  id: number;
  log_date: string;
  change_type: string;
  grade: string;
  qty_change: number;
  house_code: string | null;
  customer_no: string | null;
  note: string | null;
  operator: string;
  created_at: string;
}

@Injectable()
export class FarmEggService {
  constructor(@InjectDataSource() private ds: DataSource) {}

  /** 当前库存快照（只读·历史 FARM_EGG 仓；R1 后不再新增，仅供台账查看） */
  async getStock(): Promise<EggStockRow[]> {
    const rows = await this.ds.query<any[]>(
      `SELECT batch_no, COALESCE(qty_available, qty, 0) AS qty
       FROM inv_batches WHERE warehouse_code = $1`,
      [WAREHOUSE],
    );
    const map = new Map(rows.map(r => [r.batch_no as string, Number(r.qty)]));
    return EGG_GRADES.map(g => {
      const qty = map.get(batchNo(g.code)) ?? 0;
      return { grade: g.code, name: g.name, qty, trays: Math.floor(qty / 180) };
    });
  }

  /** 按日期范围查询流水（只读·历史 FARM_EGG 仓） */
  async getLedger(startDate: string, endDate: string): Promise<EggLedgerEntry[]> {
    return this.ds.query<EggLedgerEntry[]>(
      `SELECT l.id, l.log_date::text, l.change_type, b.product_code AS grade,
              l.qty_change, l.house_code, l.customer_no, l.note, l.operator,
              l.created_at::text
       FROM inv_ledger l
       JOIN inv_batches b ON b.batch_no = l.batch_no
       WHERE b.warehouse_code = $1
         AND l.log_date BETWEEN $2 AND $3
       ORDER BY l.created_at DESC`,
      [WAREHOUSE, startDate, endDate],
    );
  }
}
