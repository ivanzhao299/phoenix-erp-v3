import {
  Controller, Get, Post, Patch, Param, Body, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { MenuGuard, RequireMenu }  from '../../../common/guards/menu.guard';
import { DataScopeGuard }          from '../../org/guards/data-scope.guard';
import { DataScopeContext }         from '../../org/services/data-scope.service';
import { ExpenseRequestsService } from '../services/expense-requests.service';
import { ReimbursementsService }  from '../services/reimbursements.service';

import {
  CreateExpenseRequestDto,
  UpdateExpenseRequestDto,
  QueryExpenseRequestDto,
  SubmitExpenseRequestDto,
  CancelExpenseRequestDto,
  QueryReimbursementDto,
  SubmitReimbursementDto,
  ApproveReimbursementDto,
  PayReimbursementDto,
  CancelReimbursementDto,
} from '../dto/expense.dto';

const MENU = 'MENU_FIN2_EXPENSE';

/**
 * Finance V2 Expense Controller — Phase 5
 *
 * 路由前缀：/api/v2/finance/expenses
 *
 * Expense 完全 Workflow Native：提交强制走 ApprovalEngine。
 * 审批通过后 WorkflowBizRegistry.onApproved 自动生成 Reimbursement。
 * Reimbursement.pay() 联动 Cash Runtime（SERIALIZABLE 事务）。
 */
@Controller('api/v2/finance/expenses')
@UseGuards(MenuGuard, DataScopeGuard)
export class FinExpenseController {
  constructor(
    private readonly expenseSvc: ExpenseRequestsService,
    private readonly reimbSvc:   ReimbursementsService,
    private readonly cls:        ClsService,
  ) {}

  private get user() { return this.cls.get('user') as any; }

  /** C2 修复：从 CLS DataScope 构建 enrichedUser */
  private get scopedUser() {
    const user = this.cls.get('user') as any;
    const scope = this.cls.get('dataScope') as DataScopeContext | undefined;
    return {
      ...user,
      dataScope: {
        scopeAll:     scope ? scope.isGlobal : false,
        companyCodes: scope ? scope.allowedCompanyCodes : [],
      },
    };
  }

  // ════════════════════════════════════════════════════════════════════════
  // 费用申请
  // ════════════════════════════════════════════════════════════════════════

  /** GET /api/v2/finance/expenses */
  @Get()
  @RequireMenu(MENU, 'V')
  listExpenses(@Query() dto: QueryExpenseRequestDto) {
    return this.expenseSvc.list(dto, this.scopedUser);
  }

  /** GET /api/v2/finance/expenses/summary */
  @Get('summary')
  @RequireMenu(MENU, 'V')
  expenseSummary() {
    return this.expenseSvc.getSummary(this.scopedUser);
  }

  /** GET /api/v2/finance/expenses/reimbursements */
  @Get('reimbursements')
  @RequireMenu(MENU, 'V')
  listReimbursements(@Query() dto: QueryReimbursementDto) {
    return this.reimbSvc.list(dto, this.scopedUser);
  }

  /** GET /api/v2/finance/expenses/reimbursements/summary */
  @Get('reimbursements/summary')
  @RequireMenu(MENU, 'V')
  reimbSummary() {
    return this.reimbSvc.getSummary(this.scopedUser);
  }

  /** GET /api/v2/finance/expenses/reimbursements/:id */
  @Get('reimbursements/:id')
  @RequireMenu(MENU, 'V')
  getReimbursement(@Param('id') id: string) {
    return this.reimbSvc.findById(id, this.scopedUser);
  }

  /** POST /api/v2/finance/expenses/reimbursements/:id/submit */
  @Post('reimbursements/:id/submit')
  @RequireMenu(MENU, 'E')
  @HttpCode(HttpStatus.OK)
  submitReimbursement(
    @Param('id') id: string,
    @Body() dto: SubmitReimbursementDto,
  ) {
    return this.reimbSvc.submit(id, dto, this.scopedUser);
  }

  /** POST /api/v2/finance/expenses/reimbursements/:id/approve-direct */
  @Post('reimbursements/:id/approve-direct')
  @RequireMenu(MENU, 'A')   // H2 修复：审批动作需要 A（Approve）权限
  @HttpCode(HttpStatus.OK)
  approveReimbursement(
    @Param('id') id: string,
    @Body() dto: ApproveReimbursementDto,
  ) {
    return this.reimbSvc.approveDirect(id, dto, this.scopedUser);
  }

  /** POST /api/v2/finance/expenses/reimbursements/:id/pay */
  @Post('reimbursements/:id/pay')
  @RequireMenu(MENU, 'E')
  @HttpCode(HttpStatus.OK)
  payReimbursement(
    @Param('id') id: string,
    @Body() dto: PayReimbursementDto,
  ) {
    return this.reimbSvc.pay(id, dto, this.scopedUser);
  }

  /** POST /api/v2/finance/expenses/reimbursements/:id/cancel */
  @Post('reimbursements/:id/cancel')
  @RequireMenu(MENU, 'E')
  @HttpCode(HttpStatus.OK)
  cancelReimbursement(
    @Param('id') id: string,
    @Body() dto: CancelReimbursementDto,
  ) {
    return this.reimbSvc.cancel(id, dto, this.scopedUser);
  }

  /** GET /api/v2/finance/expenses/:id */
  @Get(':id')
  @RequireMenu(MENU, 'V')
  getExpense(@Param('id') id: string) {
    return this.expenseSvc.findById(id, this.scopedUser);
  }

  /** POST /api/v2/finance/expenses */
  @Post()
  @RequireMenu(MENU, 'E')
  createExpense(@Body() dto: CreateExpenseRequestDto) {
    return this.expenseSvc.create(dto, this.scopedUser);
  }

  /**
   * POST /api/v2/finance/expenses/from-submission
   *
   * Workflow Native 路径：前端已通过 Workflow Form Runtime 提交
   * EXPENSE_REQUEST_FORM，取 submissionId 自动创建费用申请并启动审批。
   */
  @Post('from-submission')
  @RequireMenu(MENU, 'E')
  createFromSubmission(@Body('submissionId') submissionId: string) {
    return this.expenseSvc.createFromFormSubmission(submissionId, this.scopedUser);
  }

  /** PATCH /api/v2/finance/expenses/:id */
  @Patch(':id')
  @RequireMenu(MENU, 'E')
  updateExpense(
    @Param('id') id: string,
    @Body() dto: UpdateExpenseRequestDto,
  ) {
    return this.expenseSvc.update(id, dto, this.scopedUser);
  }

  /** POST /api/v2/finance/expenses/:id/submit */
  @Post(':id/submit')
  @RequireMenu(MENU, 'E')
  @HttpCode(HttpStatus.OK)
  submitExpense(
    @Param('id') id: string,
    @Body() dto: SubmitExpenseRequestDto,
  ) {
    return this.expenseSvc.submit(id, dto, this.scopedUser);
  }

  /** POST /api/v2/finance/expenses/:id/cancel */
  @Post(':id/cancel')
  @RequireMenu(MENU, 'E')
  @HttpCode(HttpStatus.OK)
  cancelExpense(
    @Param('id') id: string,
    @Body() dto: CancelExpenseRequestDto,
  ) {
    return this.expenseSvc.cancel(id, dto, this.scopedUser);
  }
}
