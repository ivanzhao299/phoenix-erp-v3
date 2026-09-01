import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { DataScopeGuard } from '../../org/guards/data-scope.guard';
import { StoreSettlementService } from '../services/store-settlement.service';

@Controller('api/v2/store-settlements')
@UseGuards(MenuGuard, DataScopeGuard)
export class StoreSettlementController {
  constructor(private readonly service: StoreSettlementService) {}

  @Post('build') @RequireMenu('MENU_STORE_SETTLEMENT','E')
  build(@Body() dto: {storeCode:string;businessDate:string}) { return this.service.build(dto.storeCode,dto.businessDate); }

  @Get(':id') @RequireMenu('MENU_STORE_SETTLEMENT','V')
  get(@Param('id',ParseIntPipe) id:number) { return this.service.get(id); }

  @Post(':id/reconcile') @RequireMenu('MENU_STORE_SETTLEMENT','E')
  reconcile(@Param('id',ParseIntPipe) id:number,
    @Body() dto:{tenderId:number;paymentRecordIds:number[];reason:string;evidence:string}) {
    return this.service.reconcile(id,dto);
  }

  @Post(':id/post') @RequireMenu('MENU_STORE_SETTLEMENT','E')
  post(@Param('id',ParseIntPipe) id:number) { return this.service.post(id); }
}
