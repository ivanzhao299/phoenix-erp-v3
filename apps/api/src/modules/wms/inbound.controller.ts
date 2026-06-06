import { Controller, Get, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { WmsService } from './wms.service';
import { RequireMenu, MenuGuard } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';

// [Fix Pack 1 — HIGH-3] 添加 DataScopeGuard
@Controller('api/inbound')
@UseGuards(MenuGuard, DataScopeGuard)
export class InboundController {
  constructor(private readonly wmsService: WmsService) {}

  @Get('dashboard')
  @RequireMenu('MENU_WMS_INOUT', 'V')
  async getDashboard() {
    return await this.wmsService.getInboundDashboard();
  }

  @Get('pending')
  @RequireMenu('MENU_WMS_INOUT', 'V')
  async getPending() {
    return await this.wmsService.getPendingInbound();
  }

  @Get('task/:task_no')
  @RequireMenu('MENU_WMS_INOUT', 'V')
  async getTask(@Param('task_no') taskNo: string) {
    return await this.wmsService.getInboundTask(taskNo);
  }

  @Post('confirm')
  @RequireMenu('MENU_WMS_INOUT', 'C')
  async confirmInbound(@Body() body: any, @Req() req: any) {
    return await this.wmsService.confirmInbound(body, req.user);
  }
}
