import {
  Controller, Get, Post, Patch,
  Param, Query, Body, UseGuards,
} from '@nestjs/common';
import { MenuGuard, RequireMenu }    from '../../../common/guards/menu.guard';
import { ArInvoicesService }          from '../services/ar-invoices.service';
import { ArReceiptsService }          from '../services/ar-receipts.service';
import {
  CreateArInvoiceDto,
  UpdateArInvoiceDto,
  CancelArInvoiceDto,
  QueryArInvoiceDto,
} from '../dto/ar-invoice.dto';
import {
  CreateArReceiptDto,
  ConfirmArReceiptDto,
  CancelArReceiptDto,
  QueryArReceiptDto,
} from '../dto/ar-receipt.dto';

/**
 * Finance V2 AR Controller — Phase 2 AR Runtime
 *
 * 路由前缀：/api/v2/finance/ar
 *
 * AR Invoice 接口：
 *   GET    /ar/invoices              — 列表（分页、全筛选、DataScope）
 *   GET    /ar/invoices/:id          — 详情（含收款核销）
 *   POST   /ar/invoices              — 手工创建
 *   PATCH  /ar/invoices/:id          — 更新（OPEN/PARTIALLY_RECEIVED）
 *   POST   /ar/invoices/:id/cancel   — 取消（未收款）
 *
 * AR Receipt 接口：
 *   GET    /ar/receipts              — 收款列表
 *   GET    /ar/receipts/:id          — 收款详情 + 分摊
 *   POST   /ar/receipts              — 创建收款草稿
 *   POST   /ar/receipts/:id/confirm  — 确认收款（事务核销 AR）
 *   POST   /ar/receipts/:id/cancel   — 取消收款（仅 DRAFT）
 *
 * 统计接口：
 *   GET    /ar/aging                 — AR Aging 5 桶
 *   GET    /ar/summary               — AR 汇总统计
 *
 * 权限：MENU_FIN2_AR
 */
@Controller('api/v2/finance/ar')
@UseGuards(MenuGuard)
export class FinArController {
  constructor(
    private readonly arInvoicesSvc: ArInvoicesService,
    private readonly arReceiptsSvc: ArReceiptsService,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════
  // AR Invoice
  // ══════════════════════════════════════════════════════════════════════════

  @Get('invoices')
  @RequireMenu('MENU_FIN2_AR', 'V')
  listInvoices(@Query() q: QueryArInvoiceDto) {
    return this.arInvoicesSvc.list(q);
  }

  @Get('invoices/:id')
  @RequireMenu('MENU_FIN2_AR', 'V')
  getInvoice(@Param('id') id: string) {
    return this.arInvoicesSvc.findById(id);
  }

  @Post('invoices')
  @RequireMenu('MENU_FIN2_AR', 'E')
  createInvoice(@Body() dto: CreateArInvoiceDto) {
    return this.arInvoicesSvc.createManual(dto);
  }

  @Patch('invoices/:id')
  @RequireMenu('MENU_FIN2_AR', 'E')
  updateInvoice(
    @Param('id') id: string,
    @Body() dto: UpdateArInvoiceDto,
  ) {
    return this.arInvoicesSvc.update(id, dto);
  }

  @Post('invoices/:id/cancel')
  @RequireMenu('MENU_FIN2_AR', 'E')
  cancelInvoice(
    @Param('id') id: string,
    @Body() dto: CancelArInvoiceDto,
  ) {
    return this.arInvoicesSvc.cancel(id, dto);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AR Receipt
  // ══════════════════════════════════════════════════════════════════════════

  @Get('receipts')
  @RequireMenu('MENU_FIN2_AR', 'V')
  listReceipts(@Query() q: QueryArReceiptDto) {
    return this.arReceiptsSvc.list(q);
  }

  @Get('receipts/:id')
  @RequireMenu('MENU_FIN2_AR', 'V')
  getReceipt(@Param('id') id: string) {
    return this.arReceiptsSvc.findById(id);
  }

  @Post('receipts')
  @RequireMenu('MENU_FIN2_AR', 'E')
  createReceipt(@Body() dto: CreateArReceiptDto) {
    return this.arReceiptsSvc.create(dto);
  }

  @Post('receipts/:id/confirm')
  @RequireMenu('MENU_FIN2_AR', 'E')
  confirmReceipt(
    @Param('id') id: string,
    @Body() dto: ConfirmArReceiptDto,
  ) {
    return this.arReceiptsSvc.confirm(id, dto);
  }

  @Post('receipts/:id/cancel')
  @RequireMenu('MENU_FIN2_AR', 'E')
  cancelReceipt(
    @Param('id') id: string,
    @Body() dto: CancelArReceiptDto,
  ) {
    return this.arReceiptsSvc.cancel(id, dto);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 统计
  // ══════════════════════════════════════════════════════════════════════════

  @Get('aging')
  @RequireMenu('MENU_FIN2_AR', 'V')
  getAging(@Query('companyCode') companyCode?: string) {
    return this.arInvoicesSvc.getAging(companyCode);
  }

  @Get('summary')
  @RequireMenu('MENU_FIN2_AR', 'V')
  getSummary(@Query('companyCode') companyCode?: string) {
    return this.arInvoicesSvc.getSummary(companyCode);
  }
}
