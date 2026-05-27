import {
  Injectable, Logger, NotFoundException,
  BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { ApprovalEngineService } from '../../approval-engine/approval-engine.service';
import { FinanceCreditNoteAdapter } from '../adapters/finance-credit-note.adapter';
import { EggInventoryService } from './egg-inventory.service';      // Phase 7

/**
 * ReturnOrdersService — Sales V2 Phase 6
 *
 * 退货 Runtime 核心业务逻辑。
 *
 * 状态机：
 *   DRAFT → submit() → PENDING_APPROVAL (need_approval)
 *                    → INSPECTING       (直接)
 *   PENDING_APPROVAL → approve() → INSPECTING
 *                    → reject()  → REJECTED
 *   INSPECTING → completeInspection() → RESTOCKING (accepted_qty > 0)
 *                                     → COMPLETED  (全部破损)
 *   RESTOCKING → completeRestock() → COMPLETED
 *
 * 安全约束：
 *   · COMPLETED 后不允许修改
 *   · damaged_qty 不回库存（只写 inv_ledger WRITE_OFF）
 *   · accepted_qty 不得超过 returned_qty
 *   · Credit Note amount 必须为负数
 *   · 严禁写 fin_transactions
 */
@Injectable()
export class ReturnOrdersService {
  private readonly logger = new Logger(ReturnOrdersService.name);

  /** 大额退货审批阈值（LAK） */
  private readonly APPROVAL_THRESHOLD = 500_000;

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cls: ClsService,
    private readonly approvalEngine: ApprovalEngineService,
    private readonly creditNoteAdapter: FinanceCreditNoteAdapter,
    private readonly eggInventory: EggInventoryService,             // Phase 7
  ) {}

  // ── 内部工具 ─────────────────────────────────────────────────────────────────

  private get currentUser(): string {
    try { return this.cls.get('user')?.username ?? 'system'; } catch { return 'system'; }
  }

  private async genReturnNo(): Promise<string> {
    const today  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `RET-${today}-`;
    const [row]  = await this.ds.query(
      `SELECT COUNT(*) AS cnt FROM sal_return_orders WHERE return_no LIKE $1`,
      [`${prefix}%`],
    );
    return `${prefix}${String(Number(row.cnt) + 1).padStart(5, '0')}`;
  }

  private assertNotCompleted(status: string, action: string) {
    if (['COMPLETED', 'REJECTED', 'CANCELLED'].includes(status)) {
      throw new ForbiddenException(`退货单已终态 (${status})，不允许执行 ${action}`);
    }
  }

  private async findRaw(id: string) {
    const [row] = await this.ds.query(
      `SELECT * FROM sal_return_orders WHERE id = $1`, [id],
    );
    if (!row) throw new NotFoundException(`退货单 ${id} 不存在`);
    return row;
  }

  // ── 1. 列表 ─────────────────────────────────────────────────────────────────

  async list(query: {
    companyCode?: string;
    customerCode?: string;
    status?: string;
    returnType?: string;
    page?: number;
    limit?: number;
  }) {
    const page  = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, query.limit ?? 20);
    const offset = (page - 1) * limit;

    const conds: string[] = ['1=1'];
    const params: unknown[] = [];
    let pi = 1;

    if (query.companyCode) { conds.push(`r.company_code = $${pi++}`); params.push(query.companyCode); }
    if (query.customerCode){ conds.push(`r.customer_code = $${pi++}`); params.push(query.customerCode); }
    if (query.status)       { conds.push(`r.status = $${pi++}`); params.push(query.status); }
    if (query.returnType)   { conds.push(`r.return_type = $${pi++}`); params.push(query.returnType); }

    const where = conds.join(' AND ');

    const [{ total }] = await this.ds.query(
      `SELECT COUNT(*) AS total FROM sal_return_orders r WHERE ${where}`,
      params,
    );

    const rows = await this.ds.query(
      `SELECT r.*, (
         SELECT json_agg(i ORDER BY i.id)
         FROM sal_return_items i WHERE i.return_order_id = r.id
       ) AS items
       FROM sal_return_orders r
       WHERE ${where}
       ORDER BY r.created_at DESC
       LIMIT $${pi++} OFFSET $${pi++}`,
      [...params, limit, offset],
    );

    return {
      data:  rows,
      total: Number(total),
      page,
      limit,
    };
  }

  // ── 2. 详情 ─────────────────────────────────────────────────────────────────

  async findById(id: string) {
    const [row] = await this.ds.query(
      `SELECT r.*, (
         SELECT json_agg(i ORDER BY i.id)
         FROM sal_return_items i WHERE i.return_order_id = r.id
       ) AS items
       FROM sal_return_orders r WHERE r.id = $1`,
      [id],
    );
    if (!row) throw new NotFoundException(`退货单 ${id} 不存在`);
    return row;
  }

  // ── 3. 创建退货单 ────────────────────────────────────────────────────────────

  async create(body: {
    salesOrderId?:   string;
    salesOrderNo?:   string;
    deliveryOrderId?: string;
    customerCode?:   string;
    customerName?:   string;
    companyCode:     string;
    companyName?:    string;
    returnType:      string;
    reasonCode?:     string;
    currencyCode?:   string;
    remark?:         string;
    items: Array<{
      salesOrderItemId?: string;
      productCode:       string;
      productName?:      string;
      gradeCode?:        string;
      packagingSpec?:    string;
      returnedQty:       number;
      unitPrice:         number;
      remark?:           string;
    }>;
  }) {
    if (!body.items?.length) {
      throw new BadRequestException('退货单至少需要一条明细');
    }

    const validTypes = ['CUSTOMER_RETURN', 'DELIVERY_REJECT', 'QUALITY_RETURN', 'DAMAGE_RETURN'];
    if (!validTypes.includes(body.returnType)) {
      throw new BadRequestException(`无效的退货类型: ${body.returnType}`);
    }

    // 如果来自销售订单，自动带入客户信息
    let customerCode = body.customerCode;
    let customerName = body.customerName;
    let companyCode  = body.companyCode;
    let companyName  = body.companyName;
    let currencyCode = body.currencyCode ?? 'LAK';

    if (body.salesOrderId) {
      const [order] = await this.ds.query(
        `SELECT customer_code, customer_name, company_code, company_name, currency_code
         FROM sal_sales_orders WHERE id = $1`,
        [body.salesOrderId],
      );
      if (order) {
        customerCode = customerCode ?? order.customer_code;
        customerName = customerName ?? order.customer_name;
        companyCode  = companyCode  ?? order.company_code;
        companyName  = companyName  ?? order.company_name;
        currencyCode = currencyCode ?? order.currency_code ?? 'LAK';
      }
    }

    const returnNo = await this.genReturnNo();
    const subtotal = body.items.reduce((s, it) => s + it.returnedQty * it.unitPrice, 0);
    const operator = this.currentUser;

    const [ret] = await this.ds.query(
      `INSERT INTO sal_return_orders (
         return_no, sales_order_id, sales_order_no, delivery_order_id,
         customer_code, customer_name, company_code, company_name,
         return_type, reason_code, currency_code, subtotal,
         status, need_approval, created_by, created_at, updated_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
         'DRAFT',false,$13,NOW(),NOW()
       ) RETURNING *`,
      [
        returnNo,
        body.salesOrderId ?? null,
        body.salesOrderNo ?? null,
        body.deliveryOrderId ?? null,
        customerCode ?? null,
        customerName ?? null,
        companyCode,
        companyName ?? null,
        body.returnType,
        body.reasonCode ?? null,
        currencyCode,
        subtotal,
        operator,
      ],
    );

    // 插入明细
    for (const it of body.items) {
      if (it.returnedQty <= 0) throw new BadRequestException('退货数量必须大于 0');
      const amount = it.returnedQty * it.unitPrice;
      await this.ds.query(
        `INSERT INTO sal_return_items (
           return_order_id, sales_order_item_id,
           product_code, product_name, grade_code, packaging_spec,
           returned_qty, accepted_qty, damaged_qty,
           unit_price, amount,
           inspection_result, restock_status, remark, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,0,0,$8,$9,'PENDING','PENDING',$10,NOW())`,
        [
          ret.id,
          it.salesOrderItemId ?? null,
          it.productCode,
          it.productName ?? null,
          it.gradeCode ?? null,
          it.packagingSpec ?? null,
          it.returnedQty,
          it.unitPrice,
          amount,
          it.remark ?? null,
        ],
      );
    }

    this.logger.log(`[Return] 创建退货单: ${returnNo} (id=${ret.id})`);
    return this.findById(String(ret.id));
  }

  // ── 4. 提交 ─────────────────────────────────────────────────────────────────

  async submit(id: string) {
    const rec = await this.findRaw(id);
    if (rec.status !== 'DRAFT') {
      throw new BadRequestException(`退货单当前状态 ${rec.status}，只有 DRAFT 状态可提交`);
    }

    const amount = Number(rec.subtotal);
    const needApproval = amount >= this.APPROVAL_THRESHOLD;
    const nextStatus   = needApproval ? 'PENDING_APPROVAL' : 'INSPECTING';

    await this.ds.transaction(async (mgr) => {
      await mgr.query(
        `UPDATE sal_return_orders
         SET status=$1, need_approval=$2, requested_at=NOW(), updated_at=NOW()
         WHERE id=$3`,
        [nextStatus, needApproval, id],
      );

      // 触发 Workflow（大额退货）
      if (needApproval) {
        try {
          const wf = await this.approvalEngine.startApproval({
            bizType:     'SALES_RETURN',
            bizId:       id,
            bizNo:       String(rec.return_no),
            amount,
            companyCode: String(rec.company_code),
            companyName: rec.company_name ?? undefined,
            subject:     `退货单审批：${rec.return_no}（金额 ${amount} ${rec.currency_code}）`,
            conditionOverrides: {
              returnType:   rec.return_type,
              customerCode: rec.customer_code,
              reasonCode:   rec.reason_code,
            },
          }, mgr);

          if (wf) {
            await mgr.query(
              `UPDATE sal_return_orders SET wf_instance_id=$1, updated_at=NOW() WHERE id=$2`,
              [String(wf.id), id],
            );
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          this.logger.warn(`[Return] Workflow 启动失败（不阻断提交）: ${msg}`);
        }
      }
    });

    this.logger.log(`[Return] 提交退货单: ${rec.return_no} → ${nextStatus}`);
    return this.findById(id);
  }

  // ── 5. 审批通过 ──────────────────────────────────────────────────────────────

  async approve(id: string) {
    const rec = await this.findRaw(id);
    if (rec.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException(`退货单当前状态 ${rec.status}，无法审批`);
    }
    await this.ds.query(
      `UPDATE sal_return_orders SET status='INSPECTING', updated_at=NOW() WHERE id=$1`,
      [id],
    );
    this.logger.log(`[Return] 审批通过: ${rec.return_no} → INSPECTING`);
    return this.findById(id);
  }

  // ── 6. 审批拒绝 ──────────────────────────────────────────────────────────────

  async reject(id: string, reason?: string) {
    const rec = await this.findRaw(id);
    if (rec.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException(`退货单当前状态 ${rec.status}，无法拒绝`);
    }
    await this.ds.query(
      `UPDATE sal_return_orders
       SET status='REJECTED', remark=COALESCE($1, remark), updated_at=NOW()
       WHERE id=$2`,
      [reason ? `[拒绝原因] ${reason}` : null, id],
    );
    this.logger.log(`[Return] 审批拒绝: ${rec.return_no} → REJECTED`);
    return this.findById(id);
  }

  // ── 7. 开始质检（确认进入质检流程） ─────────────────────────────────────────

  async startInspection(id: string) {
    const rec = await this.findRaw(id);
    if (rec.status !== 'INSPECTING') {
      throw new BadRequestException(`退货单当前状态 ${rec.status}，不在质检状态`);
    }
    // 幂等：已在 INSPECTING，返回当前详情即可
    this.logger.log(`[Return] 质检进行中: ${rec.return_no}`);
    return this.findById(id);
  }

  // ── 8. 完成质检 ──────────────────────────────────────────────────────────────

  async completeInspection(id: string, inspectionResults: Array<{
    itemId:       string;
    acceptedQty:  number;
    damagedQty:   number;
    remark?:      string;
  }>) {
    const rec = await this.findRaw(id);
    if (rec.status !== 'INSPECTING') {
      throw new BadRequestException(`退货单当前状态 ${rec.status}，不在质检状态`);
    }

    let totalAccepted = 0;
    let newSubtotal   = 0;

    // 校验并更新每条明细
    for (const result of inspectionResults) {
      const [item] = await this.ds.query(
        `SELECT * FROM sal_return_items WHERE id=$1 AND return_order_id=$2`,
        [result.itemId, id],
      );
      if (!item) throw new NotFoundException(`明细 ${result.itemId} 不存在或不属于本退货单`);

      const acceptedQty = Math.max(0, result.acceptedQty ?? 0);
      const damagedQty  = Math.max(0, result.damagedQty  ?? 0);
      const returnedQty = Number(item.returned_qty);

      // 安全约束：accepted + damaged <= returned
      if (acceptedQty + damagedQty > returnedQty) {
        throw new BadRequestException(
          `明细 ${result.itemId}：accepted_qty(${acceptedQty}) + damaged_qty(${damagedQty}) > returned_qty(${returnedQty})`,
        );
      }

      // 质检结论
      let inspectionResult = 'PENDING';
      if (acceptedQty === returnedQty) {
        inspectionResult = 'ACCEPTED';
      } else if (damagedQty === returnedQty) {
        inspectionResult = 'DAMAGED';
      } else if (acceptedQty === 0 && damagedQty === 0) {
        inspectionResult = 'REJECTED';
      } else {
        inspectionResult = 'PARTIAL';
      }

      const itemAmount = acceptedQty * Number(item.unit_price);
      totalAccepted += acceptedQty;
      newSubtotal   += itemAmount;

      await this.ds.query(
        `UPDATE sal_return_items
         SET accepted_qty=$1, damaged_qty=$2, amount=$3,
             inspection_result=$4, remark=COALESCE($5, remark)
         WHERE id=$6`,
        [acceptedQty, damagedQty, itemAmount, inspectionResult, result.remark ?? null, result.itemId],
      );
    }

    // 下一状态
    const nextStatus = totalAccepted > 0 ? 'RESTOCKING' : 'COMPLETED';

    await this.ds.query(
      `UPDATE sal_return_orders
       SET status=$1, subtotal=$2, inspected_at=NOW(), updated_at=NOW()
       WHERE id=$3`,
      [nextStatus, newSubtotal, id],
    );

    // 全部破损→直接 COMPLETED 但也需要生成 Credit Note（金额为 0）
    if (nextStatus === 'COMPLETED') {
      await this.completeFinal(id, rec);
    }

    this.logger.log(`[Return] 质检完成: ${rec.return_no} → ${nextStatus} (accepted=${totalAccepted})`);
    return this.findById(id);
  }

  // ── 9. 完成回库 ──────────────────────────────────────────────────────────────

  async completeRestock(id: string) {
    const rec = await this.findRaw(id);
    if (rec.status !== 'RESTOCKING') {
      throw new BadRequestException(`退货单当前状态 ${rec.status}，不在回库状态`);
    }

    // Phase 7 — 委托 EggInventoryService 处理 FIFO 回库（含等级降级、损耗流水）
    await this.eggInventory.processReturnInventory(
      id,
      String(rec.return_no),
      String(rec.company_code ?? 'ALL'),
    );

    await this.ds.query(
      `UPDATE sal_return_orders
       SET restocked_at=NOW(), updated_at=NOW()
       WHERE id=$1`,
      [id],
    );

    // 生成 Credit Note + 最终 COMPLETED
    await this.completeFinal(id, rec);

    this.logger.log(`[Return] 回库完成: ${rec.return_no} → COMPLETED`);
    return this.findById(id);
  }

  // ── 10. 完成（内部公共方法：生成 Credit Note + 写 COMPLETED） ──────────────

  async complete(id: string) {
    const rec = await this.findRaw(id);
    this.assertNotCompleted(rec.status, 'complete');
    await this.completeFinal(id, rec);
    return this.findById(id);
  }

  // ── 内部：生成 Credit Note + 最终 COMPLETED ─────────────────────────────────

  private async completeFinal(id: string, rec: Record<string, unknown>) {
    const subtotal  = Number(rec.subtotal ?? 0);
    const operator  = this.currentUser;
    let creditNoteId: string | null = null;

    // 退货金额 > 0 才生成 Credit Note（全部破损则 subtotal=0 跳过）
    if (subtotal > 0) {
      try {
        creditNoteId = await this.creditNoteAdapter.createCreditNote({
          returnId:     String(rec.id),
          returnNo:     String(rec.return_no),
          companyCode:  String(rec.company_code),
          companyName:  rec.company_name as string | undefined,
          customerCode: rec.customer_code as string | undefined,
          customerName: (rec.customer_name ?? '未知客户') as string,
          currencyCode: (rec.currency_code ?? 'LAK') as string,
          returnAmount: subtotal,
          createdBy:    operator,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.error(`[Return] Credit Note 生成失败: ${msg}`);
        // Credit Note 失败不阻断 COMPLETED（记录告警，财务可手动处理）
      }
    }

    await this.ds.query(
      `UPDATE sal_return_orders
       SET status='COMPLETED', credit_note_id=$1, completed_at=NOW(), updated_at=NOW()
       WHERE id=$2`,
      [creditNoteId, id],
    );
  }

  // ── 11. 取消 ─────────────────────────────────────────────────────────────────

  async cancel(id: string, reason?: string) {
    const rec = await this.findRaw(id);
    this.assertNotCompleted(rec.status, 'cancel');
    if (rec.status === 'RESTOCKING') {
      throw new ForbiddenException('退货单已进入回库阶段，无法取消');
    }
    await this.ds.query(
      `UPDATE sal_return_orders
       SET status='CANCELLED', remark=COALESCE($1, remark), updated_at=NOW()
       WHERE id=$2`,
      [reason ? `[取消原因] ${reason}` : null, id],
    );
    return this.findById(id);
  }

  // ── 12. 统计（供 Dashboard 使用） ────────────────────────────────────────────

  async getDashboardStats(companyCode?: string) {
    const cond = companyCode ? `WHERE company_code = '${companyCode}'` : '';
    const [row] = await this.ds.query(`
      SELECT
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)                        AS today_total,
        COUNT(*) FILTER (WHERE status = 'INSPECTING')                             AS pending_inspection,
        COUNT(*) FILTER (WHERE status = 'RESTOCKING')                             AS pending_restock,
        COALESCE(SUM(subtotal) FILTER (WHERE status = 'COMPLETED'
                               AND completed_at >= CURRENT_DATE), 0)              AS today_credit_note_amount,
        COUNT(*) FILTER (WHERE status IN ('DRAFT','SUBMITTED','PENDING_APPROVAL')) AS pending_approval
      FROM sal_return_orders ${cond}
    `);
    return {
      todayTotal:           Number(row.today_total),
      pendingInspection:    Number(row.pending_inspection),
      pendingRestock:       Number(row.pending_restock),
      todayCreditNoteAmount:Number(row.today_credit_note_amount),
      pendingApproval:      Number(row.pending_approval),
    };
  }

  // ── 13. 异常分析（供 Reports 使用） ──────────────────────────────────────────

  async getReturnAnalysis(companyCode?: string) {
    const cond = companyCode ? `AND company_code = '${companyCode}'` : '';

    const topCustomers = await this.ds.query(`
      SELECT customer_code, customer_name,
             COUNT(*) AS return_count,
             COALESCE(SUM(subtotal),0) AS total_amount
      FROM sal_return_orders
      WHERE status = 'COMPLETED' ${cond}
      GROUP BY customer_code, customer_name
      ORDER BY return_count DESC
      LIMIT 10
    `);

    const topProducts = await this.ds.query(`
      SELECT i.product_code, i.product_name,
             COUNT(*) AS return_count,
             COALESCE(SUM(i.returned_qty),0) AS total_qty,
             COALESCE(SUM(i.damaged_qty),0) AS damaged_qty
      FROM sal_return_items i
      JOIN sal_return_orders r ON r.id = i.return_order_id
      WHERE r.status = 'COMPLETED' ${cond}
      GROUP BY i.product_code, i.product_name
      ORDER BY return_count DESC
      LIMIT 10
    `);

    const [stats] = await this.ds.query(`
      SELECT
        COUNT(*) AS total_returns,
        COALESCE(SUM(subtotal),0) AS total_amount,
        COUNT(*) FILTER (WHERE return_type = 'DELIVERY_REJECT') AS delivery_reject_count,
        COUNT(*) FILTER (WHERE return_type = 'DAMAGE_RETURN')   AS damage_count,
        COALESCE(
          SUM(
            (SELECT COALESCE(SUM(damaged_qty),0) FROM sal_return_items WHERE return_order_id = r.id)
          ),0
        ) AS total_damaged_qty,
        COALESCE(
          SUM(
            (SELECT COALESCE(SUM(returned_qty),0) FROM sal_return_items WHERE return_order_id = r.id)
          ),0
        ) AS total_returned_qty
      FROM sal_return_orders r
      WHERE status = 'COMPLETED' ${cond}
        AND completed_at >= NOW() - INTERVAL '30 days'
    `);

    const damageRate = Number(stats.total_returned_qty) > 0
      ? ((Number(stats.total_damaged_qty) / Number(stats.total_returned_qty)) * 100).toFixed(1)
      : '0.0';

    return {
      topCustomers,
      topProducts,
      summary: {
        totalReturns:         Number(stats.total_returns),
        totalAmount:          Number(stats.total_amount),
        deliveryRejectCount:  Number(stats.delivery_reject_count),
        damageCount:          Number(stats.damage_count),
        damageRate:           `${damageRate}%`,
      },
    };
  }
}
