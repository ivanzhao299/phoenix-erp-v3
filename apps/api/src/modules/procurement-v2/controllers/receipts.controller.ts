import {
  Controller, Get, Post, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { DataScopeGuard } from '../../../modules/org/guards/data-scope.guard';

import { ReceiptsService }      from '../services/receipts.service';
import { CreateReceiptDto }     from '../dto/create-receipt.dto';
import { QueryReceiptDto }      from '../dto/query-receipt.dto';
import { ConfirmReceiptDto }    from '../dto/confirm-receipt.dto';
import { CancelReceiptDto }     from '../dto/cancel-receipt.dto';

@Controller('api/v2/procurement')
@UseGuards(MenuGuard, DataScopeGuard)
export class ReceiptsController {
  constructor(private readonly svc: ReceiptsService) {}

  @Get('receipts')
  @RequireMenu('MENU_PRC2_RECEIPT', 'V')
  list(@Query() q: QueryReceiptDto) { return this.svc.list(q); }

  @Get('receipts/:id')
  @RequireMenu('MENU_PRC2_RECEIPT', 'V')
  findById(@Param('id') id: string) { return this.svc.findById(id); }

  @Post('receipts')
  @RequireMenu('MENU_PRC2_RECEIPT', 'C')
  create(@Body() dto: CreateReceiptDto) { return this.svc.create(dto); }

  @Post('receipts/validate-warehouse')
  @RequireMenu('MENU_PRC2_RECEIPT', 'E')
  validateWarehouse(@Body('warehouseCode') warehouseCode: string) {
    return this.svc.validateWarehouseUsage(warehouseCode);
  }

  @Post('receipts/:id/confirm')
  @RequireMenu('MENU_PRC2_RECEIPT', 'E')
  confirm(@Param('id') id: string, @Body() dto: ConfirmReceiptDto) { return this.svc.confirm(id, dto); }

  @Post('receipts/:id/cancel')
  @RequireMenu('MENU_PRC2_RECEIPT', 'E')
  cancel(@Param('id') id: string, @Body() dto: CancelReceiptDto) { return this.svc.cancel(id, dto); }
}
