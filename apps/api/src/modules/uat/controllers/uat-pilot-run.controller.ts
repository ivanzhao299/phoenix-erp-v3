import {
  Controller, Get, Post, Patch, Param, Query, Body, UseGuards,
  ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { DataScopeGuard } from '../../org/guards/data-scope.guard';
import { UatPilotRunService, CreatePilotRunDto, UpdatePilotRunDto } from '../services/uat-pilot-run.service';

@Controller('api/uat/pilot-runs')
@UseGuards(AuthGuard('jwt'), MenuGuard, DataScopeGuard)
export class UatPilotRunController {
  constructor(private readonly pilotRunService: UatPilotRunService) {}

  @Get()
  @RequireMenu('MENU_UAT', 'V')
  async list(
    @Query('status')                                            status?:      string,
    @Query('companyCode')                                       companyCode?: string,
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe)    page?:        number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe)    limit?:       number,
  ) {
    return this.pilotRunService.list({ status, companyCode, page, limit });
  }

  @Get('summary')
  @RequireMenu('MENU_UAT', 'V')
  async summary() {
    return this.pilotRunService.getSummary();
  }

  @Get(':id')
  @RequireMenu('MENU_UAT', 'V')
  async getOne(@Param('id', ParseIntPipe) id: number) {
    return this.pilotRunService.getOne(id);
  }

  @Post()
  @RequireMenu('MENU_UAT', 'C')
  async create(@Body() body: CreatePilotRunDto) {
    return this.pilotRunService.create(body);
  }

  @Patch(':id')
  @RequireMenu('MENU_UAT', 'E')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdatePilotRunDto,
  ) {
    return this.pilotRunService.update(id, body);
  }
}
