import {
  Injectable, NotFoundException, ConflictException,
  BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';

import { FinReimbursementEntity } from '../entities/fin-reimbursement.entity';
import { ApprovalEngineService } from '../../approval-engine/approval-engine.service';
import {
  QueryReimbursementDto,
  SubmitReimbursementDto,
  ApproveReimbursementDto,
  PayReimbursementDto,
  CancelReimbursementDto,
} from '../dto/expense.dto';

/**
 * ReimbursementsService — 报销台账
 *
 * Finance V2 Phase 5 — Reimbursement Runtime
 *
 * 由 Expense 审批通过后由 WorkflowBizRegistry onApproved 回调自动生成（status=PENDING）。
 *
 * 状态机：
 *   PENDING → [PENDING_APPROVAL →] APPROVED → PAID
 *   PENDING / APPROVED → CANCELLED
 *
 * pay() 事务链：
 *   1. SERIALIZABLE 事务锁定账户
 *   2. 校验余额 ≥ reimb_amount_base
 *   3. 扣减 current_balance
 *   4. 写 fin_cash_transactions（OUT, source_type=REIMBURSEMENT）
 *   5. 更新 fin_reimbursements.status=PAID + payment_txn_id
 *   6. 更新 fin_expense_requests.status=REIMBURSED
 */
@Injectable()
export class ReimbursementsService {
  constructor(
    @InjectRepository(FinReimbursementEntity)
    private readonly repo: Repository<FinReimbursementEntity>,
    @InjectDataSource()
    private readonly ds: DataSource,
    private readonly cls: ClsService,
    private readonly approvalEngine: ApprovalEngineService,
  ) {}

  // ── 内部辅助 ─────────────────────────────────────────────────────────────

  private currentUser(): any {
    return this.cls.get('user') as any;
  }

  private username(): string {
    const u = this.currentUser();
    return u?.username ?? u?.name ?? String(u?.userId ?? '');
  }

  private userCompanyCodes(user: any): string[] | null {
    if (user?.dataScope?.scopeAll) return null;
    return user?.dataScope?.companyCodes ?? [];
  }

  private assertOwnership(companyCode: string, user: any) {
    if (user?.dataScope?.scopeAll) return;
    const codes: string[] = user?.dataScope?.companyCodes ?? [];
    if (!codes.includes(companyCode)) {
      throw new ForbiddenException(`无权访问公司 ${companyCode} 的报销记录`);
    }
  }

  // ── TXN 编号（在 EntityManager 内使用）──────────────────────────────────

  private async genTxnNo(mgr: import('typeorm').EntityManager): Promise<string> {
    const now    = new Date();
    const prefix = `TXN-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [row]  = await mgr.query(
      `SELECT COUNT(*) cnt FROM fin_cash_transactions WHERE txn_no LIKE $1`,
      [`${prefix}%`],
    );
    const seq = String(Number(row?.cnt ?? 0) + 1).padStart(6, '0');
    return `${prefix}-${seq}`;
  }

  // ── 查询 ─────────────────────────────────────────────────────────────────

  async list(dto: QueryReimbursementDto, user: any) {
    const page     = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;
    const offset   = (page - 1) * pageSize;

    const companyCodes = this.userCompanyCodes(user);
    const params: any[] = [];
    const conds: string[] = [];

    if (companyCodes !== null) {
      params.push(companyCodes);
      conds.push(`company_code = ANY($${params.length})`);
    }
    if (dto.status) {
      params.push(dto.status);
      conds.push(`status = $${params.length}`);
    }
    if (dto.companyCode) {
      params.push(dto.companyCode);
      conds.push(`company_code = $${params.length}`);
    }
    if (dto.expenseRequestId) {
      params.push(dto.expenseRequestId);
      conds.push(`expense_request_id = $${params.length}`);
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    params.push(pageSize, offset);

    const [rows, [{ cnt }]] = await Promise.all([
      this.ds.query(
        `SELECT * FROM fin_reimbursements ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      ),
      this.ds.query(
        `SELECT COUNT(*) cnt FROM fin_reimbursements ${where}`,
        params.slice(0, -2),
      ),
    ]);

    return { data: rows, total: Number(cnt), page, pageSize };
  }

  async findById(id: string, user: any): Promise<any> {
    const [reimb] = await this.ds.query(
      `SELECT r.*, e.expense_type, e.expense_date, e.description
         FROM fin_reimbursements r
         LEFT JOIN fin_expense_requests e ON e.id = r.expense_request_id
        WHERE r.id = $1`,
      [id],
    );
    if (!reimb) throw new NotFoundException(`报销记录 ${id} 不存在`);
    this.assertOwnership(reimb.company_code, user);

    const wfTimeline = reimb.wf_instance_id
      ? await this.ds.query(`
          SELECT s.step_no, s.approver_role, s.approver_name, s.status, s.action,
                 s.actor_username, s.comment, s.acted_at, s.due_at
            FROM wf_approval_instance_steps s
           WHERE s.instance_id = $1
           ORDER BY s.step_no
        `, [reimb.wf_instance_id])
      : [];

    return { ...reimb, wfTimeline };
  }

  // ── 状态流转 ─────────────────────────────────────────────────────────────

  /** 提交审批（大额报销，PENDING → PENDING_APPROVAL） */
  async submit(id: string, dto: SubmitReimbursementDto, user: any): Promise<any> {
    return this.ds.transaction(async mgr => {
      const [reimb] = await mgr.query(
        `SELECT * FROM fin_reimbursements WHERE id=$1 FOR UPDATE`,
        [id],
      );
      if (!reimb) throw new NotFoundException(`报销记录 ${id} 不存在`);
      this.assertOwnership(reimb.company_code, user);
      if (reimb.status !== 'PENDING') {
        throw new ConflictException(`当前状态（${reimb.status}）不可提交`);
      }

      await mgr.query(
        `UPDATE fin_reimbursements SET status='PENDING_APPROVAL', remark=$1, updated_at=now() WHERE id=$2`,
        [dto.remark ?? reimb.remark, id],
      );

      const instance = await this.approvalEngine.startApproval({
        bizType:     'REIMBURSEMENT',
        bizId:       String(reimb.id),
        bizNo:       reimb.reimb_no,
        amount:      Number(reimb.reimb_amount_original),
        currencyCode: reimb.currency_code,
        companyCode:  reimb.company_code,
        companyName:  reimb.company_name ?? undefined,
        subject:      `报销 ${reimb.reimb_no} - ${reimb.employee_name}`,
      }, mgr);

      if (instance) {
        await mgr.query(
          `UPDATE fin_reimbursements SET wf_instance_id=$1, updated_at=now() WHERE id=$2`,
          [instance.id, id],
        );
      }

      const [updated] = await mgr.query(`SELECT * FROM fin_reimbursements WHERE id=$1`, [id]);
      return updated;
    });
  }

  /** 直接审批通过（PENDING / PENDING_APPROVAL → APPROVED） */
  async approveDirect(id: string, dto: ApproveReimbursementDto, user: any): Promise<any> {
    const reimb = await this.repo.findOne({ where: { id: id as any } });
    if (!reimb) throw new NotFoundException(`报销记录 ${id} 不存在`);
    this.assertOwnership(reimb.companyCode, user);
    if (!['PENDING', 'PENDING_APPROVAL'].includes(reimb.status)) {
      throw new ConflictException(`当前状态（${reimb.status}）不可直接审批`);
    }
    reimb.status = 'APPROVED';
    if (dto.remark) reimb.remark = dto.remark;
    return this.repo.save(reimb);
  }

  /**
   * 执行付款（PENDING / APPROVED → PAID）
   *
   * SERIALIZABLE 事务：
   *   1. 锁定 fin_reimbursements（防重复付款）
   *   2. 锁定 fin_cash_accounts（防超支）
   *   3. 校验余额 ≥ reimb_amount_base
   *   4. UPDATE fin_cash_accounts SET current_balance -= amount
   *   5. INSERT fin_cash_transactions（OUT, REIMBURSEMENT）
   *   6. UPDATE fin_reimbursements SET status=PAID
   *   7. UPDATE fin_expense_requests SET status=REIMBURSED
   */
  async pay(id: string, dto: PayReimbursementDto, user: any): Promise<any> {
    return this.ds.transaction('SERIALIZABLE', async mgr => {
      // 1. 锁定报销记录
      const [reimb] = await mgr.query(
        `SELECT * FROM fin_reimbursements WHERE id=$1 FOR UPDATE`,
        [id],
      );
      if (!reimb) throw new NotFoundException(`报销记录 ${id} 不存在`);
      this.assertOwnership(reimb.company_code, user);

      if (!['PENDING', 'APPROVED'].includes(reimb.status)) {
        throw new ConflictException(`当前状态（${reimb.status}）不可执行付款`);
      }
      if (reimb.payment_txn_id) {
        throw new ConflictException('该报销已付款，不可重复操作（payment_txn_id 已存在）');
      }

      // 2. 锁定现金账户
      const [acct] = await mgr.query(
        `SELECT * FROM fin_cash_accounts WHERE id=$1 AND status='ACTIVE' FOR UPDATE`,
        [dto.cashAccountId],
      );
      if (!acct) {
        throw new NotFoundException(`现金账户 ${dto.cashAccountId} 不存在或已冻结`);
      }

      // 3. 校验余额（Base Currency）
      const payAmount = Number(reimb.reimb_amount_base);
      if (Number(acct.current_balance) < payAmount) {
        throw new BadRequestException(
          `账户余额不足：当前 ¥${Number(acct.current_balance).toFixed(2)}，需要 ¥${payAmount.toFixed(2)}`,
        );
      }

      // 4. 扣减余额
      const [updatedAcct] = await mgr.query(
        `UPDATE fin_cash_accounts
            SET current_balance = current_balance - $1, updated_at = now()
          WHERE id = $2
          RETURNING current_balance`,
        [payAmount, dto.cashAccountId],
      );
      const balanceAfter = Number(updatedAcct.current_balance);

      // 5. 写流水（OUT）
      const txnNo = await this.genTxnNo(mgr);
      const [txn] = await mgr.query(`
        INSERT INTO fin_cash_transactions (
          txn_no, account_id, account_code, account_name,
          company_code, company_name,
          direction, source_type, source_id, source_no,
          currency_code, amount, balance_after, remark, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,'OUT','REIMBURSEMENT',$7,$8,$9,$10,$11,$12,$13)
        RETURNING *
      `, [
        txnNo,
        acct.id, acct.account_code, acct.account_name,
        acct.company_code, acct.company_name ?? null,
        reimb.id, reimb.reimb_no,
        reimb.currency_code,
        payAmount,
        balanceAfter,
        dto.remark ?? `报销付款 ${reimb.reimb_no}`,
        this.username(),
      ]);

      // 6. 更新报销记录
      await mgr.query(`
        UPDATE fin_reimbursements
           SET status='PAID',
               cash_account_id=$1, cash_account_code=$2,
               payment_txn_id=$3, remark=$4, updated_at=now()
         WHERE id=$5
      `, [
        acct.id, acct.account_code,
        txn.id,
        dto.remark ?? reimb.remark,
        id,
      ]);

      // 7. 更新费用申请状态
      await mgr.query(
        `UPDATE fin_expense_requests SET status='REIMBURSED', updated_at=now() WHERE id=$1`,
        [reimb.expense_request_id],
      );

      const [updated] = await mgr.query(`SELECT * FROM fin_reimbursements WHERE id=$1`, [id]);
      return { ...updated, txnNo, balanceAfter };
    });
  }

  /** 取消报销（PENDING / APPROVED → CANCELLED） */
  async cancel(id: string, dto: CancelReimbursementDto, user: any): Promise<void> {
    const reimb = await this.repo.findOne({ where: { id: id as any } });
    if (!reimb) throw new NotFoundException(`报销记录 ${id} 不存在`);
    this.assertOwnership(reimb.companyCode, user);
    if (!['PENDING', 'APPROVED'].includes(reimb.status)) {
      throw new ConflictException(`当前状态（${reimb.status}）不允许取消`);
    }
    await this.repo.update(id, { status: 'CANCELLED', remark: dto.remark ?? reimb.remark ?? null });
  }

  // ── 汇总 ─────────────────────────────────────────────────────────────────

  async getSummary(user: any): Promise<{
    totalReimb:   number;
    pendingReimb: number;
    approvedReimb: number;
    paidReimb:    number;
    paidToday:    number;
    paidAmountToday: number;
  }> {
    const companyCodes = this.userCompanyCodes(user);
    const scopeFilter  = companyCodes !== null ? `AND company_code = ANY($1)` : '';
    const params       = companyCodes !== null ? [companyCodes] : [];

    const [[row]] = await Promise.all([
      this.ds.query(`
        SELECT
          COUNT(*)                                                 AS total_reimb,
          COUNT(*) FILTER (WHERE status='PENDING')                AS pending_reimb,
          COUNT(*) FILTER (WHERE status='APPROVED')               AS approved_reimb,
          COUNT(*) FILTER (WHERE status='PAID')                   AS paid_reimb,
          COUNT(*) FILTER (WHERE status='PAID' AND DATE(updated_at)=CURRENT_DATE) AS paid_today,
          COALESCE(SUM(reimb_amount_base) FILTER (WHERE status='PAID' AND DATE(updated_at)=CURRENT_DATE), 0) AS paid_amount_today
        FROM fin_reimbursements
        WHERE 1=1 ${scopeFilter}
      `, params),
    ]);

    return {
      totalReimb:      Number(row?.total_reimb    ?? 0),
      pendingReimb:    Number(row?.pending_reimb   ?? 0),
      approvedReimb:   Number(row?.approved_reimb  ?? 0),
      paidReimb:       Number(row?.paid_reimb      ?? 0),
      paidToday:       Number(row?.paid_today       ?? 0),
      paidAmountToday: Number(row?.paid_amount_today ?? 0),
    };
  }
}
