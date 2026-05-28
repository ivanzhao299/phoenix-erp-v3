import {
  Controller, Get, Post, Patch, Param, Body, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { DataScopeGuard } from '../../org/guards/data-scope.guard';
import { ChannelsService } from '../services/channels.service';
import { CreateChannelDto, UpdateChannelDto, QueryChannelDto } from '../dto/channel.dto';

@Controller('api/v2/sales/channels')
@UseGuards(MenuGuard, DataScopeGuard)
export class SalesChannelsController {
  constructor(private readonly svc: ChannelsService) {}

  @Get()
  @RequireMenu('MENU_SALES2_CHANNEL', 'V')
  list(@Query() q: QueryChannelDto) {
    return this.svc.list(q);
  }

  @Get(':id')
  @RequireMenu('MENU_SALES2_CHANNEL', 'V')
  findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Post()
  @RequireMenu('MENU_SALES2_CHANNEL', 'C')
  create(@Body() dto: CreateChannelDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @RequireMenu('MENU_SALES2_CHANNEL', 'E')
  update(@Param('id') id: string, @Body() dto: UpdateChannelDto) {
    return this.svc.update(id, dto);
  }

  @Post(':id/activate')
  @RequireMenu('MENU_SALES2_CHANNEL', 'E')
  @HttpCode(HttpStatus.OK)
  activate(@Param('id') id: string) {
    return this.svc.activate(id);
  }

  @Post(':id/deactivate')
  @RequireMenu('MENU_SALES2_CHANNEL', 'E')
  @HttpCode(HttpStatus.OK)
  deactivate(@Param('id') id: string) {
    return this.svc.deactivate(id);
  }
}
