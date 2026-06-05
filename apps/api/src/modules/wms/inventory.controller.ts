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
@UseGuards(MenuGuard)
export class InventoryController {
  constructor(private readonly wmsService: WmsService) {}

  @Get('batches')
  @RequireMenu('MENU_WMS_VIEW', 'V')
  async getBatches() {
    return await this.wmsService.getInventoryBatches();
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

  // A5: 盘点审批（差额入账）
  @Post('stocktake/approve')
  @RequireMenu('MENU_INV_BATCH', 'E')
  async approveStocktake(@Body() body: any, @Req() req: any) {
    return await this.wmsService.approveStocktake(body, req.user);
  }

  // A5: 损耗审批（扣减入账）
  @Post('loss/approve')
  @RequireMenu('MENU_INV_BATCH', 'E')
  async approveLoss(@Body() body: any, @Req() req: any) {
    return await this.wmsService.approveLoss(body, req.user);
  }
}
