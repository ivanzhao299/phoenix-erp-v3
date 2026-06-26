import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';
import { WorkflowService } from './workflow.service';

// [Phase R1 — HIGH-3] 添加 DataScopeGuard
@Controller('api/workflow/data-sources')
@UseGuards(MenuGuard, DataScopeGuard)
export class WorkflowDatasourceController {
  constructor(private readonly workflow: WorkflowService) {}

  @Get()
  @RequireMenu('MENU_WORKFLOW_FORM', 'V')
  list(@Query() query: any) {
    return this.workflow.listDataSources(query);
  }

  @Post()
  @RequireMenu('MENU_WORKFLOW_FORM', 'C')
  create(@Body() body: any, @Req() req: any) {
    return this.workflow.createDataSource(body, req.user);
  }

  @Post('sync-defaults')
  @RequireMenu('MENU_WORKFLOW_FORM', 'C')
  syncDefaults(@Req() req: any) {
    return this.workflow.syncDefaultDataSources(req.user);
  }

  @Post('refresh-metadata')
  @RequireMenu('MENU_WORKFLOW_FORM', 'E')
  refreshMetadata(@Req() req: any) {
    return this.workflow.refreshDataSourceMetadata(req.user);
  }

  @Get(':code/field-suggestions')
  @RequireMenu('MENU_WORKFLOW_FORM', 'V')
  fieldSuggestions(@Param('code') code: string, @Req() req: any) {
    return this.workflow.suggestDataSourceFields(code, req.user);
  }

  @Put(':id')
  @RequireMenu('MENU_WORKFLOW_FORM', 'E')
  update(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.updateDataSource(Number(id), body, req.user);
  }

  @Post('preview')
  @RequireMenu('MENU_WORKFLOW_FORM', 'V')
  preview(@Body() body: any) {
    return this.workflow.previewDataSource(body);
  }
}
