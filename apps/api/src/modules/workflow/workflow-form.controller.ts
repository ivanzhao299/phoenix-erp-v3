import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { WorkflowService } from './workflow.service';

@Controller('api/workflow/forms')
@UseGuards(MenuGuard)
export class WorkflowFormController {
  constructor(private readonly workflow: WorkflowService) {}

  @Get()
  @RequireMenu('MENU_WORKFLOW', 'V')
  list(@Query() query: any) {
    return this.workflow.listForms(query);
  }

  @Post()
  @RequireMenu('MENU_WORKFLOW', 'C')
  create(@Body() body: any, @Req() req: any) {
    return this.workflow.createForm(body, req.user);
  }

  @Post('from-data-source')
  @RequireMenu('MENU_WORKFLOW', 'C')
  createFromDataSource(@Body() body: any, @Req() req: any) {
    return this.workflow.createFormFromDataSource(body, req.user);
  }

  @Get(':id')
  @RequireMenu('MENU_WORKFLOW', 'V')
  get(@Param('id') id: string) {
    return this.workflow.getForm(Number(id));
  }

  @Put(':id')
  @RequireMenu('MENU_WORKFLOW', 'E')
  update(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.updateForm(Number(id), body, req.user);
  }

  @Post(':id/publish')
  @RequireMenu('MENU_WORKFLOW', 'E')
  publish(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.publishForm(Number(id), body, req.user);
  }

  @Get(':id/designer')
  @RequireMenu('MENU_WORKFLOW', 'V')
  designer(@Param('id') id: string) {
    return this.workflow.getFormDesigner(Number(id));
  }
}
