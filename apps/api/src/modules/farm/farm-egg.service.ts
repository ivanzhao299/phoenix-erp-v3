import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

// 8 个蛋品规格
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

export interface EggInboundItem {
  grade: string;
  qty: number;         // 枚
  house_code: string;
}

export interface EggOutboundItem {
  grade: string;
  qty: number;
  customer_no: string;
}

@Injectable()
export class FarmEggService implements OnModuleInit {
  constructor(@InjectDataSource() private ds: DataSource) {}

  async onModuleInit() {
    // 确保每个等级都有对应的库存批次行
    for (const g of EGG_GRADES) {
      await this.ds.query(
        `INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, warehouse_code, status)
         VALUES ($1, $2, 0, 0, $3, 'AVAILABLE')
         ON CONFLICT (batch_no) DO NOTHING`,
        [batchNo(g.code), `EGG-${g.code}`, WAREHOUSE],
      );
    }
  }

  /** 当前库存快照 */
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

  /** 按日期范围查询流水 */
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

  /** 入库：鸡舍 → 鸡蛋库 */
  async inbound(
    logDate: string,
    items: EggInboundItem[],
    operator: string,
  ): Promise<void> {
    for (const item of items) {
      if (!item.qty || item.qty <= 0) continue;
      const bn = batchNo(item.grade);
      await this.ds.query(
        `UPDATE inv_batches
         SET qty           = qty + $1,
             qty_available = COALESCE(qty_available, qty, 0) + $1,
             updated_at    = NOW()
         WHERE batch_no = $2`,
        [item.qty, bn],
      );
      await this.ds.query(
        `INSERT INTO inv_ledger
           (batch_no, change_type, qty_change, log_date, warehouse_code, house_code, operator, note)
         VALUES ($1, 'EGG_INBOUND_HOUSE', $2, $3, $4, $5, $6, $7)`,
        [bn, item.qty, logDate, WAREHOUSE, item.house_code, operator, `鸡舍入库 ${item.house_code}`],
      );
    }
  }

  /** 出库：鸡蛋库 → 客户 */
  async outbound(
    logDate: string,
    items: EggOutboundItem[],
    operator: string,
    refNo?: string,
  ): Promise<void> {
    for (const item of items) {
      if (!item.qty || item.qty <= 0) continue;
      const bn = batchNo(item.grade);
      // 检查库存
      const [row] = await this.ds.query<any[]>(
        `SELECT COALESCE(qty_available, qty, 0) AS avail FROM inv_batches WHERE batch_no = $1`,
        [bn],
      );
      const avail = Number(row?.avail ?? 0);
      if (avail < item.qty) {
        throw new Error(`${item.grade} 等级库存不足：现有 ${avail} 枚，出库 ${item.qty} 枚`);
      }
      await this.ds.query(
        `UPDATE inv_batches
         SET qty           = qty - $1,
             qty_available = COALESCE(qty_available, qty, 0) - $1,
             updated_at    = NOW()
         WHERE batch_no = $2`,
        [item.qty, bn],
      );
      await this.ds.query(
        `INSERT INTO inv_ledger
           (batch_no, change_type, qty_change, log_date, warehouse_code, customer_no, operator, ref_no, note)
         VALUES ($1, 'EGG_OUTBOUND_SALE', $2, $3, $4, $5, $6, $7, $8)`,
        [bn, -item.qty, logDate, WAREHOUSE, item.customer_no, operator, refNo ?? null, `客户出库 ${item.customer_no}`],
      );
    }
  }

  /** 报损（脏蛋/破损处理）*/
  async writeOff(
    logDate: string,
    items: Array<{ grade: string; qty: number; reason: string }>,
    operator: string,
  ): Promise<void> {
    for (const item of items) {
      if (!item.qty || item.qty <= 0) continue;
      const bn = batchNo(item.grade);
      await this.ds.query(
        `UPDATE inv_batches
         SET qty           = GREATEST(0, qty - $1),
             qty_available = GREATEST(0, COALESCE(qty_available, qty, 0) - $1),
             updated_at    = NOW()
         WHERE batch_no = $2`,
        [item.qty, bn],
      );
      await this.ds.query(
        `INSERT INTO inv_ledger
           (batch_no, change_type, qty_change, log_date, warehouse_code, operator, note)
         VALUES ($1, 'EGG_WRITE_OFF', $2, $3, $4, $5, $6)`,
        [bn, -item.qty, logDate, WAREHOUSE, operator, item.reason || '报损'],
      );
    }
  }
}
