import { Controller, Post, Get, GoneException, Req, UseGuards } from '@nestjs/common';
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
  async getStocktakeTasks(@Req() req: any) {
    return await this.terminalService.getStocktakeTasks(req.dataScope);
  }
}

// [Phase R1 — HIGH-3] 添加 DataScopeGuard
@Controller('api/dailyClose')
@UseGuards(MenuGuard, DataScopeGuard)
@RequireMenu('MENU_PKG_MGR', 'E')
export class DailyCloseController {
  @Post('submit')
  submitDailyClose() {
    throw new GoneException('请升级到仓库日结工作台，提交仓库、业务日期和预览版本');
  }
}
