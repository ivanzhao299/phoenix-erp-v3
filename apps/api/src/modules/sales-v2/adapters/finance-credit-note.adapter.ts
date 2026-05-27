import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * FinanceCreditNoteAdapter — Sales V2 Phase 6
 *
 * 内部 Adapter：退货完成后自动生成 Finance V2 AR Credit Note。
 *
 * 设计原则：
 *   · 直接通过 DataSource 写 fin_ar_invoices，避免 FinanceV2Module 循环依赖
 *   · source_type = 'SALES_RETURN'（Credit Note 专用来源类型）
 *   · amount_original = 负数（Credit Note 为负 AR）
 *   · 严禁写 fin_transactions（旧 AR 路径，已冻结）
 *
 * fin_ar_invoices 字段映射：
 *   source_type    = 'SALES_RETURN'
 *   source_id      = sal_return_orders.id
 *   source_no      = sal_return_orders.return_no
 *   amount_original = -return_amount（负数冲销）
 */
export interface CreateCreditNoteParams {
  returnId:      string;
  returnNo:      string;
  companyCode:   string;
  companyName?:  string;
  customerCode?: string;
  customerName:  string;
  currencyCode:  string;
  returnAmount:  number;   // 正数，内部取负
  createdBy:     string;
}

@Injectable()
export class FinanceCreditNoteAdapter {
  private readonly logger = new Logger(FinanceCreditNoteAdapter.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  private async genCrNo(): Promise<string> {
    const today  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `CR-${today}-`;
    const row = await this.ds.query(
      `SELECT COUNT(*) AS cnt FROM fin_ar_invoices WHERE ar_no LIKE $1`,
      [`${prefix}%`],
    );
    return `${prefix}${String(Number(row[0].cnt) + 1).padStart(5, '0')}`;
  }

  /**
   * 为已完成的退货单创建 AR Credit Note（负数 AR Invoice）。
   * 在调用方的事务外调用（独立事务），成功后返回 fin_ar_invoices.id。
   *
   * 安全约束：
   *   · amount_original 必须为负数（returnAmount 的负值）
   *   · balance_amount_original 也为负数（未被核销前）
   *   · status = 'OPEN'（等待与正向 AR 核销）
   */
  async createCreditNote(params: CreateCreditNoteParams): Promise<string> {
    const crNo = await this.genCrNo();
    const negAmount = -Math.abs(params.returnAmount);   // 强制负数

    // source_type = 'SALES_RETURN' 直接插入（Adapter 绕过 DTO 验证，使用 raw SQL）
    const result = await this.ds.query(
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
         $1,'SALES_RETURN',$2,$3,
         $4,$5,
         NULL,$6,$7,
         CURRENT_DATE, CURRENT_DATE,
         $8,$9,1,
         $9,'LAK',
         0,0,$9,$9,
         'OPEN','UNRECEIVED',
         $10,$11,$11,
         NOW(),NOW()
       ) RETURNING id`,
      [
        crNo,
        params.returnId,
        params.returnNo,
        params.companyCode,
        params.companyName ?? null,
        params.customerCode ?? null,
        params.customerName,
        params.currencyCode,
        negAmount,
        `退货冲销 Return ${params.returnNo} (amount=${negAmount})`,
        params.createdBy,
      ],
    );

    const crId = String(result[0].id);
    this.logger.log(
      `[CreditNote] 创建 Credit Note: ${crNo} (id=${crId}) amount=${negAmount} for return ${params.returnNo}`,
    );
    return crId;
  }
}
