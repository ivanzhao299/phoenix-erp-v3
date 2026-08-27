import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { DataScopeGuard } from '../../org/guards/data-scope.guard';
import { StoreReplenishmentService } from '../services/store-replenishment.service';

@Controller('api/v2/store-replenishments')
@UseGuards(MenuGuard, DataScopeGuard)
export class StoreReplenishmentController {
  constructor(private readonly service: StoreReplenishmentService) {}

  @Get()
  @RequireMenu('MENU_STORE_REPLENISH', 'V')
  list(@Query('storeCode') storeCode?: string, @Query('status') status?: string) {
    return this.service.list({ storeCode, status });
  }

  @Get('source-warehouses')
  @RequireMenu('MENU_STORE_REPLENISH', 'V')
  sourceWarehouses(@Query('storeCode') storeCode: string) { return this.service.sourceWarehouses(storeCode); }

  @Post()
  @RequireMenu('MENU_STORE_REPLENISH', 'C')
  create(@Body() body: any) { return this.service.create(body); }

  @Post(':id/submit')
  @RequireMenu('MENU_STORE_REPLENISH', 'C')
  submit(@Param('id', ParseIntPipe) id: number) { return this.service.submit(id); }

  @Post(':id/approve')
  @RequireMenu('MENU_STORE_REPLENISH', 'A')
  approve(@Param('id', ParseIntPipe) id: number, @Body() body: any, @Req() req: any) { return this.service.approve(id, body, req.user); }

  @Post(':id/dispatch')
  @RequireMenu('MENU_STORE_REPLENISH', 'E')
  dispatch(@Param('id', ParseIntPipe) id: number, @Req() req: any) { return this.service.dispatch(id, req.user); }

  @Post(':id/receive')
  @RequireMenu('MENU_STORE_REPLENISH', 'E')
  receive(@Param('id', ParseIntPipe) id: number, @Body() body: any, @Req() req: any) { return this.service.receive(id, body, req.user); }

  @Post(':id/close')
  @RequireMenu('MENU_STORE_REPLENISH', 'E')
  close(@Param('id', ParseIntPipe) id: number, @Body() body: any, @Req() req: any) { return this.service.close(id, body, req.user); }

  @Get(':id/transfer')
  @RequireMenu('MENU_STORE_REPLENISH', 'V')
  transfer(@Param('id', ParseIntPipe) id: number) { return this.service.transferDetail(id); }
}
