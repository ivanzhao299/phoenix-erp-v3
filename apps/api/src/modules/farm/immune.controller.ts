import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { DataScopeGuard } from '../org/guards/data-scope.guard';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { ImmuneService } from './immune.service';

function operatorFrom(req: any): string {
  const user = req?.user ?? {};
  return String(user.username ?? user.name ?? user.realNameZh ?? user.userId ?? user.id ?? user.sub ?? 'unknown');
}

@Controller('api/farm')
@UseGuards(MenuGuard, DataScopeGuard)
@RequireMenu('MENU_FARM_VET', 'V')
export class ImmuneController {
  constructor(private readonly service: ImmuneService) {}

  @Get('immune/plans')
  async list(@Query() query: { site_code?: string; farm_code?: string; status?: string }) {
    return { code: 200, data: await this.service.list(query) };
  }

  @Post('immune/plans')
  @RequireMenu('MENU_FARM_VET', 'C')
  async create(@Body() body: any, @Req() req: any) {
    return { code: 201, data: await this.service.create(body, operatorFrom(req)) };
  }

  @Post('immune/plans/:id/execute')
  @RequireMenu('MENU_FARM_VET', 'E')
  async execute(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return { code: 200, data: await this.service.execute(Number(id), body, operatorFrom(req)) };
  }

  @Post('immune/plans/:id/cancel')
  @RequireMenu('MENU_FARM_VET', 'E')
  async cancel(@Param('id') id: string, @Req() req: any) {
    return { code: 200, data: await this.service.cancel(Number(id), operatorFrom(req)) };
  }
}
