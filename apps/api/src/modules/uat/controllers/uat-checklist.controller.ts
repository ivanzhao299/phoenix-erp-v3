import {
  Controller, Get, Patch, Param, Query, Body, UseGuards,
  ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { DataScopeGuard } from '../../org/guards/data-scope.guard';
import { ClsService } from 'nestjs-cls';
import { UatChecklistService, UpdateChecklistDto } from '../services/uat-checklist.service';

@Controller('api/uat/checklists')
@UseGuards(AuthGuard('jwt'), MenuGuard, DataScopeGuard)
export class UatChecklistController {
  constructor(
    private readonly checklistService: UatChecklistService,
    private readonly cls: ClsService,
  ) {}

  /** 按模块分组（含统计） */
  @Get('grouped')
  @RequireMenu('MENU_UAT', 'V')
  async grouped(@Query('companyCode') companyCode?: string) {
    return this.checklistService.listGrouped(companyCode);
  }

  /** 验收进度统计 */
  @Get('progress')
  @RequireMenu('MENU_UAT', 'V')
  async progress(@Query('companyCode') companyCode?: string) {
    return this.checklistService.getProgress(companyCode);
  }

  /** 平铺列表 */
  @Get()
  @RequireMenu('MENU_UAT', 'V')
  async list(
    @Query('moduleCode')                                        moduleCode?:  string,
    @Query('status')                                            status?:      string,
    @Query('companyCode')                                       companyCode?: string,
    @Query('page',  new DefaultValuePipe(1),   ParseIntPipe)   page?:        number,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe)   limit?:       number,
  ) {
    return this.checklistService.list({ moduleCode, status, companyCode, page, limit });
  }

  /** 更新验收项结果 */
  @Patch(':id')
  @RequireMenu('MENU_UAT', 'E')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateChecklistDto,
  ) {
    const user = this.cls.get('user');
    return this.checklistService.update(id, {
      ...body,
      testerId:   body.testerId  ?? user?.userId ?? user?.id,
      testerName: body.testerName ?? user?.name ?? user?.username,
    });
  }
}
