import {
  Controller, Get, Post, Param, Query, Body, UseGuards,
  ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { DataScopeGuard } from '../../org/guards/data-scope.guard';
import { UatTrainingService, CreateTrainingDto } from '../services/uat-training.service';

@Controller('api/uat/trainings')
@UseGuards(AuthGuard('jwt'), MenuGuard, DataScopeGuard)
export class UatTrainingController {
  constructor(private readonly trainingService: UatTrainingService) {}

  @Get()
  @RequireMenu('MENU_UAT', 'V')
  async list(
    @Query('trainingType')                                      trainingType?: string,
    @Query('companyCode')                                       companyCode?:  string,
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe)    page?:         number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe)    limit?:        number,
  ) {
    return this.trainingService.list({ trainingType, companyCode, page, limit });
  }

  @Get('summary')
  @RequireMenu('MENU_UAT', 'V')
  async summary(@Query('companyCode') companyCode?: string) {
    return this.trainingService.getSummary(companyCode);
  }

  @Post()
  @RequireMenu('MENU_UAT', 'C')
  async create(@Body() body: CreateTrainingDto) {
    return this.trainingService.create(body);
  }
}
