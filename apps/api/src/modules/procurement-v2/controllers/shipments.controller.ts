import {
  Controller, Get, Post, Patch, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { DataScopeGuard } from '../../../modules/org/guards/data-scope.guard';

import { ShipmentsService }     from '../services/shipments.service';
import { CreateShipmentDto }    from '../dto/create-shipment.dto';
import { UpdateShipmentDto }    from '../dto/update-shipment.dto';
import { QueryShipmentDto }     from '../dto/query-shipment.dto';
import { DispatchShipmentDto }  from '../dto/dispatch-shipment.dto';
import { CustomsShipmentDto }   from '../dto/customs-shipment.dto';
import { ArriveShipmentDto }    from '../dto/arrive-shipment.dto';
import { CancelShipmentDto }    from '../dto/cancel-shipment.dto';

@Controller('api/v2/procurement')
@UseGuards(MenuGuard, DataScopeGuard)
export class ShipmentsController {
  constructor(private readonly svc: ShipmentsService) {}

  @Get('shipments')
  @RequireMenu('MENU_PRC2_SHIPMENT', 'V')
  list(@Query() q: QueryShipmentDto) { return this.svc.list(q); }

  @Get('shipments/:id')
  @RequireMenu('MENU_PRC2_SHIPMENT', 'V')
  findById(@Param('id') id: string) { return this.svc.findById(id); }

  @Post('shipments')
  @RequireMenu('MENU_PRC2_SHIPMENT', 'C')
  create(@Body() dto: CreateShipmentDto) { return this.svc.create(dto); }

  @Patch('shipments/:id')
  @RequireMenu('MENU_PRC2_SHIPMENT', 'E')
  update(@Param('id') id: string, @Body() dto: UpdateShipmentDto) { return this.svc.update(id, dto); }

  @Post('shipments/:id/ready')
  @RequireMenu('MENU_PRC2_SHIPMENT', 'E')
  ready(@Param('id') id: string, @Body() dto: DispatchShipmentDto) { return this.svc.ready(id, dto); }

  @Post('shipments/:id/dispatch')
  @RequireMenu('MENU_PRC2_SHIPMENT', 'E')
  dispatch(@Param('id') id: string, @Body() dto: DispatchShipmentDto) { return this.svc.dispatch(id, dto); }

  @Post('shipments/:id/customs')
  @RequireMenu('MENU_PRC2_SHIPMENT', 'E')
  customs(@Param('id') id: string, @Body() dto: CustomsShipmentDto) { return this.svc.customs(id, dto); }

  @Post('shipments/:id/arrive')
  @RequireMenu('MENU_PRC2_SHIPMENT', 'E')
  arrive(@Param('id') id: string, @Body() dto: ArriveShipmentDto) { return this.svc.arrive(id, dto); }

  @Post('shipments/:id/cancel')
  @RequireMenu('MENU_PRC2_SHIPMENT', 'E')
  cancel(@Param('id') id: string, @Body() dto: CancelShipmentDto) { return this.svc.cancel(id, dto); }
}
