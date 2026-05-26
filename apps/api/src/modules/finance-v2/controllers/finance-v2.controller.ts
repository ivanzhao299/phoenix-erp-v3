import {
  Controller, Get, Query, UseGuards,
} from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { ApAdapterService } from '../services/ap-adapter.service';

/**
 * Finance V2 Controller
 *
 * 路由前缀：/api/v2/finance
 *
 * Phase 0 仅提供过渡层只读接口：
 *   GET /api/v2/finance/dashboard    — Dashboard 统计
 *   GET /api/v2/finance/ap/legacy-source  — prc2_ap_ledger 只读列表（DataScope）
 *   GET /api/v2/finance/ap/summary   — AP 汇总数据（Dashboard 用）
 *
 * Phase 1 将增加：
 *   POST /api/v2/finance/ap/invoices  — 创建 fin_ap_invoices
 *   GET  /api/v2/finance/ar/*         — AR Runtime
 *   GET  /api/v2/finance/cash/*       — 资金账户
 */
@Controller('api/v2/finance')
@UseGuards(MenuGuard)
export class FinanceV2Controller {
  constructor(
    private readonly apAdapter: ApAdapterService,
  ) {}

  // ── Dashboard ─────────────────────────────────────────────────────────────

  /**
   * GET /api/v2/finance/dashboard
   * Finance V2 Dashboard 汇总：AP 统计 + 模块状态
   */
  @Get('dashboard')
  @RequireMenu('MENU_FIN2', 'V')
  async dashboard() {
    const apSummary = await this.apAdapter.getApSummary();
    return {
      modules: {
        ap: {
          status:      'ADAPTER',        // 使用过渡适配层
          description: '应付账款（来自 prc2_ap_ledger）',
          source:      'prc2_ap_ledger',
          summary:     apSummary,
        },
        ar: {
          status:      'PLANNED',
          description: 'AR Runtime — Phase 1 建设',
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
