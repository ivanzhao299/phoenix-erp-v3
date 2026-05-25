import {
  Controller, Get, Post, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { DataScopeGuard } from '../../org/guards/data-scope.guard';
import { ShareholderFundsService, CreateShareholderFundDto, QueryShareholderFundDto } from '../services/shareholder-funds.service';

@Controller('api/v2/procurement/shareholder-funds')
@UseGuards(MenuGuard, DataScopeGuard)
export class ShareholderFundsController {
  constructor(private readonly svc: ShareholderFundsService) {}

  @Get()
  @RequireMenu('MENU_PRC2_FUND', 'V')
  list(@Query() q: QueryShareholderFundDto) {
    return this.svc.list(q);
  }

  @Get(':id')
  @RequireMenu('MENU_PRC2_FUND', 'V')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  @RequireMenu('MENU_PRC2_FUND', 'C')
  create(@Body() dto: CreateShareholderFundDto) {
    return this.svc.create(dto);
  }

  @Post(':id/submit')
  @RequireMenu('MENU_PRC2_FUND', 'E')
  submit(@Param('id') id: string) {
    return this.svc.submit(id);
  }

  @Post(':id/cancel')
  @RequireMenu('MENU_PRC2_FUND', 'E')
  cancel(@Param('id') id: string) {
    return this.svc.cancel(id);
  }
}
