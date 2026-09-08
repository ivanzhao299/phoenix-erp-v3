/**
 * Phoenix ERP V3 — Store POS Controller
 * Sales V2 Phase 9: 直营店收银作业台
 *
 * Routes (all under /api/v2/store-sales):
 *   GET    /                      — 销售记录列表
 *   POST   /                      — 新建销售单
 *   GET    /products              — 获取商品目录
 *   GET    /daily-summary         — 当日汇总
 *   GET    /shift                 — 当前班次（OPEN）
 *   POST   /shift/open            — 开班
 *   POST   /shift/close           — 交班/日结
 *   GET    /shift/history         — 班次历史列表
 *   GET    /:id                   — 销售单详情
 *   POST   /:id/pay-cash          — 收款（现金/转账）
 *   POST   /:id/pay-credit        — 赊销结账
 *   POST   /:id/pay-mixed         — 混合收款
 *   POST   /:id/void              — 作废
 */
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  DefaultValuePipe,
} from '@nestjs/common';
import { MenuGuard, RequireMenu }    from '../../../common/guards/menu.guard';
import { DataScopeGuard }            from '../../org/guards/data-scope.guard';
import { StorePosService }           from '../services/store-pos.service';
import { StorePosShiftService }      from '../services/store-pos-shift.service';
import { StoreScopePolicy }          from '../services/store-scope-policy.service';
import { StoreInventoryQueryService } from '../services/store-inventory-query.service';

@Controller('api/v2/store-sales')
@UseGuards(MenuGuard, DataScopeGuard)
export class StorePosController {
  constructor(
    private readonly posService:   StorePosService,
    private readonly shiftService: StorePosShiftService,
    private readonly storeScope: StoreScopePolicy,
    private readonly inventoryQuery: StoreInventoryQueryService,
  ) {}

  @Get('contexts')
  @RequireMenu('MENU_STORE_POS', 'V', ['MENU_STORE_MGR'])
  listContexts() { return this.storeScope.listMembershipStores(); }

  @Get('inventory')
  @RequireMenu('MENU_STORE_MGR', 'V')
  getInventory(
    @Query('storeCode') storeCode: string,
    @Query('status') status?: any,
    @Query('warehouseCode') warehouseCode?: string,
    @Query('zoneCode') zoneCode?: string,
    @Query('locationCode') locationCode?: string,
    @Query('sku') sku?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    return this.inventoryQuery.query({ storeCode, status, warehouseCode, zoneCode, locationCode, sku, page, limit });
  }

  // ─── 商品目录 ─────────────────────────────────────────────────────────────

  @Get('products')
  @RequireMenu('MENU_STORE_POS', 'V')
  getProducts(
    @Query('storeCode')   storeCode:   string,
    @Query('companyCode') companyCode: string,
  ) {
    return this.posService.getProducts(storeCode, companyCode);
  }

  // ─── 当日汇总 ─────────────────────────────────────────────────────────────

  @Get('daily-summary')
  @RequireMenu('MENU_STORE_POS', 'V')
  getDailySummary(@Query('storeCode') storeCode: string) {
    return this.posService.getDailySummary(storeCode);
  }

  // ─── 班次管理 ─────────────────────────────────────────────────────────────

  @Get('shift')
  @RequireMenu('MENU_STORE_POS', 'V')
  getCurrentShift(@Query('storeCode') storeCode: string) {
    return this.shiftService.getCurrentShift(storeCode);
  }

  @Post('shift/open')
  @RequireMenu('MENU_STORE_POS', 'C')
  openShift(
    @Body() dto: { storeCode: string; companyCode: string; openingCash: number },
  ) {
    return this.shiftService.openShift(dto);
  }

  @Post('shift/close')
  @RequireMenu('MENU_STORE_POS', 'C')
  closeShift(
    @Query('storeCode') storeCode: string,
    @Body() dto: { closingCash: number; remark?: string },
  ) {
    return this.shiftService.closeShift(storeCode, dto);
  }

  @Get('shift/history')
  @RequireMenu('MENU_STORE_POS', 'V')
  listShifts(
    @Query('storeCode')   storeCode?:   string,
    @Query('companyCode') companyCode?: string,
    @Query('status')      status?:      string,
    @Query('page',   new DefaultValuePipe(1),  ParseIntPipe) page?:  number,
    @Query('limit',  new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.shiftService.listShifts({ storeCode, companyCode, status, page, limit });
  }

  // ─── 销售单列表 ───────────────────────────────────────────────────────────

  @Get()
  @RequireMenu('MENU_STORE_POS', 'V')
  list(
    @Query('storeCode')     storeCode?:     string,
    @Query('companyCode')   companyCode?:   string,
    @Query('status')        status?:        string,
    @Query('saleType')      saleType?:      string,
    @Query('paymentStatus') paymentStatus?: string,
    @Query('dateFrom')      dateFrom?:      string,
    @Query('dateTo')        dateTo?:        string,
    @Query('page',   new DefaultValuePipe(1),  ParseIntPipe) page?:  number,
    @Query('limit',  new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.posService.list({
      storeCode, companyCode, status, saleType, paymentStatus,
      dateFrom, dateTo, page, limit,
    });
  }

  // ─── 新建销售单 ───────────────────────────────────────────────────────────

  @Post()
  @RequireMenu('MENU_STORE_POS', 'C')
  createSale(
    @Body() dto: {
      storeCode:      string;
      storeName:      string;
      companyCode:    string;
      companyName?:   string;
      customerCode?:  string;
      customerName?:  string;
      customerId?:    number;
      saleType:       'CASH' | 'CREDIT' | 'MIXED';
      paymentMethod?: string;
      discountAmount?: number;
      currencyCode?: string;
      items: Array<{
        productCode:    string;
        productName:    string;
        gradeCode?:     string;
        packagingSpec?: string;
        qty:            number;
        unitPrice:      number;
        skuCode?:       string;
        amount:         number;
        sortOrder?:     number;
      }>;
    },
  ) {
    return this.posService.createSale(dto);
  }

  // ─── 销售单详情 ───────────────────────────────────────────────────────────

  @Get(':id')
  @RequireMenu('MENU_STORE_POS', 'V')
  getDetail(@Param('id', ParseIntPipe) id: number) {
    return this.posService.getDetail(id);
  }

  // ─── 收款动作 ─────────────────────────────────────────────────────────────

  @Post(':id/pay-cash')
  @RequireMenu('MENU_STORE_POS', 'E')
  completeCashSale(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { cashAccountId: number; paidAmount: number; paymentMethod?: string; externalReference?: string; idempotencyKey: string },
  ) {
    return this.posService.completeCashSale(id, dto);
  }

  @Post(':id/pay-credit')
  @RequireMenu('MENU_STORE_POS', 'E')
  completeCreditSale(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { idempotencyKey: string },
  ) {
    return this.posService.completeCreditSale(id, dto);
  }

  @Post(':id/pay-mixed')
  @RequireMenu('MENU_STORE_POS', 'E')
  completeMixedSale(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: {
      cashAccountId:  number;
      paidAmount:     number;
      paymentMethod?: string;
      externalReference?: string;
      idempotencyKey: string;
    },
  ) {
    return this.posService.completeMixedSale(id, dto);
  }

  // ─── 作废 ─────────────────────────────────────────────────────────────────

  @Post(':id/void')
  @RequireMenu('MENU_STORE_POS', 'D')
  voidSale(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { reason: string },
  ) {
    return this.posService.voidSale(id, dto.reason);
  }

  // ─── 退货 / 冲红 ──────────────────────────────────────────────────────────

  @Post(':id/return')
  @RequireMenu('MENU_STORE_POS', 'D')
  returnSale(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { reason: string },
  ) {
    return this.posService.returnSale(id, dto.reason);
  }
}
