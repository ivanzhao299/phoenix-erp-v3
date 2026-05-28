import {
  Controller, Get, Query, UseGuards,
} from '@nestjs/common';
import { MenuGuard, RequireMenu }      from '../../../common/guards/menu.guard';
import { DataScopeGuard }              from '../../org/guards/data-scope.guard';
import { DataScopeContext }             from '../../org/services/data-scope.service';
import { ClsService }                  from 'nestjs-cls';
import { FinancialReportsService }     from '../services/financial-reports.service';

/**
 * FinancialReportsController — Finance V2 Phase 6 Financial Reports Runtime
 *
 * 路由前缀：/api/v2/finance/reports
 *
 * 11 个只读聚合端点，全部需要 MENU_FIN2_REPORT 的 'V' 权限。
 * DataScope 在 Service 层按 user.dataScope 自动过滤。
 *
 * 本控制器不做任何写入，不涉及会计凭证/总账/科目体系。
 */
@Controller('api/v2/finance/reports')
@UseGuards(MenuGuard, DataScopeGuard)
export class FinancialReportsController {
  constructor(
    private readonly reportsSvc: FinancialReportsService,
    private readonly cls: ClsService,
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

  // ── 1. 经营资金总览 ───────────────────────────────────────────────────────

  /**
   * GET /api/v2/finance/reports/overview
   * 经营资金总览：AP/AR/Cash/Shareholder/Expense/Reimbursement
   * + Net Operating Position + 今日资金流
   */
  @Get('overview')
  @RequireMenu('MENU_FIN2_REPORT', 'V')
  getOverview() {
    return this.reportsSvc.getOverview(this.scopedUser);
  }

  // ── 2. AP 账龄 ────────────────────────────────────────────────────────────

  /**
   * GET /api/v2/finance/reports/ap-aging
   * 供应商应付账龄分析（notDue / 0-30 / 31-60 / 61-90 / 90+）
   * Query: companyCode?
   */
  @Get('ap-aging')
  @RequireMenu('MENU_FIN2_REPORT', 'V')
  getApAging(@Query('companyCode') companyCode?: string) {
    return this.reportsSvc.getApAging(this.scopedUser, companyCode);
  }

  // ── 3. AP TOP 20 供应商 ───────────────────────────────────────────────────

  /**
   * GET /api/v2/finance/reports/ap-top-suppliers
   * TOP 20 供应商：totalAp / openBalance / paidAmount
   */
  @Get('ap-top-suppliers')
  @RequireMenu('MENU_FIN2_REPORT', 'V')
  getApTopSuppliers() {
    return this.reportsSvc.getApTopSuppliers(this.scopedUser);
  }

  // ── 4. AR 账龄 ────────────────────────────────────────────────────────────

  /**
   * GET /api/v2/finance/reports/ar-aging
   * 客户应收账龄分析（notDue / 0-30 / 31-60 / 61-90 / 90+）
   * Query: companyCode?
   */
  @Get('ar-aging')
  @RequireMenu('MENU_FIN2_REPORT', 'V')
  getArAging(@Query('companyCode') companyCode?: string) {
    return this.reportsSvc.getArAging(this.scopedUser, companyCode);
  }

  // ── 5. AR TOP 20 客户 ─────────────────────────────────────────────────────

  /**
   * GET /api/v2/finance/reports/ar-top-customers
   * TOP 20 客户：totalAr / openBalance / receivedAmount
   */
  @Get('ar-top-customers')
  @RequireMenu('MENU_FIN2_REPORT', 'V')
  getArTopCustomers() {
    return this.reportsSvc.getArTopCustomers(this.scopedUser);
  }

  // ── 6. 资金账户总览 ───────────────────────────────────────────────────────

  /**
   * GET /api/v2/finance/reports/cash-overview
   * 资金账户总览：totalBalance / byAccountType / byCurrency / byCompany
   */
  @Get('cash-overview')
  @RequireMenu('MENU_FIN2_REPORT', 'V')
  getCashOverview() {
    return this.reportsSvc.getCashOverview(this.scopedUser);
  }

  // ── 7. 资金日度流水 ───────────────────────────────────────────────────────

  /**
   * GET /api/v2/finance/reports/cash-daily-flow
   * 日度现金流（基于 fin_cash_transactions）
   * Query: dateFrom? dateTo?
   */
  @Get('cash-daily-flow')
  @RequireMenu('MENU_FIN2_REPORT', 'V')
  getCashDailyFlow(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo')   dateTo?: string,
  ) {
    return this.reportsSvc.getCashDailyFlow(this.scopedUser, dateFrom, dateTo);
  }

  // ── 8. 费用汇总 ───────────────────────────────────────────────────────────

  /**
   * GET /api/v2/finance/reports/expense-summary
   * 费用汇总：byExpenseType / byCompany / byProject / 各状态计数
   */
  @Get('expense-summary')
  @RequireMenu('MENU_FIN2_REPORT', 'V')
  getExpenseSummary() {
    return this.reportsSvc.getExpenseSummary(this.scopedUser);
  }

  // ── 9. 报销汇总 ───────────────────────────────────────────────────────────

  /**
   * GET /api/v2/finance/reports/reimbursement-summary
   * 报销汇总：pending / approved / paid / avgReimbursementDays
   */
  @Get('reimbursement-summary')
  @RequireMenu('MENU_FIN2_REPORT', 'V')
  getReimbursementSummary() {
    return this.reportsSvc.getReimbursementSummary(this.scopedUser);
  }

  // ── 10. 股东资金汇总 ──────────────────────────────────────────────────────

  /**
   * GET /api/v2/finance/reports/shareholder-summary
   * 股东资金汇总：byShareholder / byContributionType / upcomingReturns
   */
  @Get('shareholder-summary')
  @RequireMenu('MENU_FIN2_REPORT', 'V')
  getShareholderSummary() {
    return this.reportsSvc.getShareholderSummary(this.scopedUser);
  }

  // ── 11. 项目维度财务 ──────────────────────────────────────────────────────

  /**
   * GET /api/v2/finance/reports/project-finance
   * 按 project_code 聚合：AP / AR / Expense / Shareholder / NetPosition
   * Query: projectCode?（不传则全部项目）
   */
  @Get('project-finance')
  @RequireMenu('MENU_FIN2_REPORT', 'V')
  getProjectFinance(@Query('projectCode') projectCode?: string) {
    return this.reportsSvc.getProjectFinance(this.scopedUser, projectCode);
  }

  // ── 12. 公司维度财务 ──────────────────────────────────────────────────────

  /**
   * GET /api/v2/finance/reports/company-finance
   * 按 company_code 聚合：AP / AR / Cash / Expense / Shareholder / NetOperatingPosition
   */
  @Get('company-finance')
  @RequireMenu('MENU_FIN2_REPORT', 'V')
  getCompanyFinance() {
    return this.reportsSvc.getCompanyFinance(this.scopedUser);
  }
}
