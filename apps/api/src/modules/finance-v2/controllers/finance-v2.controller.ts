import {
  Controller, Get, Query, UseGuards,
} from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { DataScopeGuard }         from '../../org/guards/data-scope.guard';
import { DataScopeContext }        from '../../org/services/data-scope.service';
import { ClsService }             from 'nestjs-cls';
import { ApAdapterService }      from '../services/ap-adapter.service';
import { ApInvoicesService }     from '../services/ap-invoices.service';
import { CashAccountsService }   from '../services/cash-accounts.service';
import { CashTransactionsService } from '../services/cash-transactions.service';
import { FundTransfersService }  from '../services/fund-transfers.service';
import { ShareholderContributionsService } from '../services/shareholder-contributions.service';
import { ExpenseRequestsService }          from '../services/expense-requests.service';

/**
 * Finance V2 Controller — Phase 4 Shareholder Runtime
 *
 * 路由前缀：/api/v2/finance
 *
 * 本控制器仅保留通用接口（health / dashboard / ap/legacy-source）。
 * AP → FinApController，AR → FinArController，Cash → FinCashController，Shareholder → FinShareholderController
 */
@Controller('api/v2/finance')
@UseGuards(MenuGuard, DataScopeGuard)
export class FinanceV2Controller {
  constructor(
    private readonly apAdapter:    ApAdapterService,
    private readonly apInvoices:   ApInvoicesService,
    private readonly cashAccSvc:   CashAccountsService,
    private readonly cashTxnSvc:   CashTransactionsService,
    private readonly tfrSvc:       FundTransfersService,
    private readonly shContribSvc: ShareholderContributionsService,
    private readonly expenseSvc:   ExpenseRequestsService,
    private readonly cls:          ClsService,
  ) {}

  private get user() { return this.cls.get('user') as any; }

  /** C2 修复：从 CLS DataScope 构建 enrichedUser，提供正确的 scopeAll 和 companyCodes */
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

  // ── Health（无需 MENU 鉴权，供运维探活）─────────────────────────────────

  /**
   * GET /api/v2/finance/health
   * Finance V2 模块健康探针
   * @public（MenuGuard 对无 @RequireMenu 的端点放行）
   */
  @Get('health')
  health() {
    return {
      status:  'ok',
      module:  'finance-v2',
      phase:   'phase-6-financial-reports',
      tables:  [
        'fin_ap_invoices',
        'fin_ar_invoices',
        'fin_cash_accounts',
        'fin_cash_transactions',
        'fin_fund_transfers',
        'fin_shareholder_contributions',
        'fin_shareholder_settlements',
        'fin_expense_requests',
        'fin_reimbursements',
        'fin_exchange_rates',
      ],
      legacy_frozen: [
        'fin_transactions',
        'fin_payments',
        'biz_cash_flow',
      ],
      timestamp: new Date().toISOString(),
    };
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────

  /**
   * GET /api/v2/finance/dashboard
   * Finance V2 Dashboard 汇总：AP 统计 + 模块状态
   */
  @Get('dashboard')
  @RequireMenu('MENU_FIN2_DASHBOARD', 'V', [
    'MENU_FIN2_REPORT',
    'MENU_FIN2_AP',
    'MENU_FIN2_AR',
    'MENU_FIN2_AR_LEDGER',
    'MENU_FIN2_CASH_VIEW',
    'MENU_FIN2_CASH',
    'MENU_FIN2_CASH_TRANSFER',
    'MENU_FIN2_SHAREHOLDER',
    'MENU_FIN2_EXPENSE',
    'MENU_FIN2_REIMBURSE',
    'MENU_FIN2',
  ])
  async dashboard() {
    const u = this.scopedUser;
    // C2 修复：从 CLS DataScope 读取（DataScopeGuard 已将正确 scope 写入 CLS）
    const scope = this.cls.get('dataScope') as DataScopeContext | undefined;
    const companyCodes: string[] | null = (!scope || scope.isGlobal)
      ? null
      : scope.allowedCompanyCodes;

    const [apSummary, cashSummary, todayCash, pendingTransfers, shSummary, expenseSummary] = await Promise.allSettled([
      this.apInvoices.getSummary(),
      this.cashAccSvc.getSummary(u),
      this.cashTxnSvc.getTodaySummary(companyCodes),
      this.tfrSvc.getPendingCount(companyCodes),
      this.shContribSvc.getSummary(u),
      this.expenseSvc.getSummary(u),
    ]);

    return {
      modules: {
        ap: {
          status:      'RUNTIME',
          description: '应付账款（fin_ap_invoices AP Runtime）',
          source:      'fin_ap_invoices',
          summary:     apSummary.status === 'fulfilled' ? apSummary.value : null,
        },
        ar: {
          status:      'RUNTIME',
          description: 'AR Runtime（fin_ar_invoices + fin_ar_receipts）',
          source:      'fin_ar_invoices',
        },
        cash: {
          status:      'RUNTIME',
          description: '资金账户中心（fin_cash_accounts + fin_cash_transactions）',
          source:      'fin_cash_accounts',
          summary:          cashSummary.status === 'fulfilled' ? cashSummary.value : null,
          todayIn:          todayCash.status === 'fulfilled' ? todayCash.value.todayIn : 0,
          todayOut:         todayCash.status === 'fulfilled' ? todayCash.value.todayOut : 0,
          pendingTransfers: pendingTransfers.status === 'fulfilled' ? pendingTransfers.value : 0,
        },
        shareholder: {
          status:      'RUNTIME',
          description: '股东资金（fin_shareholder_contributions + fin_shareholder_settlements）',
          source:      'fin_shareholder_contributions',
          summary:     shSummary.status === 'fulfilled' ? shSummary.value : null,
        },
        expense: {
          status:      'RUNTIME',
          description: 'Expense Runtime（fin_expense_requests + fin_reimbursements）',
          source:      'fin_expense_requests',
          summary:     expenseSummary.status === 'fulfilled' ? expenseSummary.value : null,
        },
        reports: {
          status:      'RUNTIME',
          description: 'Financial Reports Runtime — 12 只读聚合端点（Phase 6）',
          endpoints:   [
            'GET /api/v2/finance/reports/overview',
            'GET /api/v2/finance/reports/ap-aging',
            'GET /api/v2/finance/reports/ap-top-suppliers',
            'GET /api/v2/finance/reports/ar-aging',
            'GET /api/v2/finance/reports/ar-top-customers',
            'GET /api/v2/finance/reports/cash-overview',
            'GET /api/v2/finance/reports/cash-daily-flow',
            'GET /api/v2/finance/reports/expense-summary',
            'GET /api/v2/finance/reports/reimbursement-summary',
            'GET /api/v2/finance/reports/shareholder-summary',
            'GET /api/v2/finance/reports/project-finance',
            'GET /api/v2/finance/reports/company-finance',
          ],
        },
      },
      workflowPlatform: {
        status:         'READY',
        description:    'Workflow 2.0 Phase A-I 已完成，可直接接入',
        formRuntime:    'READY',
        approvalEngine: 'READY',
        sla:            'READY',
      },
      legacyFreeze: {
        frozenAt:  '2026-05-26',
        frozenBy:  'Finance V2 Phase 0',
        tables:    ['fin_transactions', 'fin_payments', 'biz_cash_flow'],
        pages:     ['/finance', '/finance/payments', '/finance/receivables',
                    '/finance/payables', '/finance/aging', '/finance/cashflow', '/finance/cost'],
      },
    };
  }

  // ── AP 过渡适配层 ─────────────────────────────────────────────────────────

  /**
   * GET /api/v2/finance/ap/legacy-source
   *
   * 从 prc2_ap_ledger 读取 AP 数据（只读，DataScope 过滤）。
   * 这是 Finance V2 Phase 0 的过渡接口，Phase 1 将替换为 fin_ap_invoices。
   */
  @Get('ap/legacy-source')
  @RequireMenu('MENU_FIN2_AP', 'V')
  listApLegacy(
    @Query('status')       status?: string,
    @Query('companyCode')  companyCode?: string,
    @Query('supplierCode') supplierCode?: string,
    @Query('keyword')      keyword?: string,
    @Query('page')         page?: string,
    @Query('pageSize')     pageSize?: string,
  ) {
    return this.apAdapter.listLegacyApSource({
      status,
      companyCode,
      supplierCode,
      keyword,
      page:     page     ? Number(page)     : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
    });
  }

  /**
   * GET /api/v2/finance/ap/summary
   * AP 汇总统计（用于 Dashboard 和 AP 页面头部）
   */
  @Get('ap/summary')
  @RequireMenu('MENU_FIN2_AP', 'V')
  getApSummary(@Query('companyCode') companyCode?: string) {
    const codes = companyCode ? [companyCode] : undefined;
    return this.apAdapter.getApSummary(codes);
  }
}
