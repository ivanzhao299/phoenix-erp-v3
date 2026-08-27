import { Controller, Get, Post, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { WmsService } from './wms.service';
import { RequireMenu, MenuGuard } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';

// 同步暴露 /api/stocktake/daily-close 给前端 daily-close 页（避免改前端）
// [Fix Pack 1 — HIGH-3] 添加 DataScopeGuard
@Controller('api/stocktake')
@UseGuards(MenuGuard, DataScopeGuard)
export class StocktakeController {
  constructor(private readonly wmsService: WmsService) {}

  @Get('daily-close')
  @RequireMenu('MENU_WMS_VIEW', 'V')
  async getDailyCloseSummary(@Query('date') date: string) {
    return await this.wmsService.getDailyCloseSummary(date);
  }

  @Post('daily-close')
  @RequireMenu('MENU_INV_BATCH', 'E')
  async executeDailyClose(@Body() body: any, @Req() req: any) {
    return await this.wmsService.executeDailyClose(body, req.user);
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
  async syncPda(@Body() body: any, @Req() req: any) {
    return await this.wmsService.syncPda(body, req.user);
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
  @RequireMenu('MENU_INV_BATCH', 'E')
  async approveStocktake(@Body() body: any, @Req() req: any) {
    return await this.wmsService.approveStocktake(body, req.user);
  }

  // PDA 盘点录入（现场逐批扫码盘点，差额即时入账）— 供 /terminal/wms/stocktake 使用
  @Post('stocktake/pda-count')
  @RequireMenu('MENU_WMS_INOUT', 'E')
  async pdaStocktakeCount(@Body() body: any, @Req() req: any) {
    return await this.wmsService.pdaStocktakeCount(body, req.user);
  }

  // A5: 损耗审批（扣减入账）
  @Post('loss/approve')
  @RequireMenu('MENU_INV_BATCH', 'E')
  async approveLoss(@Body() body: any, @Req() req: any) {
    return await this.wmsService.approveLoss(body, req.user);
  }
}
