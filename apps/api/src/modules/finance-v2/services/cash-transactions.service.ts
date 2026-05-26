import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, QueryRunner } from 'typeorm';

import { FinCashTransactionEntity } from '../entities/fin-cash-transaction.entity';
import { QueryCashTransactionDto } from '../dto/cash-account.dto';

interface WriteTransactionParams {
  qr: QueryRunner;
  accountId: string;
  accountCode: string;
  accountName: string;
  companyCode: string;
  companyName: string | null;
  direction: 'IN' | 'OUT';
  sourceType: string;
  sourceId?: string | null;
  sourceNo?: string | null;
  currencyCode: string;
  amount: number;
  balanceAfter: number;
  remark?: string | null;
  createdBy?: string | null;
}

/**
 * CashTransactionsService — Append-only 流水账本
 *
 * 所有写操作必须在外部 QueryRunner 事务内调用，保证原子性。
 * 读操作（list / getStatement）可独立调用。
 */
@Injectable()
export class CashTransactionsService {
  constructor(
    @InjectRepository(FinCashTransactionEntity)
    private readonly repo: Repository<FinCashTransactionEntity>,
    private readonly ds: DataSource,
  ) {}

  // ── 编号生成 ─────────────────────────────────────────────────────────────

  private async genTxnNo(qr: QueryRunner): Promise<string> {
    const now = new Date();
    const prefix = `TXN-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const row = await qr.query(
      `SELECT COUNT(*) cnt FROM fin_cash_transactions WHERE txn_no LIKE $1`,
      [`${prefix}%`],
    );
    const seq = String(Number(row[0]?.cnt ?? 0) + 1).padStart(6, '0');
    return `${prefix}-${seq}`;
  }

  // ── 写入流水（必须在事务内） ──────────────────────────────────────────────

  async writeTransaction(p: WriteTransactionParams): Promise<FinCashTransactionEntity> {
    const txnNo = await this.genTxnNo(p.qr);

    const [inserted] = await p.qr.query(
      `INSERT INTO fin_cash_transactions
         (txn_no, account_id, account_code, account_name,
          company_code, company_name,
          direction, source_type, source_id, source_no,
          currency_code, amount, balance_after, remark, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        txnNo,
        p.accountId, p.accountCode, p.accountName,
        p.companyCode, p.companyName ?? null,
        p.direction, p.sourceType,
        p.sourceId ?? null, p.sourceNo ?? null,
        p.currencyCode,
        p.amount, p.balanceAfter,
        p.remark ?? null, p.createdBy ?? null,
      ],
    );

    return inserted as FinCashTransactionEntity;
  }

  // ── 期初余额流水（非事务，创建账户后直接调用） ─────────────────────────────

  async writeOpeningBalance(params: {
    accountId: string;
    accountCode: string;
    accountName: string;
    companyCode: string;
    companyName: string | null;
    currencyCode: string;
    amount: number;
    createdBy: string | null;
  }): Promise<void> {
    if (params.amount <= 0) return;

    const now = new Date();
    const prefix = `TXN-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const row = await this.ds.query(
      `SELECT COUNT(*) cnt FROM fin_cash_transactions WHERE txn_no LIKE $1`,
      [`${prefix}%`],
    );
    const seq = String(Number(row[0]?.cnt ?? 0) + 1).padStart(6, '0');
    const txnNo = `${prefix}-${seq}`;

    await this.ds.query(
      `INSERT INTO fin_cash_transactions
         (txn_no, account_id, account_code, account_name,
          company_code, company_name,
          direction, source_type, currency_code, amount, balance_after,
          remark, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,'IN','OPENING',$7,$8,$9,$10,$11)`,
      [
        txnNo,
        params.accountId, params.accountCode, params.accountName,
        params.companyCode, params.companyName ?? null,
        params.currencyCode,
        params.amount, params.amount,
        '期初余额',
        params.createdBy,
      ],
    );
  }

  // ── 分页查询 ──────────────────────────────────────────────────────────────

  async list(dto: QueryCashTransactionDto, companyCodes: string[] | null) {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 30;
    const offset = (page - 1) * pageSize;

    let sql = `
      SELECT id, txn_no, account_id, account_code, account_name,
             company_code, company_name,
             direction, source_type, source_id, source_no,
             currency_code, amount, balance_after,
             txn_date, remark, created_by, created_at
      FROM fin_cash_transactions
      WHERE 1=1
    `;
    const params: any[] = [];
    let idx = 1;

    if (companyCodes) {
      sql += ` AND company_code = ANY($${idx++})`;
      params.push(companyCodes);
    }
    if (dto.accountId) {
      sql += ` AND account_id = $${idx++}`;
      params.push(dto.accountId);
    }
    if (dto.companyCode) {
      sql += ` AND company_code = $${idx++}`;
      params.push(dto.companyCode);
    }
    if (dto.direction) {
      sql += ` AND direction = $${idx++}`;
      params.push(dto.direction);
    }
    if (dto.sourceType) {
      sql += ` AND source_type = $${idx++}`;
      params.push(dto.sourceType);
    }
    if (dto.dateFrom) {
      sql += ` AND txn_date >= $${idx++}`;
      params.push(dto.dateFrom);
    }
    if (dto.dateTo) {
      sql += ` AND txn_date <= $${idx++}`;
      params.push(dto.dateTo + ' 23:59:59');
    }

    const countSql = sql.replace(
      /SELECT[\s\S]+?FROM fin_cash_transactions/,
      'SELECT COUNT(*) AS cnt FROM fin_cash_transactions',
    );
    const [countRes, rows] = await Promise.all([
      this.ds.query(countSql, params),
      this.ds.query(
        sql + ` ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, pageSize, offset],
      ),
    ]);

    return {
      total: Number(countRes[0]?.cnt ?? 0),
      page,
      pageSize,
      items: rows,
    };
  }

  // ── 今日收支汇总 ─────────────────────────────────────────────────────────

  async getTodaySummary(companyCodes: string[] | null) {
    let where = `txn_date >= date_trunc('day', now()) AND txn_date < date_trunc('day', now()) + interval '1 day'`;
    const params: any[] = [];
    if (companyCodes) {
      where += ` AND company_code = ANY($1)`;
      params.push(companyCodes);
    }

    const rows = await this.ds.query(
      `SELECT direction,
              SUM(amount) total
       FROM fin_cash_transactions
       WHERE ${where}
       GROUP BY direction`,
      params,
    );

    const inRow = rows.find((r: any) => r.direction === 'IN');
    const outRow = rows.find((r: any) => r.direction === 'OUT');
    return {
      todayIn: Number(inRow?.total ?? 0),
      todayOut: Number(outRow?.total ?? 0),
    };
  }
}
