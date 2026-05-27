import {
  Controller, Get, Post, Body, Param, Query,
  UseGuards, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { AuthGuard }        from '@nestjs/passport';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { ReturnOrdersService }    from '../services/return-orders.service';

/**
 * SalesReturnsController — Sales V2 Phase 6
 *
 * 销售退货 Runtime REST API。
 *
 * 路由前缀：/api/v2/sales/returns
 * 权限：    MENU_SALES2_RETURN（所有接口至少需要 V 权限）
 *
 * 状态流转：
 *   POST /returns          → create (DRAFT)
 *   POST /returns/:id/submit          → PENDING_APPROVAL 或 INSPECTING
 *   POST /returns/:id/approve         → INSPECTING
 *   POST /returns/:id/reject          → REJECTED
 *   POST /returns/:id/start-inspection → 确认质检开始
 *   POST /returns/:id/complete-inspection → RESTOCKING 或 COMPLETED
 *   POST /returns/:id/complete-restock    → COMPLETED
 *   POST /returns/:id/complete            → 强制 COMPLETED
 *   POST /returns/:id/cancel              → CANCELLED
 */
@Controller('api/v2/sales/returns')
@UseGuards(AuthGuard('jwt'), MenuGuard)
export class SalesReturnsController {
  constructor(private readonly returnOrders: ReturnOrdersService) {}

  // ── GET /api/v2/sales/returns ──────────────────────────────────────────────

  @Get()
  @RequireMenu('MENU_SALES2_RETURN', 'V')
  list(
    @Query('companyCode')  companyCode?:  string,
    @Query('customerCode') customerCode?: string,
    @Query('status')       status?:       string,
    @Query('returnType')   returnType?:   string,
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.returnOrders.list({ companyCode, customerCode, status, returnType, page, limit });
  }

  // ── GET /api/v2/sales/returns/stats ───────────────────────────────────────

  @Get('stats')
  @RequireMenu('MENU_SALES2_RETURN', 'V')
  stats(@Query('companyCode') companyCode?: string) {
    return this.returnOrders.getDashboardStats(companyCode);
  }

  // ── GET /api/v2/sales/returns/analysis ────────────────────────────────────

  @Get('analysis')
  @RequireMenu('MENU_SALES2_RETURN', 'V')
  analysis(@Query('companyCode') companyCode?: string) {
    return this.returnOrders.getReturnAnalysis(companyCode);
  }

  // ── GET /api/v2/sales/returns/:id ─────────────────────────────────────────

  @Get(':id')
  @RequireMenu('MENU_SALES2_RETURN', 'V')
  findById(@Param('id') id: string) {
    return this.returnOrders.findById(id);
  }

  // ── POST /api/v2/sales/returns ────────────────────────────────────────────

  @Post()
  @RequireMenu('MENU_SALES2_RETURN', 'C')
  create(@Body() body: {
    salesOrderId?:    string;
    salesOrderNo?:    string;
    deliveryOrderId?: string;
    customerCode?:    string;
    customerName?:    string;
    companyCode:      string;
    companyName?:     string;
    returnType:       string;
    reasonCode?:      string;
    currencyCode?:    string;
    remark?:          string;
    items: Array<{
      salesOrderItemId?: string;
      productCode:       string;
      productName?:      string;
      gradeCode?:        string;
      packagingSpec?:    string;
      returnedQty:       number;
      unitPrice:         number;
      remark?:           string;
    }>;
  }) {
    return this.returnOrders.create(body);
  }

  // ── POST /api/v2/sales/returns/:id/submit ─────────────────────────────────

  @Post(':id/submit')
  @RequireMenu('MENU_SALES2_RETURN', 'C')
  submit(@Param('id') id: string) {
    return this.returnOrders.submit(id);
  }

  // ── POST /api/v2/sales/returns/:id/approve ────────────────────────────────

  @Post(':id/approve')
  @RequireMenu('MENU_SALES2_RETURN', 'A')
  approve(@Param('id') id: string) {
    return this.returnOrders.approve(id);
  }

  // ── POST /api/v2/sales/returns/:id/reject ─────────────────────────────────

  @Post(':id/reject')
  @RequireMenu('MENU_SALES2_RETURN', 'A')
  reject(
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    return this.returnOrders.reject(id, reason);
  }

  // ── POST /api/v2/sales/returns/:id/start-inspection ───────────────────────

  @Post(':id/start-inspection')
  @RequireMenu('MENU_SALES2_RETURN', 'E')
  startInspection(@Param('id') id: string) {
    return this.returnOrders.startInspection(id);
  }

  // ── POST /api/v2/sales/returns/:id/complete-inspection ────────────────────

  @Post(':id/complete-inspection')
  @RequireMenu('MENU_SALES2_RETURN', 'E')
  completeInspection(
    @Param('id') id: string,
    @Body('results') results: Array<{
      itemId:      string;
      acceptedQty: number;
      damagedQty:  number;
      remark?:     string;
    }>,
  ) {
    return this.returnOrders.completeInspection(id, results ?? []);
  }

  // ── POST /api/v2/sales/returns/:id/complete-restock ───────────────────────

  @Post(':id/complete-restock')
  @RequireMenu('MENU_SALES2_RETURN', 'E')
  completeRestock(@Param('id') id: string) {
    return this.returnOrders.completeRestock(id);
  }

  // ── POST /api/v2/sales/returns/:id/complete ───────────────────────────────

  @Post(':id/complete')
  @RequireMenu('MENU_SALES2_RETURN', 'A')
  complete(@Param('id') id: string) {
    return this.returnOrders.complete(id);
  }

  // ── POST /api/v2/sales/returns/:id/cancel ────────────────────────────────

  @Post(':id/cancel')
  @RequireMenu('MENU_SALES2_RETURN', 'E')
  cancel(
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    return this.returnOrders.cancel(id, reason);
  }
}
