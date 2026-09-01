import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';

/**
 * FinanceArAdapter — Sales V2 Phase 3
 *
 * 内部 Adapter：在 Sales Order RECEIVED 时自动创建 Finance V2 AR Invoice。
 *
 * 设计原则：
 *   · 直接通过 DataSource 写 fin_ar_invoices，避免 FinanceV2Module 循环依赖
 *   · source_type = 'SALES_ORDER'（已在 Finance V2 AR DTO 白名单内）
 *   · 严禁写 fin_transactions（旧 AR 路径，已冻结）
 *   · AR 单号规则与 Finance V2 ArInvoicesService.genArNo() 相同
 *
 * 接入 Finance V2 AR Runtime：
 *   fin_ar_invoices.source_id  = sal_sales_orders.id
 *   fin_ar_invoices.source_no  = sal_sales_orders.order_no
 *   fin_ar_invoices.source_type = 'SALES_ORDER'
 */

export interface CreateOrderArParams {
  orderId:      string;
  orderNo:      string;
  companyCode:  string;
  companyName?: string;
  customerId?:  string;
  customerCode?: string;
  customerName: string;
  currencyCode: string;
  totalAmount:  number;
  /** due_date = received_at + paymentTermsDays（天数，默认 30） */
  paymentTermsDays?: number;
  receivedAt:   Date;
  createdBy:    string;
}

@Injectable()
export class FinanceArAdapter {
  private readonly logger = new Logger(FinanceArAdapter.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  private async genArNo(manager: EntityManager): Promise<string> {
    const today  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `AR-${today}-`;
    const row = await manager.query(
      `SELECT COUNT(*) AS cnt FROM fin_ar_invoices WHERE ar_no LIKE $1`,
      [`${prefix}%`],
    );
    return `${prefix}${String(Number(row[0].cnt) + 1).padStart(5, '0')}`;
  }

  /**
   * 为已签收的销售订单创建 AR Invoice。
   * 接受调用方 EntityManager，确保 RECEIVED、事件、AR 与回写原子提交。
   */
  async createArForOrder(params: CreateOrderArParams, manager: EntityManager = this.ds.manager): Promise<string> {
    const arNo = await this.genArNo(manager);
    const days = params.paymentTermsDays ?? 30;
    const dueDate = new Date(params.receivedAt);
    dueDate.setDate(dueDate.getDate() + days);
    const dueDateStr = dueDate.toISOString().slice(0, 10);

    // source_type 'SALES_ORDER' 已在 Finance V2 DTO IsIn 白名单内
    // 不写 fin_transactions（旧 AR 路径，已冻结）
    const result = await manager.query(
      `INSERT INTO fin_ar_invoices (
         ar_no, source_type, source_id, source_no,
         company_code, company_name,
         customer_id, customer_code, customer_name,
         invoice_date, due_date,
         currency_code, amount_original, exchange_rate,
         amount_base, base_currency,
         received_amount_original, received_amount_base,
         balance_amount_original, balance_amount_base,
         status, collection_status,
         remark, created_by, updated_by,
         created_at, updated_at
       ) VALUES (
         $1,'SALES_ORDER',$2,$3,
         $4,$5,
         $6,$7,$8,
         CURRENT_DATE,$9,
         $10,$11,1,
         $11,'LAK',
         0,0,$11,$11,
         'OPEN','UNRECEIVED',
         $12,$13,$13,
         NOW(),NOW()
       ) RETURNING id`,
      [
        arNo, params.orderId, params.orderNo,
        params.companyCode, params.companyName ?? null,
        params.customerId ?? null, params.customerCode ?? null, params.customerName,
        dueDateStr,
        params.currencyCode, params.totalAmount,
        `Sales Order ${params.orderNo}`, params.createdBy,
      ],
    );

    const arId = String(result[0].id);
    this.logger.log(`[FinanceAR] 创建 AR Invoice: ${arNo} (id=${arId}) for order ${params.orderNo}`);
    return arId;
  }
}
