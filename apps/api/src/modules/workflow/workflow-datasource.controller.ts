import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { WorkflowService } from './workflow.service';

@Controller('api/workflow/data-sources')
@UseGuards(MenuGuard)
export class WorkflowDatasourceController {
  constructor(private readonly workflow: WorkflowService) {}

  @Get()
  @RequireMenu('MENU_WORKFLOW', 'V')
  list(@Query() query: any) {
    return this.workflow.listDataSources(query);
  }

  @Post()
  @RequireMenu('MENU_WORKFLOW', 'C')
  create(@Body() body: any, @Req() req: any) {
    return this.workflow.createDataSource(body, req.user);
  }

  @Post('sync-defaults')
  @RequireMenu('MENU_WORKFLOW', 'C')
  syncDefaults(@Req() req: any) {
    return this.workflow.syncDefaultDataSources(req.user);
  }

  @Post('refresh-metadata')
  @RequireMenu('MENU_WORKFLOW', 'C')
  refreshMetadata(@Req() req: any) {
    return this.workflow.refreshDataSourceMetadata(req.user);
  }

  @Get(':code/field-suggestions')
  @RequireMenu('MENU_WORKFLOW', 'V')
  fieldSuggestions(@Param('code') code: string, @Req() req: any) {
    return this.workflow.suggestDataSourceFields(code, req.user);
  }

  @Put(':id')
  @RequireMenu('MENU_WORKFLOW', 'E')
  update(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.updateDataSource(Number(id), body, req.user);
  }

  @Post('preview')
  @RequireMenu('MENU_WORKFLOW', 'V')
  preview(@Body() body: any) {
    return this.workflow.previewDataSource(body);
  }
}
