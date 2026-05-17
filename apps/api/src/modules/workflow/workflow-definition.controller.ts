import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { WorkflowService } from './workflow.service';

@Controller('api/workflow/definitions')
@UseGuards(AuthGuard('jwt'))
export class WorkflowDefinitionController {
  constructor(private readonly workflow: WorkflowService) {}

  @Get()
  list(@Query() query: any) {
    return this.workflow.listDefinitions(query);
  }

  @Post()
  create(@Body() body: any, @Req() req: any) {
    return this.workflow.createDefinition(body, req.user);
  }

  @Post('industry-templates/generate')
  generateIndustryTemplates(@Req() req: any) {
    return this.workflow.generateIndustryTemplates(req.user);
  }

  @Post('from-data-source')
  createFromDataSource(@Body() body: any, @Req() req: any) {
    return this.workflow.createDefinitionFromDataSource(body, req.user);
  }

  @Post(':id/clone')
  clone(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.cloneDefinition(Number(id), body, req.user);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.workflow.getDefinition(Number(id));
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.updateDefinition(Number(id), body, req.user);
  }

  @Post(':id/publish')
  publish(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.publishDefinition(Number(id), body, req.user);
  }

  @Post(':id/disable')
  disable(@Param('id') id: string, @Req() req: any) {
    return this.workflow.updateDefinition(Number(id), { status: 'DISABLED' }, req.user);
  }

  @Get(':id/designer')
  designer(@Param('id') id: string) {
    return this.workflow.getDesigner(Number(id));
  }
}
