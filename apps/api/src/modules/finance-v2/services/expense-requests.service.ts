import {
  Injectable, NotFoundException, ConflictException,
  BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';

import { FinExpenseRequestEntity } from '../entities/fin-expense-request.entity';
import { ApprovalEngineService } from '../../approval-engine/approval-engine.service';
import {
  CreateExpenseRequestDto,
  UpdateExpenseRequestDto,
  QueryExpenseRequestDto,
  SubmitExpenseRequestDto,
  CancelExpenseRequestDto,
} from '../dto/expense.dto';

/**
 * ExpenseRequestsService — 费用申请台账
 *
 * Finance V2 Phase 5 — Expense Runtime（Workflow Native）
 *
 * 状态机：
 *   DRAFT → PENDING_APPROVAL → APPROVED → REIMBURSED
 *                            → REJECTED
 *   DRAFT / REJECTED → CANCELLED
 *
 * 完全 Workflow Native：
 *   - submit() 强制走 ApprovalEngine，不允许绕过
 *   - 审批通过由 WorkflowBizRegistry onApproved 回调自动生成 Reimbursement
 */
@Injectable()
export class ExpenseRequestsService {
  constructor(
    @InjectRepository(FinExpenseRequestEntity)
    private readonly repo: Repository<FinExpenseRequestEntity>,
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
      throw new ForbiddenException(`无权访问公司 ${companyCode} 的费用申请`);
    }
  }

  // ── 编号生成 ─────────────────────────────────────────────────────────────

  private async genExpenseNo(mgr: import('typeorm').EntityManager): Promise<string> {
    const now = new Date();
    const prefix = `EXP-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`;
    await mgr.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [prefix]);
    const [row] = await mgr.query(
      `SELECT MAX(expense_no) AS max FROM fin_expense_requests WHERE expense_no LIKE $1`,
      [`${prefix}%`],
    );
    let seq = 1;
    const max: string | null = row?.max ?? null;
    if (max) {
      const last = parseInt(max.slice(prefix.length), 10);
      if (!isNaN(last)) seq = last + 1;
    }
    return `${prefix}${String(seq).padStart(5, '0')}`;
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────

  /** 手工创建草稿（直接填写字段） */
  async create(dto: CreateExpenseRequestDto, user: any): Promise<FinExpenseRequestEntity> {
    this.assertOwnership(dto.companyCode, user);
    const u = user;

    return this.ds.transaction(async mgr => {
      const expenseNo = await this.genExpenseNo(mgr);
      const amountBase = dto.amountBase ?? dto.amountOriginal * (dto.exchangeRate ?? 1);

      const [inserted] = await mgr.query<any[]>(`
        INSERT INTO fin_expense_requests (
          expense_no, requester_id, requester_name,
          company_code, company_name, project_code, project_name,
          expense_type, currency_code, amount_original, exchange_rate, amount_base, base_currency,
          expense_date, description, attachment_urls,
          status, remark, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'CNY',$13,$14,$15::jsonb,'DRAFT',$16,now(),now())
        RETURNING *
      `, [
        expenseNo,
        u?.userId ?? u?.id ?? null,
        u?.name ?? u?.username ?? null,
        dto.companyCode, dto.companyName ?? null,
        dto.projectCode ?? null, dto.projectName ?? null,
        dto.expenseType, dto.currencyCode,
        dto.amountOriginal, dto.exchangeRate ?? 1, amountBase,
        dto.expenseDate ?? null, dto.description ?? null,
        dto.attachmentUrls ? JSON.stringify(dto.attachmentUrls) : null,
        dto.remark ?? null,
      ]);
      // bigint → number：node-postgres 将 bigint 序列化为字符串，显式转换确保 JSON 输出为数字
      return { ...inserted, id: Number(inserted.id) };
    });
  }

  /**
   * 从 Workflow Form Submission 创建费用申请（Workflow Native 路径）。
   *
   * 调用方：POST /api/v2/finance/expenses/from-submission
   * 前置：前端已通过 POST /api/v2/workflow/forms/EXPENSE_REQUEST_FORM/submit 提交表单。
   *
   * 流程：
   *   1. 查询 wf_form_submission（status=SUBMITTED）
   *   2. 解析 data_json → 生成 fin_expense_request（status=PENDING_APPROVAL）
   *   3. 调用 ApprovalEngine.startApproval()
   *   4. 回写 wf_form_submission.workflow_instance_id / status
   */
  async createFromFormSubmission(submissionId: string, user: any): Promise<any> {
    const [sub] = await this.ds.query(`
      SELECT s.*,
             fd.biz_type AS fd_biz_type,
             fd.name     AS form_name,
             fv.schema_json
        FROM wf_form_submission s
        JOIN wf_form_version    fv ON fv.id = s.form_version_id
        JOIN wf_form_definition fd ON fd.id = fv.form_id
       WHERE s.id = $1
    `, [submissionId]);

    if (!sub) throw new NotFoundException(`提交记录 ID=${submissionId} 不存在`);
    if (sub.status !== 'SUBMITTED') {
      throw new BadRequestException(`提交记录状态为 "${sub.status}"，无法重复创建费用申请`);
    }

    const data: Record<string, any> = sub.data_json ?? {};

    const companyCode: string = data['companyCode'] ?? sub.company_code ?? '';
    if (!companyCode) throw new BadRequestException('表单数据缺少 companyCode');
    this.assertOwnership(companyCode, user);

    return this.ds.transaction(async mgr => {
      const expenseNo = await this.genExpenseNo(mgr);
      const amountOriginal = Number(data['amount'] ?? data['amountOriginal'] ?? 0);
      const exchangeRate   = Number(data['exchangeRate'] ?? 1);
      const amountBase     = Number(data['amountBase'] ?? amountOriginal * exchangeRate);

      const [inserted] = await mgr.query<any[]>(`
        INSERT INTO fin_expense_requests (
          expense_no, requester_id, requester_name,
          company_code, company_name, project_code, project_name,
          expense_type, currency_code, amount_original, exchange_rate, amount_base, base_currency,
          expense_date, description, attachment_urls,
          form_submission_id, status, remark, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'CNY',$13,$14,$15::jsonb,$16,'PENDING_APPROVAL',null,now(),now())
        RETURNING *
      `, [
        expenseNo,
        user?.userId ?? user?.id ?? null,
        user?.name ?? user?.username ?? null,
        companyCode, data['companyName'] ?? sub.company_name ?? null,
        data['projectCode'] ?? sub.project_code ?? null,
        data['projectName'] ?? sub.project_name ?? null,
        data['expenseType'] ?? 'OTHER',
        data['currencyCode'] ?? 'CNY',
        amountOriginal, exchangeRate, amountBase,
        data['expenseDate'] ?? null,
        data['description'] ?? null,
        data['attachmentUrls'] ? JSON.stringify(data['attachmentUrls']) : null,
        submissionId,
      ]);

      const exp = inserted;

      // 启动审批流
      const instance = await this.approvalEngine.startApproval({
        bizType:     'EXPENSE_REQUEST',
        bizId:       String(exp.id),
        bizNo:       exp.expense_no,
        amount:      amountOriginal,
        currencyCode: exp.currency_code,
        companyCode,
        companyName:  data['companyName'] ?? sub.company_name ?? undefined,
        projectCode:  data['projectCode'] ?? sub.project_code ?? undefined,
        projectName:  data['projectName'] ?? sub.project_name ?? undefined,
        subject:      `费用申请 ${exp.expense_no} - ${data['expenseType'] ?? 'OTHER'}`,
      }, mgr);

      if (instance) {
        await mgr.query(
          `UPDATE fin_expense_requests SET wf_instance_id=$1, updated_at=now() WHERE id=$2`,
          [instance.id, exp.id],
        );
        // 回写 wf_form_submission
        await mgr.query(`
          UPDATE wf_form_submission
             SET biz_type='EXPENSE_REQUEST', biz_id=$1, biz_no=$2,
                 workflow_instance_id=$3, status='PENDING_APPROVAL', updated_at=now()
           WHERE id=$4
        `, [exp.id, exp.expense_no, instance.id, submissionId]);
      } else {
        // 无规则 → 自动通过，onApproved 已在 startApproval 内被调用
        await mgr.query(
          `UPDATE wf_form_submission SET biz_type='EXPENSE_REQUEST', biz_id=$1, biz_no=$2, status='APPROVED', updated_at=now() WHERE id=$3`,
          [exp.id, exp.expense_no, submissionId],
        );
      }

      return this.findByIdRaw(String(exp.id), mgr);
    });
  }

  /** 更新草稿（仅 DRAFT 状态） */
  async update(id: string, dto: UpdateExpenseRequestDto, user: any): Promise<FinExpenseRequestEntity> {
    const exp = await this.repo.findOne({ where: { id: id as any } });
    if (!exp) throw new NotFoundException(`费用申请 ${id} 不存在`);
    this.assertOwnership(exp.companyCode, user);
    if (exp.status !== 'DRAFT') throw new ConflictException('只有草稿状态的费用申请可以修改');

    if (dto.expenseType)    exp.expenseType    = dto.expenseType;
    if (dto.currencyCode)   exp.currencyCode   = dto.currencyCode;
    if (dto.amountOriginal !== undefined) exp.amountOriginal = String(dto.amountOriginal);
    if (dto.exchangeRate   !== undefined) exp.exchangeRate   = String(dto.exchangeRate);
    if (dto.amountBase     !== undefined) exp.amountBase     = String(dto.amountBase);
    if (dto.projectCode    !== undefined) exp.projectCode    = dto.projectCode ?? null;
    if (dto.projectName    !== undefined) exp.projectName    = dto.projectName ?? null;
    if (dto.expenseDate    !== undefined) exp.expenseDate    = dto.expenseDate ?? null;
    if (dto.description    !== undefined) exp.description    = dto.description ?? null;
    if (dto.attachmentUrls !== undefined) exp.attachmentUrls = dto.attachmentUrls ?? null;
    if (dto.remark         !== undefined) exp.remark         = dto.remark ?? null;

    return this.repo.save(exp);
  }

  /**
   * 提交审批（DRAFT → PENDING_APPROVAL）。
   *
   * Workflow Native：强制走 ApprovalEngine，不允许绕过。
   */
  async submit(id: string, dto: SubmitExpenseRequestDto, user: any): Promise<any> {
    return this.ds.transaction(async mgr => {
      const [exp] = await mgr.query<any[]>(
        `SELECT * FROM fin_expense_requests WHERE id=$1 FOR UPDATE`,
        [id],
      );
      if (!exp) throw new NotFoundException(`费用申请 ${id} 不存在`);
      this.assertOwnership(exp.company_code, user);
      if (exp.status !== 'DRAFT') {
        throw new ConflictException('只有草稿状态的费用申请可以提交');
      }

      if (dto.remark) {
        await mgr.query(`UPDATE fin_expense_requests SET remark=$1, updated_at=now() WHERE id=$2`, [dto.remark, id]);
      }

      await mgr.query(
        `UPDATE fin_expense_requests SET status='PENDING_APPROVAL', updated_at=now() WHERE id=$1`,
        [id],
      );

      const instance = await this.approvalEngine.startApproval({
        bizType:     'EXPENSE_REQUEST',
        bizId:       String(exp.id),
        bizNo:       exp.expense_no,
        amount:      Number(exp.amount_original),
        currencyCode: exp.currency_code,
        companyCode:  exp.company_code,
        companyName:  exp.company_name ?? undefined,
        projectCode:  exp.project_code ?? undefined,
        projectName:  exp.project_name ?? undefined,
        subject:      `费用申请 ${exp.expense_no} - ${exp.expense_type}`,
      }, mgr);

      if (instance) {
        await mgr.query(
          `UPDATE fin_expense_requests SET wf_instance_id=$1, updated_at=now() WHERE id=$2`,
          [instance.id, id],
        );
      }

      return this.findByIdRaw(id, mgr);
    });
  }

  /** 取消（DRAFT / REJECTED 可取消） */
  async cancel(id: string, dto: CancelExpenseRequestDto, user: any): Promise<void> {
    const exp = await this.repo.findOne({ where: { id: id as any } });
    if (!exp) throw new NotFoundException(`费用申请 ${id} 不存在`);
    this.assertOwnership(exp.companyCode, user);
    if (!['DRAFT', 'REJECTED'].includes(exp.status)) {
      throw new ConflictException(`当前状态（${exp.status}）不允许取消`);
    }
    await this.repo.update(id, { status: 'CANCELLED', remark: dto.remark ?? exp.remark ?? null });
  }

  // ── 查询 ─────────────────────────────────────────────────────────────────

  async list(dto: QueryExpenseRequestDto, user: any) {
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
    if (dto.expenseType) {
      params.push(dto.expenseType);
      conds.push(`expense_type = $${params.length}`);
    }
    if (dto.companyCode) {
      params.push(dto.companyCode);
      conds.push(`company_code = $${params.length}`);
    }
    if (dto.keyword) {
      params.push(`%${dto.keyword}%`);
      conds.push(`(expense_no ILIKE $${params.length} OR requester_name ILIKE $${params.length} OR description ILIKE $${params.length})`);
    }
    if (dto.dateFrom) {
      params.push(dto.dateFrom);
      conds.push(`expense_date >= $${params.length}`);
    }
    if (dto.dateTo) {
      params.push(dto.dateTo);
      conds.push(`expense_date <= $${params.length}`);
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    params.push(pageSize, offset);

    const [rows, [{ cnt }]] = await Promise.all([
      this.ds.query(
        `SELECT * FROM fin_expense_requests ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      ),
      this.ds.query(
        `SELECT COUNT(*) cnt FROM fin_expense_requests ${where}`,
        params.slice(0, -2),
      ),
    ]);

    return { data: rows, total: Number(cnt), page, pageSize };
  }

  async findById(id: string, user: any): Promise<any> {
    const [exp] = await this.ds.query(
      `SELECT * FROM fin_expense_requests WHERE id = $1`,
      [id],
    );
    if (!exp) throw new NotFoundException(`费用申请 ${id} 不存在`);
    this.assertOwnership(exp.company_code, user);

    const [reimbursements, wfTimeline] = await Promise.all([
      this.ds.query(
        `SELECT * FROM fin_reimbursements WHERE expense_request_id = $1 ORDER BY created_at DESC`,
        [id],
      ),
      exp.wf_instance_id
        ? this.ds.query(`
            SELECT s.step_no, s.approver_role, s.approver_name, s.status, s.action,
                   s.actor_username, s.comment, s.acted_at, s.due_at,
                   i.instance_no, i.status AS instance_status
              FROM wf_approval_instance_steps s
              JOIN wf_approval_instances i ON i.id = s.instance_id
             WHERE i.id = $1
             ORDER BY s.step_no
          `, [exp.wf_instance_id])
        : Promise.resolve([]),
    ]);

    return { ...exp, reimbursements, wfTimeline };
  }

  private async findByIdRaw(id: string, mgr: import('typeorm').EntityManager): Promise<any> {
    const [exp] = await mgr.query(`SELECT * FROM fin_expense_requests WHERE id=$1`, [id]);
    return exp;
  }

  // ── 汇总（Dashboard KPI）──────────────────────────────────────────────────

  async getSummary(user: any): Promise<{
    totalExpenses:      number;
    pendingApproval:    number;
    approved:           number;
    reimbursed:         number;
    totalAmountOriginal: number;
    pendingReimb:       number;
    paidToday:          number;
  }> {
    const companyCodes = this.userCompanyCodes(user);
    const scopeFilter  = companyCodes !== null
      ? `AND company_code = ANY($1)`
      : '';
    const params = companyCodes !== null ? [companyCodes] : [];

    const [[expRow], [reimbRow]] = await Promise.all([
      this.ds.query(`
        SELECT
          COUNT(*)                                             AS total_expenses,
          COUNT(*) FILTER (WHERE status='PENDING_APPROVAL')   AS pending_approval,
          COUNT(*) FILTER (WHERE status='APPROVED')           AS approved,
          COUNT(*) FILTER (WHERE status='REIMBURSED')         AS reimbursed,
          COALESCE(SUM(amount_original),0)                    AS total_amount_original
        FROM fin_expense_requests
        WHERE 1=1 ${scopeFilter}
      `, params),
      this.ds.query(`
        SELECT
          COUNT(*) FILTER (WHERE status IN ('PENDING','APPROVED')) AS pending_reimb,
          COUNT(*) FILTER (WHERE status='PAID' AND DATE(updated_at)=CURRENT_DATE) AS paid_today
        FROM fin_reimbursements
        WHERE 1=1 ${scopeFilter}
      `, params),
    ]);

    return {
      totalExpenses:       Number(expRow?.total_expenses   ?? 0),
      pendingApproval:     Number(expRow?.pending_approval ?? 0),
      approved:            Number(expRow?.approved         ?? 0),
      reimbursed:          Number(expRow?.reimbursed       ?? 0),
      totalAmountOriginal: Number(expRow?.total_amount_original ?? 0),
      pendingReimb:        Number(reimbRow?.pending_reimb  ?? 0),
      paidToday:           Number(reimbRow?.paid_today     ?? 0),
    };
  }
}
