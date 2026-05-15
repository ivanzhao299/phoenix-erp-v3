import { Controller, Get, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { WmsService } from './wms.service';
import { RequireMenu, MenuGuard } from '../../common/guards/menu.guard';

@Controller('api/outbound')
@UseGuards(MenuGuard)
export class OutboundController {
  constructor(private readonly wmsService: WmsService) {}

  @Get('dashboard')
  @RequireMenu('MENU_WMS_OUTBOUND', 'V')
  async getDashboard() {
    return await this.wmsService.getOutboundDashboard();
  }

  @Get('orders')
  @RequireMenu('MENU_WMS_OUTBOUND', 'V')
  async getOrders() {
    return await this.wmsService.getPendingOutbound();
  }

  @Get('orders/:order_no')
  @RequireMenu('MENU_WMS_OUTBOUND', 'V')
  async getOrder(@Param('order_no') orderNo: string) {
    return await this.wmsService.getOutboundOrder(orderNo);
  }

  @Post('orders/:order_no/advance')
  @RequireMenu('MENU_WMS_OUTBOUND', 'E')
  async advanceOrder(@Param('order_no') orderNo: string, @Body() body: any, @Req() req: any) {
    return await this.wmsService.advanceOutboundOrder(orderNo, body, req.user);
  }

  @Post('orders/:order_no/receive-sign')
  @RequireMenu('MENU_WMS_OUTBOUND', 'E')
  async receiveSign(@Param('order_no') orderNo: string, @Body() body: any, @Req() req: any) {
    return await this.wmsService.receiveSignOrder(orderNo, body, req.user);
  }
}
