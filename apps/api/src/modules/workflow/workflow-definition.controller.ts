import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';
import { WorkflowService } from './workflow.service';

// [Phase R1 — HIGH-3] 添加 DataScopeGuard
@Controller('api/workflow/definitions')
@UseGuards(MenuGuard, DataScopeGuard)
export class WorkflowDefinitionController {
  constructor(private readonly workflow: WorkflowService) {}

  @Get()
  @RequireMenu('MENU_WORKFLOW_CONFIG', 'V', ['MENU_WORKFLOW'])
  list(@Query() query: any) {
    return this.workflow.listDefinitions(query);
  }

  @Post()
  @RequireMenu('MENU_WORKFLOW_CONFIG', 'C', ['MENU_WORKFLOW'])
  create(@Body() body: any, @Req() req: any) {
    return this.workflow.createDefinition(body, req.user);
  }

  @Post('industry-templates/generate')
  @RequireMenu('MENU_WORKFLOW_CONFIG', 'C', ['MENU_WORKFLOW'])
  generateIndustryTemplates(@Req() req: any) {
    return this.workflow.generateIndustryTemplates(req.user);
  }

  @Post('from-data-source')
  @RequireMenu('MENU_WORKFLOW_CONFIG', 'C', ['MENU_WORKFLOW'])
  createFromDataSource(@Body() body: any, @Req() req: any) {
    return this.workflow.createDefinitionFromDataSource(body, req.user);
  }

  @Post(':id/clone')
  @RequireMenu('MENU_WORKFLOW_CONFIG', 'C', ['MENU_WORKFLOW'])
  clone(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.cloneDefinition(Number(id), body, req.user);
  }

  @Get(':id')
  @RequireMenu('MENU_WORKFLOW_CONFIG', 'V', ['MENU_WORKFLOW'])
  get(@Param('id') id: string) {
    return this.workflow.getDefinition(Number(id));
  }

  @Put(':id')
  @RequireMenu('MENU_WORKFLOW_CONFIG', 'E', ['MENU_WORKFLOW'])
  update(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.updateDefinition(Number(id), body, req.user);
  }

  @Post(':id/publish')
  @RequireMenu('MENU_WORKFLOW_CONFIG', 'E', ['MENU_WORKFLOW'])
  publish(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.publishDefinition(Number(id), body, req.user);
  }

  @Post(':id/disable')
  @RequireMenu('MENU_WORKFLOW_CONFIG', 'E', ['MENU_WORKFLOW'])
  disable(@Param('id') id: string, @Req() req: any) {
    return this.workflow.updateDefinition(Number(id), { status: 'DISABLED' }, req.user);
  }

  @Get(':id/designer')
  @RequireMenu('MENU_WORKFLOW_CONFIG', 'V', ['MENU_WORKFLOW'])
  designer(@Param('id') id: string) {
    return this.workflow.getDesigner(Number(id));
  }
}
