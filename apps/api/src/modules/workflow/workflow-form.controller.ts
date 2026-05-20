import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { WorkflowService } from './workflow.service';

@Controller('api/workflow/forms')
@UseGuards(AuthGuard('jwt'))
export class WorkflowFormController {
  constructor(private readonly workflow: WorkflowService) {}

  @Get()
  list(@Query() query: any) {
    return this.workflow.listForms(query);
  }

  @Post()
  create(@Body() body: any, @Req() req: any) {
    return this.workflow.createForm(body, req.user);
  }

  @Post('from-data-source')
  createFromDataSource(@Body() body: any, @Req() req: any) {
    return this.workflow.createFormFromDataSource(body, req.user);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.workflow.getForm(Number(id));
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.updateForm(Number(id), body, req.user);
  }

  @Post(':id/publish')
  publish(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.publishForm(Number(id), body, req.user);
  }

  @Get(':id/designer')
  designer(@Param('id') id: string) {
    return this.workflow.getFormDesigner(Number(id));
  }
}
