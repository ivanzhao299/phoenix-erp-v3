import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { FarmEggService } from './farm-egg.service';

export interface FarmSaleItem {
  grade:        string;   // 蛋品规格 code
  grade_name:   string;   // 显示名
  qty:          number;   // 枚
  trays:        number;   // 提（qty/180，可由前端计算）
  unit_price:   number;   // 单价（LAK/枚）
}

export interface CreateFarmSaleDto {
  sale_date:     string;          // YYYY-MM-DD
  customer_code: string;
  customer_name: string;
  items:         FarmSaleItem[];
  remark?:       string;
  operator:      string;
}

function saleNo(date: string, seq: number): string {
  return `FS-${date.replace(/-/g, '')}-${String(seq).padStart(4, '0')}`;
}

@Injectable()
export class FarmSalesService {
  constructor(
    @InjectDataSource() private ds: DataSource,
    private eggSvc: FarmEggService,
  ) {}

  /** 获取农场客户列表 */
  async getCustomers() {
    return this.ds.query<any[]>(
      `SELECT customer_code, customer_name FROM ord_customers
       WHERE tier = 'FARM' AND status = 'ACTIVE'
       ORDER BY customer_code`,
    );
  }

  /** 查询农场销售订单列表（按日期） */
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

  /** 创建农场直销单（同步扣减蛋库） */
  async createSale(dto: CreateFarmSaleDto) {
    // 生成单号：当日序号
    const [{ cnt }] = await this.ds.query<any[]>(
      `SELECT COUNT(*)::int AS cnt FROM ord_orders
       WHERE order_type = 'FARM_SALE' AND order_date = $1`,
      [dto.sale_date],
    );
    const orderNo    = saleNo(dto.sale_date, Number(cnt) + 1);
    const totalAmount = dto.items.reduce((s, it) => s + it.qty * it.unit_price, 0);

    // 插入主单
    await this.ds.query(
      `INSERT INTO ord_orders
         (order_no, customer_code, customer_name, order_date, total_amount,
          subtotal, status, order_type, order_source, remark, created_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,$5,'DELIVERED','FARM_SALE','MOBILE',$6,$7,NOW())`,
      [orderNo, dto.customer_code, dto.customer_name, dto.sale_date,
       totalAmount, dto.remark ?? null, dto.operator],
    );

    // 插入明细
    for (const it of dto.items) {
      if (!it.qty || it.qty <= 0) continue;
      const subtotal = it.qty * it.unit_price;
      await this.ds.query(
        `INSERT INTO ord_order_items
           (order_no, product_code, product_name_zh, grade, qty, unit, unit_price, subtotal, amount)
         VALUES ($1, $2, $3, $4, $5, '枚', $6, $7, $7)`,
        [orderNo, `EGG-${it.grade}`, it.grade_name, it.grade, it.qty, it.unit_price, subtotal],
      );
    }

    // 同步扣减蛋库（只扣有售价行）
    const outItems = dto.items
      .filter(it => it.qty > 0)
      .map(it => ({ grade: it.grade, qty: it.qty, customer_no: dto.customer_code }));
    if (outItems.length > 0) {
      try {
        await this.eggSvc.outbound(dto.sale_date, outItems, dto.operator, orderNo);
      } catch (err: any) {
        // 库存不足时不阻断保存，记录 remark（后续对账）
        await this.ds.query(
          `UPDATE ord_orders SET remark = COALESCE(remark,'') || ' [库存预警:' || $1 || ']'
           WHERE order_no = $2`,
          [err.message, orderNo],
        );
      }
    }

    return { order_no: orderNo, total_amount: totalAmount };
  }

  /** 撤销销售单（恢复蛋库） */
  async cancelSale(orderNo: string, operator: string) {
    const [order] = await this.ds.query<any[]>(
      `SELECT * FROM ord_orders WHERE order_no = $1 AND order_type = 'FARM_SALE'`,
      [orderNo],
    );
    if (!order) throw new Error('销售单不存在');
    if (order.status === 'CANCELLED') throw new Error('已撤销');

    const items = await this.ds.query<any[]>(
      `SELECT grade, qty FROM ord_order_items WHERE order_no = $1 AND grade IS NOT NULL`,
      [orderNo],
    );

    // 回补库存
    for (const it of items) {
      if (Number(it.qty) > 0) {
        await this.eggSvc.inbound(
          order.order_date,
          [{ grade: it.grade, qty: Number(it.qty), house_code: 'CANCEL_REFUND' }],
          operator,
        );
      }
    }

    await this.ds.query(
      `UPDATE ord_orders SET status='CANCELLED', updated_at=NOW() WHERE order_no=$1`,
      [orderNo],
    );

    return { order_no: orderNo, status: 'CANCELLED' };
  }
}
