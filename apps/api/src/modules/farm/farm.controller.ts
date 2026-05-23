import { Controller, Post, Put, Get, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FarmService, OrgScope } from './farm.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller('api/v3/farm')
@UseGuards(AuthGuard('jwt'))
export class FarmController {
  constructor(private readonly farmService: FarmService) {}

  /** 从 JWT 派生组织作用域 */
  private getScope(req: any): OrgScope {
    const storeCode: string | undefined = req.user?.storeCode;
    const isGlobal =
      !storeCode ||
      storeCode === 'ALL' ||
      (req.user?.permissions || []).includes('*') ||
      req.user?.username === 'admin';
    return { isGlobal, farmCode: isGlobal ? null : storeCode };
  }

  @Post('daily-logs')
  @UseGuards(RolesGuard)
  @Roles('ROLE_ADMIN', 'ROLE_FARM_MGR', 'ROLE_VET', 'ROLE_BREEDER')
  async submitBreedingDailyLog(@Body() body: any, @Req() req: any) {
    return await this.farmService.submitBreedingDailyLog(body, this.getScope(req));
  }

  @Put('daily-logs/:id')
  @UseGuards(RolesGuard)
  @Roles('ROLE_ADMIN', 'ROLE_FARM_MGR', 'ROLE_VET', 'ROLE_BREEDER')
  async updateBreedingDailyLog(@Param('id') id: number, @Body() body: any) {
    return await this.farmService.updateBreedingDailyLog(id, body);
  }

  @Get('daily-hen-report')
  async getDailyHenReport(@Query('date') date: string, @Req() req: any) {
    const d = date || new Date().toISOString().slice(0, 10);
    return await this.farmService.getDailyHenReport(d, this.getScope(req));
  }

  @Get('trend')
  async getFarmTrend(@Query('days') days: string, @Req() req: any) {
    return await this.farmService.getFarmTrend(Number(days) || 7, this.getScope(req));
  }
}
