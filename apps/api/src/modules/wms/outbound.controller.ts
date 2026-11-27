import { Controller, Get, Post, Put, GoneException, Body, Param, UseGuards, Req } from '@nestjs/common';
import { WmsService } from './wms.service';
import { RequireMenu, MenuGuard } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';

// [Fix Pack 1 — HIGH-3] 添加 DataScopeGuard
@Controller('api/outbound')
@UseGuards(MenuGuard, DataScopeGuard)
export class OutboundController {
  constructor(private readonly wmsService: WmsService) {}

  @Get('dashboard')
  @RequireMenu('MENU_WMS_INOUT', 'V')
  async getDashboard() {
    return await this.wmsService.getOutboundDashboard();
  }

  @Get('orders')
  @RequireMenu('MENU_WMS_INOUT', 'V')
  async getOrders() {
    return await this.wmsService.getPendingOutbound();
  }

  @Get('orders/:order_no')
  @RequireMenu('MENU_WMS_INOUT', 'V')
  async getOrder(@Param('order_no') orderNo: string) {
    return await this.wmsService.getOutboundOrder(orderNo);
  }

  @Post('orders/:order_no/advance')
  @RequireMenu('MENU_WMS_INOUT', 'E')
  async advanceOrder(@Param('order_no') _orderNo: string) {
    throw new GoneException('历史订单只读，请在仓储终端打开销售配送装车任务');
  }

  @Post('batch')
  @RequireMenu('MENU_WMS_INOUT', 'C', ['MENU_WMS_ISSUE'])
  async createBatch(@Body() body: any, @Req() req: any) {
    return await this.wmsService.createBatchStandaloneOutbound(body, req.user);
  }

  @Post('batch/confirm')
  @RequireMenu('MENU_WMS_INOUT', 'E', ['MENU_WMS_ISSUE'])
  async confirmBatch(@Body() body: any, @Req() req: any) {
    return await this.wmsService.confirmBatchStandaloneOutbound(body, req.user);
  }

  @Post('standalone/:outbound_no/confirm')
  @RequireMenu('MENU_WMS_INOUT', 'E', ['MENU_WMS_ISSUE'])
  async confirmStandalone(@Param('outbound_no') outboundNo: string, @Req() req: any) {
    return await this.wmsService.confirmStandaloneOutbound(outboundNo, req.user);
  }

  @Post('standalone')
  @RequireMenu('MENU_WMS_INOUT', 'C', ['MENU_WMS_ISSUE'])
  async createStandalone(@Body() body: any, @Req() req: any) {
    return await this.wmsService.createStandaloneOutbound(body, req.user);
  }

  @Put('standalone/:outbound_no')
  @RequireMenu('MENU_WMS_INOUT', 'E', ['MENU_WMS_ISSUE'])
  async updateStandalone(
    @Param('outbound_no') outboundNo: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    return await this.wmsService.updateStandaloneOutbound(outboundNo, body, req.user);
  }

  @Post('orders/:order_no/receive-sign')
  @RequireMenu('MENU_WMS_INOUT', 'E')
  async receiveSign() {
    throw new GoneException('历史订单只读，请在销售配送单办理签收');
  }

  /** Compatibility alias for warehouse clients that group internal actions under outbound. */
  @Post('defect-disposition')
  @RequireMenu('MENU_WMS_ISSUE', 'E', ['MENU_INV_BATCH'])
  async disposeDefectInventory(@Body() body: any, @Req() req: any) {
    return await this.wmsService.disposeDefectInventory(body, req.user);
  }
}
