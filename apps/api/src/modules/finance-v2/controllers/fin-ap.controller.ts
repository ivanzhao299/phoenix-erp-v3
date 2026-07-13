import {
  Controller, Get, Post, Patch,
  Param, Query, Body, UseGuards,
  ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { DataScopeGuard }         from '../../org/guards/data-scope.guard';
import { ApInvoicesService }      from '../services/ap-invoices.service';
import {
  CreateApInvoiceDto,
  UpdateApInvoiceDto,
  CancelApInvoiceDto,
  PayApInvoiceDto,
  QueryApInvoiceDto,
} from '../dto/ap-invoice.dto';

/**
 * Finance V2 AP Controller — Phase 1 AP Runtime
 *
 * 路由前缀：/api/v2/finance/ap
 *
 * 接口清单：
 *   GET    /api/v2/finance/ap/invoices          — 列表（分页、全筛选）
 *   GET    /api/v2/finance/ap/invoices/:id      — 详情（含付款核销）
 *   POST   /api/v2/finance/ap/invoices          — 手工创建
 *   PATCH  /api/v2/finance/ap/invoices/:id      — 更新（OPEN/PARTIALLY_PAID）
 *   POST   /api/v2/finance/ap/invoices/:id/cancel — 取消
 *   POST   /api/v2/finance/ap/invoices/:id/pay  — 执行付款并核销
 *   GET    /api/v2/finance/ap/aging             — AP Aging 明细
 *   GET    /api/v2/finance/ap/summary           — AP 汇总统计
 *   POST   /api/v2/finance/ap/import-from-prc2  — 从 prc2_ap_ledger 幂等导入
 *
 * 权限：MENU_FIN2_AP（所有接口）
 *   import-from-prc2 要求 MENU_FIN2_AP:E，并继续受 DataScope 公司范围过滤。
 */
@Controller('api/v2/finance/ap')
@UseGuards(MenuGuard, DataScopeGuard)
export class FinApController {
  constructor(private readonly apSvc: ApInvoicesService) {}

  // ── 列表 ──────────────────────────────────────────────────────────────────

  /**
   * GET /api/v2/finance/ap/invoices
   * AP 发票列表，支持分页、多维筛选、DataScope 过滤。
   */
  @Get('invoices')
  @RequireMenu('MENU_FIN2_AP', 'V')
  list(@Query() q: QueryApInvoiceDto) {
    return this.apSvc.list(q);
  }

  // ── 详情 ──────────────────────────────────────────────────────────────────

  /**
   * GET /api/v2/finance/ap/invoices/:id
   * AP 发票详情，含付款核销记录。
   */
  @Get('invoices/:id')
  @RequireMenu('MENU_FIN2_AP', 'V')
  findById(@Param('id') id: string) {
    return this.apSvc.findById(id);
  }

  // ── 创建 ──────────────────────────────────────────────────────────────────

  /**
   * POST /api/v2/finance/ap/invoices
   * 手工创建 AP Invoice（source_type = MANUAL）。
   */
  @Post('invoices')
  @RequireMenu('MENU_FIN2_AP', 'E')
  create(@Body() dto: CreateApInvoiceDto) {
    return this.apSvc.createManual(dto);
  }

  // ── 更新 ──────────────────────────────────────────────────────────────────

  /**
   * PATCH /api/v2/finance/ap/invoices/:id
   * 更新 AP Invoice（仅 OPEN / PARTIALLY_PAID 状态可编辑）。
   */
  @Patch('invoices/:id')
  @RequireMenu('MENU_FIN2_AP', 'E')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateApInvoiceDto,
  ) {
    return this.apSvc.update(id, dto);
  }

  // ── 取消 ──────────────────────────────────────────────────────────────────

  /**
   * POST /api/v2/finance/ap/invoices/:id/cancel
   * 取消 AP Invoice（未付款可取消；已全额付清不可取消）。
   */
  @Post('invoices/:id/cancel')
  @RequireMenu('MENU_FIN2_AP', 'E')
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelApInvoiceDto,
  ) {
    return this.apSvc.cancel(id, dto);
  }

  // ── 付款核销 ─────────────────────────────────────────────────────────────

  /**
   * POST /api/v2/finance/ap/invoices/:id/pay
   * 对 AP Invoice 执行付款，扣减资金账户并写 AP_PAYMENT 资金流水。
   */
  @Post('invoices/:id/pay')
  @RequireMenu('MENU_FIN2_AP', 'E')
  pay(
    @Param('id') id: string,
    @Body() dto: PayApInvoiceDto,
  ) {
    return this.apSvc.payInvoice(id, dto);
  }

  // ── Aging ─────────────────────────────────────────────────────────────────

  /**
   * GET /api/v2/finance/ap/aging
   * AP Aging 明细，按供应商+货币分组，五个账龄桶：
   *   NOT_DUE / 0_30 / 31_60 / 61_90 / 90_PLUS
   */
  @Get('aging')
  @RequireMenu('MENU_FIN2_AP', 'V')
  getAging(@Query('companyCode') companyCode?: string) {
    return this.apSvc.getAging(companyCode);
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  /**
   * GET /api/v2/finance/ap/summary
   * AP 汇总统计（基于 fin_ap_invoices）。
   * 替代 Phase 0 adapter 版本的 /ap/summary。
   */
  @Get('summary')
  @RequireMenu('MENU_FIN2_AP', 'V')
  getSummary(@Query('companyCode') companyCode?: string) {
    return this.apSvc.getSummary(companyCode);
  }

  // ── 导入 ──────────────────────────────────────────────────────────────────

  /**
   * POST /api/v2/finance/ap/import-from-prc2
   * 从 prc2_ap_ledger 幂等导入历史 AP 数据。
   * 额外角色校验在 service 层（ADMIN / FIN_CFO / GROUP_FINANCE）。
   */
  @Post('import-from-prc2')
  @RequireMenu('MENU_FIN2_AP', 'E')
  importFromPrc2(@Query('companyCode') companyCode?: string) {
    return this.apSvc.importFromPrc2(companyCode);
  }
}
