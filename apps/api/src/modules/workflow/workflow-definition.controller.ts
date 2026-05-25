import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { WorkflowService } from './workflow.service';

@Controller('api/workflow/definitions')
@UseGuards(MenuGuard)
export class WorkflowDefinitionController {
  constructor(private readonly workflow: WorkflowService) {}

  @Get()
  @RequireMenu('MENU_WORKFLOW', 'V')
  list(@Query() query: any) {
    return this.workflow.listDefinitions(query);
  }

  @Post()
  @RequireMenu('MENU_WORKFLOW', 'C')
  create(@Body() body: any, @Req() req: any) {
    return this.workflow.createDefinition(body, req.user);
  }

  @Post('industry-templates/generate')
  @RequireMenu('MENU_WORKFLOW', 'C')
  generateIndustryTemplates(@Req() req: any) {
    return this.workflow.generateIndustryTemplates(req.user);
  }

  @Post('from-data-source')
  @RequireMenu('MENU_WORKFLOW', 'C')
  createFromDataSource(@Body() body: any, @Req() req: any) {
    return this.workflow.createDefinitionFromDataSource(body, req.user);
  }

  @Post(':id/clone')
  @RequireMenu('MENU_WORKFLOW', 'C')
  clone(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.cloneDefinition(Number(id), body, req.user);
  }

  @Get(':id')
  @RequireMenu('MENU_WORKFLOW', 'V')
  get(@Param('id') id: string) {
    return this.workflow.getDefinition(Number(id));
  }

  @Put(':id')
  @RequireMenu('MENU_WORKFLOW', 'E')
  update(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.updateDefinition(Number(id), body, req.user);
  }

  @Post(':id/publish')
  @RequireMenu('MENU_WORKFLOW', 'E')
  publish(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.publishDefinition(Number(id), body, req.user);
  }

  @Post(':id/disable')
  @RequireMenu('MENU_WORKFLOW', 'E')
  disable(@Param('id') id: string, @Req() req: any) {
    return this.workflow.updateDefinition(Number(id), { status: 'DISABLED' }, req.user);
  }

  @Get(':id/designer')
  @RequireMenu('MENU_WORKFLOW', 'V')
  designer(@Param('id') id: string) {
    return this.workflow.getDesigner(Number(id));
  }
}
