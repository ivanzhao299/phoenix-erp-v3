import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { DataScopeGuard } from '../../org/guards/data-scope.guard';
import { SalesActivityQuery, SalesActivityService } from '../services/sales-activity.service';

@Controller('api/v2/sales/activity')
@UseGuards(MenuGuard, DataScopeGuard)
@RequireMenu('MENU_SALES2_ORDER', 'V', ['MENU_STORE_POS'])
export class SalesActivityController {
  constructor(private readonly service: SalesActivityService) {}

  @Get()
  list(@Query() query: SalesActivityQuery) {
    return this.service.list(query);
  }
}
