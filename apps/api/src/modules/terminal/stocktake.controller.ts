import { Controller, Post, Get, Body, Req, UseGuards } from '@nestjs/common';
import { TerminalService } from './terminal.service';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';

// [Fix Pack 1 — HIGH-2] 替换 AuthGuard → MenuGuard，添加 RequireMenu
// [Phase R1 — HIGH-3] 添加 DataScopeGuard
@Controller('api/stocktake')
@UseGuards(MenuGuard, DataScopeGuard)
@RequireMenu('MENU_PKG_MGR', 'V')
export class StocktakeController {
  constructor(private readonly terminalService: TerminalService) {}

  @Get('tasks')
  async getStocktakeTasks() {
    return await this.terminalService.getStocktakeTasks();
  }
}

// [Phase R1 — HIGH-3] 添加 DataScopeGuard
@Controller('api/dailyClose')
@UseGuards(MenuGuard, DataScopeGuard)
@RequireMenu('MENU_PKG_MGR', 'E')
export class DailyCloseController {
  constructor(private readonly terminalService: TerminalService) {}

  @Post('submit')
  async submitDailyClose(@Body() body: any, @Req() req: any) {
    const userId = req.user?.userId || 1;
    return await this.terminalService.submitDailyClose(body.warehouse_code, body.date, userId);
  }
}
