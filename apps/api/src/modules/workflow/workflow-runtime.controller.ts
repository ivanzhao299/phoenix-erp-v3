import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { WorkflowService } from './workflow.service';

@Controller('api/workflow')
@UseGuards(AuthGuard('jwt'))
export class WorkflowRuntimeController {
  constructor(private readonly workflow: WorkflowService) {}

  @Post('start')
  start(@Body() body: any, @Req() req: any) {
    return this.workflow.startWorkflow(body, req.user);
  }

  @Get('instances')
  listInstances(@Query() query: any, @Req() req: any) {
    return this.workflow.listInstances(query, req.user);
  }

  @Get('instances/:id')
  getInstance(@Param('id') id: string, @Req() req: any) {
    return this.workflow.getInstance(Number(id), req.user);
  }

  @Post('instances/:id/cancel')
  cancel(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.cancelInstance(Number(id), body, req.user);
  }

  @Post('instances/:id/urge')
  urge(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.urgeInstance(Number(id), body, req.user);
  }
}
