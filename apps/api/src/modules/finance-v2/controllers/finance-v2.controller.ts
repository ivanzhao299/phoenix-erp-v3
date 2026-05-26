import {
  Controller, Get, Query, UseGuards,
} from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { ApAdapterService }  from '../services/ap-adapter.service';
import { ApInvoicesService } from '../services/ap-invoices.service';

/**
 * Finance V2 Controller — Phase 1 AP Runtime
 *
 * 路由前缀：/api/v2/finance
 *
 * 本控制器仅保留通用接口（health / dashboard / ap/legacy-source）。
 * AP Runtime 专用接口已移至 FinApController (/api/v2/finance/ap/*)。
 *
 * Phase 1 变更：
 *   - health.phase 更新为 'phase-1-ap-runtime'
 *   - dashboard.ap 从 prc2_ap_ledger 适配层升级为 fin_ap_invoices（ApInvoicesService）
 *   - /ap/legacy-source 保留（只读过渡接口，Phase 2 再下线）
 *   - /ap/summary 已由 FinApController 接管（此处旧版保留兼容）
 */
@Controller('api/v2/finance')
@UseGuards(MenuGuard)
export class FinanceV2Controller {
  constructor(
    private readonly apAdapter:  ApAdapterService,
    private readonly apInvoices: ApInvoicesService,
  ) {}

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
      phase:   'phase-2-ar-runtime',
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
    const apSummary = await this.apInvoices.getSummary();
    return {
      modules: {
        ap: {
          status:      'RUNTIME',        // Phase 1：fin_ap_invoices 正式启用
          description: '应付账款（fin_ap_invoices AP Runtime）',
          source:      'fin_ap_invoices',
          summary:     apSummary,
        },
        ar: {
          status:      'PLANNED',
          description: 'AR Runtime — Phase 2 建设',
        },
        cash: {
          status:      'PLANNED',
          description: '资金账户中心 — Phase 2 建设',
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
