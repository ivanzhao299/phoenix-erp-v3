import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository, InjectEntityManager } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { StoreDailyCloseEntity } from './entities/store-daily-close.entity';

@Injectable()
export class StoreService {
  constructor(
    @InjectRepository(StoreDailyCloseEntity)
    private readonly dailyCloseRepo: Repository<StoreDailyCloseEntity>,
    @InjectEntityManager() private readonly em: EntityManager,
  ) {}

  async submitDailyClose(dto: Partial<StoreDailyCloseEntity>): Promise<StoreDailyCloseEntity> {
    const record = this.dailyCloseRepo.create(dto);
    record.status = 'DRAFT';
    return await this.dailyCloseRepo.save(record);
  }

  async updateDailyClose(id: number, dto: Partial<StoreDailyCloseEntity>): Promise<StoreDailyCloseEntity> {
    const record = await this.dailyCloseRepo.findOne({ where: { id } });
    if (!record) throw new NotFoundException(`Daily close record ${id} not found`);

    // ==========================================
    // 强制状态机锁: 依据 §11.1 sys_doc_state_lock 配置
    // STORE_DAILY_CLOSE 在 CLOSED 状态下锁定所有核心金额
    // ==========================================
    if (record.status === 'CLOSED') {
      throw new ForbiddenException(`[State Machine Lock] Cannot modify amount when status is CLOSED`);
    }

    Object.assign(record, dto);
    return await this.dailyCloseRepo.save(record);
  }

  async closeStoreDay(id: number): Promise<StoreDailyCloseEntity> {
    // 提交结转给财务审核
    return this.updateDailyClose(id, { status: 'CLOSED' } as any);
  }

  // ════════════════════════════════════════════════════════════════════════
  // V2 fidelity backfill — 门店日结双账联动
  // 来源：_archive/phoenix-backend-v2-sqlite/src/routes/dailyClose.js
  //
  // 业务闭环：
  //   1. 聚合 pos_sales 当日 → total/cash/qr/discount
  //   2. INSERT daily_close (close_no, status='SUBMITTED')
  //   3. INSERT acc_ledger SALES_REVENUE 总收入
  //   4. cash_diff != 0 → INSERT acc_ledger CASH_OVERAGE/SHORTAGE
  //   5. INSERT fin_transactions REV-STORE CREDIT (财务总账)
  //
  // SEC-04: store_code/operator 优先取自 JWT Token
  // 幂等: 同 store+date 已 SUBMITTED 拒绝再次提交
  // ════════════════════════════════════════════════════════════════════════

  /** 日结预览 — 聚合当日 pos_sales (V2 fidelity)
   * 注意：close_date 默认走 PG 的 CURRENT_DATE (local TZ)，与 pos_sales.created_at 一致；
   * 避免用 Node `new Date().toISOString()` (UTC) 导致跨日 mismatch */
  async previewDailyClose(query: any, user: any) {
    const tokenStore: string | undefined = user?.storeCode || user?.store_code;
    const storeCode =
      tokenStore && tokenStore !== 'ALL' ? tokenStore : (query?.store_code || 'ST-VTE-001');
    let date: string;
    if (query?.close_date) {
      date = String(query.close_date);
    } else {
      const [row] = await this.em.query(`SELECT to_char(CURRENT_DATE,'YYYY-MM-DD') AS d`);
      date = row?.d || new Date().toISOString().slice(0, 10);
    }

    const existing = await this.em.query(
      `SELECT id FROM daily_close WHERE store_code = $1 AND close_date = $2 AND status = 'SUBMITTED' LIMIT 1`,
      [storeCode, date],
    );
    if (existing.length > 0) {
      throw new BadRequestException(`${storeCode} ${date} 已完成日结，不可重复提交`);
    }

    const [summary] = await this.em.query(
      `SELECT
         COALESCE(SUM(net_amount),0)::float8 AS total_sales,
         COUNT(*)::int                        AS total_transactions,
         COALESCE(SUM(CASE WHEN pay_method='CASH' THEN net_amount ELSE 0 END),0)::float8 AS cash_sales,
         COALESCE(SUM(CASE WHEN pay_method IN ('QR_CODE','QR','CARD') THEN net_amount ELSE 0 END),0)::float8 AS qr_sales,
         COALESCE(SUM(discount_amount),0)::float8 AS discount_total
       FROM pos_sales WHERE store_code = $1 AND substr(created_at::text,1,10) = $2`,
      [storeCode, date],
    );

    const items: Array<any> = await this.em.query(
      `SELECT si.product_code,
              MAX(si.product_name_zh) AS product_name_zh,
              MAX(si.product_name_lo) AS product_name_lo,
              SUM(si.qty)::int        AS total_qty,
              SUM(si.subtotal)::float8 AS total_amount
         FROM pos_sale_items si
         JOIN pos_sales s ON s.sale_no = si.sale_no
        WHERE s.store_code = $1 AND substr(s.created_at::text,1,10) = $2
        GROUP BY si.product_code
        ORDER BY total_amount DESC`,
      [storeCode, date],
    );

    return {
      code: 200,
      data: { ...summary, close_date: date, store_code: storeCode, items },
    };
  }

  /** 日结提交 — 原子事务写入 daily_close + acc_ledger + fin_transactions (V2 fidelity)
   * close_date 同 preview：默认走 PG CURRENT_DATE (local) */
  async submitV2DailyClose(body: any, user: any) {
    const tokenStore: string | undefined = user?.storeCode || user?.store_code;
    const storeCode =
      tokenStore && tokenStore !== 'ALL' ? tokenStore : (body?.store_code || 'ST-VTE-001');
    let date: string;
    if (body?.close_date) {
      date = String(body.close_date);
    } else {
      const [row] = await this.em.query(`SELECT to_char(CURRENT_DATE,'YYYY-MM-DD') AS d`);
      date = row?.d || new Date().toISOString().slice(0, 10);
    }
    const operator: string = user?.username || body?.operator || 'SYS';
    const cashActual = Number(body?.cash_actual) || 0;
    const note: string = body?.note || '';

    return await this.em.transaction(async (mgr) => {
      // 幂等：同 store+date 已 SUBMITTED 拒绝
      const existing = await mgr.query(
        `SELECT id FROM daily_close WHERE store_code = $1 AND close_date = $2 AND status = 'SUBMITTED' LIMIT 1`,
        [storeCode, date],
      );
      if (existing.length > 0) {
        throw new BadRequestException(`${storeCode} ${date} 已完成日结，不可重复提交`);
      }

      const [summary] = await mgr.query(
        `SELECT
           COALESCE(SUM(net_amount),0)::float8 AS total_sales,
           COUNT(*)::int                        AS total_transactions,
           COALESCE(SUM(CASE WHEN pay_method='CASH' THEN net_amount ELSE 0 END),0)::float8 AS cash_sales,
           COALESCE(SUM(CASE WHEN pay_method IN ('QR_CODE','QR','CARD') THEN net_amount ELSE 0 END),0)::float8 AS qr_sales,
           COALESCE(SUM(discount_amount),0)::float8 AS discount_total
         FROM pos_sales WHERE store_code = $1 AND substr(created_at::text,1,10) = $2`,
        [storeCode, date],
      );

      const totalSales = Number(summary?.total_sales) || 0;
      const cashSales = Number(summary?.cash_sales) || 0;
      const qrSales = Number(summary?.qr_sales) || 0;
      const discountTotal = Number(summary?.discount_total) || 0;
      const totalTxn = Number(summary?.total_transactions) || 0;
      const cashDiff = cashActual - cashSales;

      const closeNo = `DCL-${date.replace(/-/g, '')}-${storeCode}`;

      // SELECT-then-UPDATE-or-INSERT（不依赖 RETURNING/rowCount 解析）
      const priorRows = await mgr.query(
        `SELECT id FROM daily_close WHERE close_no = $1 LIMIT 1`,
        [closeNo],
      );
      if (Array.isArray(priorRows) && priorRows.length > 0) {
        await mgr.query(
          `UPDATE daily_close
              SET total_sales = $1, total_transactions = $2,
                  cash_sales = $3, qr_sales = $4, discount_total = $5,
                  cash_actual = $6, cash_diff = $7, note = $8,
                  status = 'SUBMITTED', submitted_at = now()::text,
                  operator = $9
            WHERE close_no = $10`,
          [
            totalSales, totalTxn, cashSales, qrSales, discountTotal,
            cashActual, cashDiff, note, operator, closeNo,
          ],
        );
      } else {
        await mgr.query(
          `INSERT INTO daily_close
             (close_no, store_code, close_date, operator,
              total_sales, total_transactions, cash_sales, qr_sales, discount_total,
              cash_actual, cash_diff, note, status, submitted_at, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'SUBMITTED', now()::text, now()::text)`,
          [
            closeNo, storeCode, date, operator,
            totalSales, totalTxn, cashSales, qrSales, discountTotal,
            cashActual, cashDiff, note,
          ],
        );
      }

      // INSERT acc_ledger SALES_REVENUE
      await mgr.query(
        `INSERT INTO acc_ledger (store_code, ref_no, ledger_type, amount, balance_after, note, created_at)
         VALUES ($1, $2, 'SALES_REVENUE', $3, $4, $5, now()::text)`,
        [storeCode, closeNo, totalSales, totalSales, `门店日结上报总收入 (含折扣前)`],
      );

      // INSERT acc_ledger CASH_OVERAGE/SHORTAGE if cash_diff != 0
      if (cashDiff !== 0) {
        await mgr.query(
          `INSERT INTO acc_ledger (store_code, ref_no, ledger_type, amount, balance_after, note, created_at)
           VALUES ($1, $2, $3, $4, 0, $5, now()::text)`,
          [
            storeCode, closeNo,
            cashDiff > 0 ? 'CASH_OVERAGE' : 'CASH_SHORTAGE',
            Math.abs(cashDiff),
            `日结现金差异: ${cashDiff > 0 ? '盘盈' : '盘亏'} - 备注: ${note || '无'}`,
          ],
        );
      }

      // INSERT fin_transactions REV-STORE CREDIT (财务总账双账联动) — 直接 COMPLETED 入账
      await mgr.query(
        `INSERT INTO fin_transactions (account_code, type, amount, status, ref_no, store_code, operator, note, created_at)
         VALUES ('REV-STORE', 'CREDIT', $1, 'COMPLETED', $2, $3, $4, $5, now())`,
        [
          totalSales, closeNo, storeCode, operator,
          `门店${storeCode}日结汇总收入 ${date}`,
        ],
      );

      return {
        code: 200,
        msg: '日结提交成功！数据已上报总部并写入财务总账',
        data: {
          close_no: closeNo,
          store_code: storeCode,
          close_date: date,
          total_sales: totalSales,
          cash_sales: cashSales,
          qr_sales: qrSales,
          cash_actual: cashActual,
          cash_diff: cashDiff,
          ledger_entries: cashDiff !== 0 ? 2 : 1,
          fin_transactions: 1,
        },
      };
    });
  }

  /** 日结历史查询 */
  async listDailyClose(query: any, user: any) {
    const tokenStore: string | undefined = user?.storeCode || user?.store_code;
    const storeCode =
      tokenStore && tokenStore !== 'ALL' ? tokenStore : query?.store_code;
    const rows = storeCode
      ? await this.em.query(
          `SELECT * FROM daily_close WHERE store_code = $1 ORDER BY close_date DESC LIMIT 30`,
          [storeCode],
        )
      : await this.em.query(`SELECT * FROM daily_close ORDER BY close_date DESC LIMIT 30`);
    return { code: 200, data: rows };
  }
}
