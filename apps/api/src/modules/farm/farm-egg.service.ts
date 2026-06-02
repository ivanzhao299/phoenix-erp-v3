import { Injectable, OnModuleInit, ForbiddenException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * 生产链路收口 Phase 1 — Farm Egg 库存旁路冻结
 * ────────────────────────────────────────────────────────────────────────
 * 依据：docs/production-inventory-integration-audit.md（闭环A）
 * 集蛋曾经通过本服务直接写 EGG-STOCK-* 批次形成可销售库存（绕过分级/包装），
 * 与包装链路、Sales V2 FIFO 双重计数。Phase 1 起：
 *   · 禁止 inbound / outbound / writeOff（不再生成/扣减可售库存）
 *   · 保留 getStock / getLedger 只读（历史数据可见）
 *   · 集蛋 → 分级 → 包装 → 自动入库 统一走「包装作业中心」
 */
const FARM_EGG_FROZEN_MSG =
  '集蛋入库旁路已冻结（生产链路收口 Phase 1）。请改用「包装作业中心」完成 集蛋→分级→包装→自动入库；' +
  '销售扣减统一走「销售管理（Sales V2）」。本入口仅保留历史库存与流水查询。';

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

  /** 入库：鸡舍 → 鸡蛋库
   *  @deprecated 生产链路收口 Phase 1 已冻结。集蛋请走「包装作业中心」自动入库。 */
  async inbound(
    _logDate: string,
    _items: EggInboundItem[],
    _operator: string,
  ): Promise<void> {
    throw new ForbiddenException(FARM_EGG_FROZEN_MSG);
  }

  /** 出库：鸡蛋库 → 客户
   *  @deprecated 生产链路收口 Phase 1 已冻结。销售扣减请走「销售管理（Sales V2）」。 */
  async outbound(
    _logDate: string,
    _items: EggOutboundItem[],
    _operator: string,
    _refNo?: string,
  ): Promise<void> {
    throw new ForbiddenException(FARM_EGG_FROZEN_MSG);
  }

  /** 报损（脏蛋/破损处理）
   *  @deprecated 生产链路收口 Phase 1 已冻结。报损请通过「库存管理」处理。 */
  async writeOff(
    _logDate: string,
    _items: Array<{ grade: string; qty: number; reason: string }>,
    _operator: string,
  ): Promise<void> {
    throw new ForbiddenException(FARM_EGG_FROZEN_MSG);
  }
}
