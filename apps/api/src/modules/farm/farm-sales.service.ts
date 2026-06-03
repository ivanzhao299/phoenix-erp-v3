import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Farm Sales — 农场直销（已停用直扣库存）
 * ────────────────────────────────────────────────────────────────────────
 * R1（删除重复库存体系）：farm-sales 不再直接修改库存。
 *   · 已删除：createSale/cancelSale 对 FarmEggService.outbound/inbound 的直扣/回补逻辑。
 *   · 销售扣减库存唯一走 Sales V2 Inventory Runtime（EggInventoryService FIFO）/ Store POS。
 *   · 仅保留 getCustomers / getSales 只读查询；下单/撤销冻结（引导至新版销售管理）。
 * 依据：docs/production-runtime-rebuild-phase-r1-delete-duplicate-inventory.md
 */

export interface FarmSaleItem {
  grade:        string;
  grade_name:   string;
  qty:          number;
  trays:        number;
  unit_price:   number;
}

export interface CreateFarmSaleDto {
  sale_date:     string;
  customer_code: string;
  customer_name: string;
  items:         FarmSaleItem[];
  remark?:       string;
  operator:      string;
}

@Injectable()
export class FarmSalesService {
  constructor(@InjectDataSource() private ds: DataSource) {}

  /** 获取农场客户列表（只读） */
  async getCustomers() {
    return this.ds.query<any[]>(
      `SELECT customer_code, customer_name FROM ord_customers
       WHERE tier = 'FARM' AND status = 'ACTIVE'
       ORDER BY customer_code`,
    );
  }

  /** 查询农场销售订单列表（按日期，只读） */
  async getSales(date: string) {
    return this.ds.query<any[]>(
      `SELECT o.order_no, o.order_date::text, o.customer_code, o.customer_name,
              o.total_amount, o.status, o.remark, o.created_by,
              json_agg(
                json_build_object(
                  'grade', i.grade,
                  'product_name_zh', i.product_name_zh,
                  'qty', i.qty,
                  'unit_price', i.unit_price,
                  'subtotal', i.subtotal
                ) ORDER BY i.id
              ) AS items
       FROM ord_orders o
       JOIN ord_order_items i ON i.order_no = o.order_no
       WHERE o.order_type = 'FARM_SALE'
         AND o.order_date = $1
       GROUP BY o.id
       ORDER BY o.id DESC`,
      [date],
    );
  }

  /** 创建农场直销单 —— R1 停用（不再直扣库存）。请使用新版销售管理（Sales V2）。 */
  async createSale(_dto: CreateFarmSaleDto): Promise<never> {
    throw new Error('农场直销旧流程已停用（R1）。销售扣减统一走「销售管理（Sales V2）」，本入口不再直接修改库存。');
  }

  /** 撤销农场直销单 —— R1 停用（不再回补库存）。历史单撤销/退货请走 Sales V2 退货流程。 */
  async cancelSale(_orderNo: string, _operator: string): Promise<never> {
    throw new Error('农场直销旧流程已停用（R1）。历史单撤销/退货请使用新版销售管理（Sales V2）。');
  }
}
