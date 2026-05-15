import { Controller, Post, Get, Body, Req, UseGuards } from '@nestjs/common';
import { TerminalService } from './terminal.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('api/stocktake')
@UseGuards(AuthGuard('jwt'))
export class StocktakeController {
  constructor(private readonly terminalService: TerminalService) {}

  @Get('tasks')
  async getStocktakeTasks() {
    return await this.terminalService.getStocktakeTasks();
  }
}

@Controller('api/dailyClose')
@UseGuards(AuthGuard('jwt'))
export class DailyCloseController {
  constructor(private readonly terminalService: TerminalService) {}

  @Post('submit')
  async submitDailyClose(@Body() body: any, @Req() req: any) {
    const userId = req.user?.userId || 1;
    return await this.terminalService.submitDailyClose(body.warehouse_code, body.date, userId);
  }
}
