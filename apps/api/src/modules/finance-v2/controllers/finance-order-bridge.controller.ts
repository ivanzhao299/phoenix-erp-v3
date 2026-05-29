import {
  Controller, Post, Get, Body, Param,
  UseGuards, Logger,
} from '@nestjs/common';
import { InjectDataSource }         from '@nestjs/typeorm';
import { DataSource }               from 'typeorm';
import { MenuGuard, RequireMenu }   from '../../../common/guards/menu.guard';
import { DataScopeGuard }           from '../../org/guards/data-scope.guard';

/**
 * Finance Order Bridge Controller
 *
 * 路由前缀：/api/finance（V1 兼容路径）
 *
 * 为 E2E 测试和旧订单模块提供两个 V1 兼容接口：
 *   POST /api/finance/income           — 收款入账（更新 fin_accounts + fin_transactions + ord_orders）
 *   GET  /api/finance/ar-aging/customer/:customerCode — 按客户查 AR 账龄
 *
 * 底层仍读写 V1 fin_accounts / fin_transactions / ord_orders 表（由 generic-crud 自动建表）。
 */
@Controller('api/finance')
@UseGuards(MenuGuard, DataScopeGuard)
export class FinanceOrderBridgeController {
  private readonly logger = new Logger(FinanceOrderBridgeController.name);

  constructor(
    @InjectDataSource()
    private readonly ds: DataSource,
  ) {}

  // ── POST /api/finance/income ──────────────────────────────────────────────
  /**
   * 收款入账（V1 兼容桥接）
   *
   * Body: { account_code, amount, ref_no, note }
   *
   * 效果：
   *   1. UPSERT fin_accounts：账户不存在则创建，存在则累加 balance
   *   2. INSERT fin_transactions（type=CREDIT, status=COMPLETED）
   *   3. UPDATE ord_orders.paid_amount（ref_no = order_no）
   */
  @Post('income')
  @RequireMenu('MENU_FIN2_AR', 'C')
  async registerIncome(
    @Body() body: {
      account_code: string;
      amount:       number;
      ref_no:       string;
      note?:        string;
    },
  ) {
    const { account_code, amount, ref_no, note } = body;
    const runner = this.ds.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();

    try {
      // 1. UPSERT fin_accounts
      await runner.query(
        `INSERT INTO fin_accounts (account_code, account_name, balance)
         VALUES ($1, $1, $2)
         ON CONFLICT (account_code)
         DO UPDATE SET balance = fin_accounts.balance + $2,
                       updated_at = CURRENT_TIMESTAMP`,
        [account_code, amount],
      );

      // 2. INSERT fin_transactions
      await runner.query(
        `INSERT INTO fin_transactions
           (type, amount, status, account_code, ref_no, note, created_at)
         VALUES ('CREDIT', $1, 'COMPLETED', $2, $3, $4, CURRENT_TIMESTAMP)`,
        [amount, account_code, ref_no, note ?? `收款 ${ref_no}`],
      );

      // 3. UPDATE ord_orders.paid_amount（若订单存在）
      await runner.query(
        `UPDATE ord_orders
         SET paid_amount  = COALESCE(paid_amount, 0) + $1,
             updated_at   = CURRENT_TIMESTAMP
         WHERE order_no = $2`,
        [amount, ref_no],
      );

      await runner.commitTransaction();
      this.logger.log(`[Bridge] income registered account=${account_code} amount=${amount} ref=${ref_no}`);
      return { code: 200, message: 'income registered', account_code, amount, ref_no };
    } catch (err) {
      await runner.rollbackTransaction();
      throw err;
    } finally {
      await runner.release();
    }
  }

  // ── GET /api/finance/ar-aging/customer/:customerCode ─────────────────────
  /**
   * 按客户查 AR 账龄（V1 兼容桥接）
   *
   * 返回该客户未全额付款的 ord_orders 列表（paid_amount < total_amount）
   */
  @Get('ar-aging/customer/:customerCode')
  @RequireMenu('MENU_FIN2_AR', 'V')
  async arAgingByCustomer(
    @Param('customerCode') customerCode: string,
  ) {
    const rows = await this.ds.query(
      `SELECT order_no,
              customer_code,
              customer_name,
              total_amount,
              COALESCE(paid_amount, 0)                        AS paid_amount,
              total_amount - COALESCE(paid_amount, 0)         AS outstanding,
              status,
              created_at
       FROM  ord_orders
       WHERE customer_code = $1
         AND COALESCE(paid_amount, 0) < total_amount
         AND status NOT IN ('CANCELLED', 'REJECTED')
       ORDER BY created_at DESC`,
      [customerCode],
    );
    return { customerCode, count: rows.length, items: rows };
  }
}
