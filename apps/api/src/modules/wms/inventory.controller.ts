import { WarehouseDailyCloseService } from './warehouse-daily-close.service';
import { Controller, Get, Post, Body, Param, Query, UseGuards, Req, GoneException } from '@nestjs/common';
import { WmsService } from './wms.service';
import { RequireMenu, MenuGuard } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';

@Controller('api/stocktake')
@UseGuards(MenuGuard, DataScopeGuard)
export class StocktakeController {
  constructor(private readonly dailyClose: WarehouseDailyCloseService) {}

  @Get('daily-close/warehouses')
  @RequireMenu('MENU_WMS_INOUT', 'V')
  warehouses() {
    return this.dailyClose.warehouses();
  }

  @Get('daily-close')
  @RequireMenu('MENU_WMS_INOUT', 'V')
  getDailyCloseSummary(@Query('warehouse_code') warehouse: string, @Query('date') date: string) {
    return this.dailyClose.summary(warehouse, date);
  }

  @Post('daily-close')
  @RequireMenu('MENU_WMS_INOUT', 'A')
  executeDailyClose(@Body() body: any, @Req() req: any) {
    return this.dailyClose.close(body?.warehouse_code, body?.date, body?.version, body?.request_key,
      req.user?.userId ?? req.user?.id ?? req.user?.username);
  }
}

@Controller('api/inventory')
@UseGuards(MenuGuard, DataScopeGuard)
export class InventoryController {
  constructor(private readonly wmsService: WmsService) {}

  @Get('batches')
  @RequireMenu('MENU_WMS_VIEW', 'V', ['MENU_INV_BATCH', 'MENU_WMS_INOUT'])
  async getBatches() {
    return await this.wmsService.getInventoryBatches();
  }

  // 库存批次概览聚合：前端 analytics/inventory 改调本端点（服务端 reduce，覆盖全量在范围批次）
  @Get('dashboard/documents')
  @RequireMenu('MENU_WMS_INOUT', 'V')
  dashboardDocuments() {
    return this.wmsService.getWarehouseDashboardDocuments();
  }

  @Get('batches/query')
  @RequireMenu('MENU_WMS_VIEW', 'V', ['MENU_INV_BATCH', 'MENU_WMS_INOUT'])
  async queryBatches(@Query() query: Record<string, unknown>) {
    return await this.wmsService.queryInventoryBatches(query);
  }

  @Get('batches/summary')
  @RequireMenu('MENU_WMS_VIEW', 'V', ['MENU_INV_BATCH', 'MENU_WMS_INOUT'])
  async getBatchesSummary() {
    return await this.wmsService.getInventoryBatchesSummary();
  }

  @Get('receiving/orders')
  @RequireMenu('MENU_WMS_VIEW', 'V')
  async getReceivingOrders() {
    return await this.wmsService.getReceivingOrders();
  }

  @Get('receiving/orders/:order_no/items')
  @RequireMenu('MENU_WMS_VIEW', 'V')
  async getReceivingOrderItems(@Param('order_no') orderNo: string) {
    return await this.wmsService.getReceivingOrderItems(orderNo);
  }

  @Post('receiving/orders/:order_no/confirm')
  @RequireMenu('MENU_INV_BATCH', 'E')
  async confirmReceivingOrder(@Param('order_no') orderNo: string, @Body() body: any, @Req() req: any) {
    return await this.wmsService.confirmReceivingOrder(orderNo, body, req.user);
  }

  @Post('sync-pda')
  @RequireMenu('MENU_PDA', 'C')
  syncPda() {
    throw new GoneException('请升级终端并在对应收货、发运或盘点单据中提交');
  }

  // A4: 调拨确认（原子）
  @Post('transfer/confirm')
  @RequireMenu('MENU_INV_BATCH', 'E')
  async confirmTransfer(@Body() body: any, @Req() req: any) {
    return await this.wmsService.confirmTransfer(body, req.user);
  }

  @Post('transfer')
  @RequireMenu('MENU_INV_BATCH', 'E')
  async createTransfer(@Body() body: any, @Req() req: any) {
    return await this.wmsService.createTransfer(body, req.user);
  }

  @Get('transfer/:transfer_no')
  @RequireMenu('MENU_INV_BATCH', 'V')
  getTransfer(@Param('transfer_no') transferNo: string) {
    return this.wmsService.getTransferForWarehouse(transferNo);
  }

  @Post('transfer/:transfer_no/dispatch')
  @RequireMenu('MENU_INV_BATCH', 'E')
  async dispatchTransfer(@Param('transfer_no') transferNo: string, @Req() req: any) {
    return await this.wmsService.dispatchTransfer(transferNo, req.user);
  }

  @Post('transfer/:transfer_no/receive')
  @RequireMenu('MENU_INV_BATCH', 'E')
  async receiveTransfer(@Param('transfer_no') transferNo: string, @Body() body: any, @Req() req: any) {
    return await this.wmsService.receiveTransfer(transferNo, body, req.user);
  }

  @Post('transfer/:transfer_no/complete')
  @RequireMenu('MENU_INV_BATCH', 'E')
  async completeTransfer(@Param('transfer_no') transferNo: string, @Body() body: any, @Req() req: any) {
    return await this.wmsService.completeTransfer(transferNo, body, req.user);
  }

  // A5: 盘点审批（差额入账）
  @Post('stocktake/approve')
  @RequireMenu('MENU_WMS_INOUT', 'A')
  async approveStocktake(@Body() body: any, @Req() req: any) {
    return await this.wmsService.approveStocktake(body, req.user);
  }

  // PDA 盘点录入（现场逐批扫码盘点，差额即时入账）— 供 /terminal/wms/stocktake 使用
  @Get('stocktake/batches')
  @RequireMenu('MENU_WMS_INOUT', 'V')
  async stocktakeBatches(@Query('batch_no') batchNo?: string) {
    return await this.wmsService.getStocktakeBatches(batchNo);
  }

  @Post('stocktake/pda-count')
  @RequireMenu('MENU_WMS_INOUT', 'E')
  async pdaStocktakeCount(@Body() body: any, @Req() req: any) {
    return await this.wmsService.pdaStocktakeCount(body, req.user);
  }

  // A5: 损耗审批（扣减入账）
  @Post('loss/approve')
  @RequireMenu('MENU_WMS_INOUT', 'A')
  async approveLoss(@Body() body: any, @Req() req: any) {
    return await this.wmsService.approveLoss(body, req.user);
  }

  /** DIRTY/CRACKED/BROKEN/DAMAGED 内部处置，统一扣减 inv_batches 并写 inv_ledger。 */
  @Post('defect-disposition')
  @RequireMenu('MENU_INV_BATCH', 'E', ['MENU_WMS_ISSUE'])
  async disposeDefectInventory(@Body() body: any, @Req() req: any) {
    return await this.wmsService.disposeDefectInventory(body, req.user);
  }
}
