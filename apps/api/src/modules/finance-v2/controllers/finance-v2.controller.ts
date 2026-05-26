import {
  Controller, Get, Query, UseGuards,
} from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { ClsService }            from 'nestjs-cls';
import { ApAdapterService }      from '../services/ap-adapter.service';
import { ApInvoicesService }     from '../services/ap-invoices.service';
import { CashAccountsService }   from '../services/cash-accounts.service';
import { CashTransactionsService } from '../services/cash-transactions.service';
import { FundTransfersService }  from '../services/fund-transfers.service';

/**
 * Finance V2 Controller — Phase 3 Cash Runtime
 *
 * 路由前缀：/api/v2/finance
 *
 * 本控制器仅保留通用接口（health / dashboard / ap/legacy-source）。
 * AP 路由 → FinApController，AR 路由 → FinArController，Cash 路由 → FinCashController
 */
@Controller('api/v2/finance')
@UseGuards(MenuGuard)
export class FinanceV2Controller {
  constructor(
    private readonly apAdapter:  ApAdapterService,
    private readonly apInvoices: ApInvoicesService,
    private readonly cashAccSvc: CashAccountsService,
    private readonly cashTxnSvc: CashTransactionsService,
    private readonly tfrSvc:     FundTransfersService,
    private readonly cls:        ClsService,
  ) {}

  private get user() { return this.cls.get('user') as any; }

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
      phase:   'phase-3-cash-runtime',
      tables:  [
        'fin_ap_invoices',
        'fin_ar_invoices',
        'fin_cash_accounts',
        'fin_cash_transactions',
        'fin_shareholder_contributions',
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
  @RequireMenu('MENU_FIN2', 'V')
  async dashboard() {
    const u = this.user;
    const companyCodes: string[] | null = u?.dataScope?.scopeAll
      ? null
      : (u?.dataScope?.companyCodes ?? []);

    const [apSummary, cashSummary, todayCash, pendingTransfers] = await Promise.allSettled([
      this.apInvoices.getSummary(),
      this.cashAccSvc.getSummary(u),
      this.cashTxnSvc.getTodaySummary(companyCodes),
      this.tfrSvc.getPendingCount(companyCodes),
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
          summary:     cashSummary.status === 'fulfilled' ? cashSummary.value : null,
          todayIn:     todayCash.status === 'fulfilled' ? todayCash.value.todayIn : 0,
          todayOut:    todayCash.status === 'fulfilled' ? todayCash.value.todayOut : 0,
          pendingTransfers: pendingTransfers.status === 'fulfilled' ? pendingTransfers.value : 0,
        },
        shareholder: {
          status:      'ADAPTER',
          description: '股东资金（来自 prc2_shareholder_funds）',
          source:      'prc2_shareholder_funds',
        },
        expense: {
          status:      'PLANNED',
          description: '费用 Runtime — Phase 3 建设',
        },
        budget: {
          status:      'PLANNED',
          description: '预算 Runtime — Phase 4 建设',
        },
      },
      workflowPlatform: {
        status:      'READY',
        description: 'Workflow 2.0 Phase A-I 已完成，可直接接入',
        formRuntime: 'READY',
        approvalEngine: 'READY',
        sla: 'READY',
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
