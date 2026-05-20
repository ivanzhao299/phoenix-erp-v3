import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { WorkflowService } from './workflow.service';

@Controller('api/workflow/tasks')
@UseGuards(AuthGuard('jwt'))
export class WorkflowTaskController {
  constructor(private readonly workflow: WorkflowService) {}

  @Get('todo')
  todo(@Query() query: any, @Req() req: any) {
    return this.workflow.listTodo(req.user, query);
  }

  @Get('done')
  done(@Query() query: any, @Req() req: any) {
    return this.workflow.listDone(req.user, query);
  }

  @Get('cc')
  cc(@Query() query: any, @Req() req: any) {
    return this.workflow.listCcTasks(req.user, query);
  }

  @Get('summary')
  summary(@Req() req: any) {
    return this.workflow.getTaskSummary(req.user);
  }

  @Get('monitor')
  monitor(@Query() query: any, @Req() req: any) {
    return this.workflow.listMonitorTasks(req.user, query);
  }

  @Post('cc/:id/read')
  readCc(@Param('id') id: string, @Req() req: any) {
    return this.workflow.markCcRead(Number(id), req.user);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.approveTask(Number(id), body, req.user);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.rejectTask(Number(id), body, req.user);
  }

  @Post(':id/transfer')
  transfer(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.transferTask(Number(id), body, req.user);
  }

  @Post(':id/comment')
  comment(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.commentTask(Number(id), body, req.user);
  }
}
