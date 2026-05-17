import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { WorkflowService } from './workflow.service';

@Controller('api/workflow/data-sources')
@UseGuards(AuthGuard('jwt'))
export class WorkflowDatasourceController {
  constructor(private readonly workflow: WorkflowService) {}

  @Get()
  list(@Query() query: any) {
    return this.workflow.listDataSources(query);
  }

  @Post()
  create(@Body() body: any, @Req() req: any) {
    return this.workflow.createDataSource(body, req.user);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.updateDataSource(Number(id), body, req.user);
  }

  @Post('preview')
  preview(@Body() body: any) {
    return this.workflow.previewDataSource(body);
  }
}
