import {
  Controller, Get, Post, Patch, Param, Query, Body, UseGuards,
  ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { DataScopeGuard } from '../../org/guards/data-scope.guard';
import { ClsService } from 'nestjs-cls';
import { UatFeedbackService, CreateFeedbackDto, UpdateFeedbackDto } from '../services/uat-feedback.service';

@Controller('api/uat/feedbacks')
@UseGuards(AuthGuard('jwt'), MenuGuard, DataScopeGuard)
export class UatFeedbackController {
  constructor(
    private readonly feedbackService: UatFeedbackService,
    private readonly cls: ClsService,
  ) {}

  @Get()
  @RequireMenu('MENU_UAT', 'V')
  async list(
    @Query('status')                                            status?:      string,
    @Query('severity')                                          severity?:    string,
    @Query('moduleCode')                                        moduleCode?:  string,
    @Query('companyCode')                                       companyCode?: string,
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe)    page?:        number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe)    limit?:       number,
  ) {
    return this.feedbackService.list({ status, severity, moduleCode, companyCode, page, limit });
  }

  @Get('summary')
  @RequireMenu('MENU_UAT', 'V')
  async summary(@Query('companyCode') companyCode?: string) {
    return this.feedbackService.getSummary(companyCode);
  }

  @Get(':id')
  @RequireMenu('MENU_UAT', 'V')
  async getOne(@Param('id', ParseIntPipe) id: number) {
    return this.feedbackService.getOne(id);
  }

  @Post()
  @RequireMenu('MENU_UAT', 'C')
  async create(@Body() body: CreateFeedbackDto) {
    const user = this.cls.get('user');
    return this.feedbackService.create(
      body,
      user?.userId ?? user?.id,
      user?.name ?? user?.username,
    );
  }

  @Patch(':id')
  @RequireMenu('MENU_UAT', 'E')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateFeedbackDto,
  ) {
    return this.feedbackService.update(id, body);
  }
}
