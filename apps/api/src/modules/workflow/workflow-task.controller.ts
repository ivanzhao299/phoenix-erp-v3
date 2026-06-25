import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';
import { WorkflowService } from './workflow.service';

@Controller('api/workflow/tasks')
@UseGuards(MenuGuard, DataScopeGuard)
export class WorkflowTaskController {
  constructor(private readonly workflow: WorkflowService) {}

  @Get('todo')
  @RequireMenu('MENU_WORKFLOW_TODO', 'V', ['MENU_WORKFLOW'])
  todo(@Query() query: any, @Req() req: any) {
    return this.workflow.listTodo(req.user, query);
  }

  @Get('done')
  @RequireMenu('MENU_WORKFLOW_HISTORY', 'V', ['MENU_WORKFLOW'])
  done(@Query() query: any, @Req() req: any) {
    return this.workflow.listDone(req.user, query);
  }

  @Get('cc')
  @RequireMenu('MENU_WORKFLOW_TODO', 'V', ['MENU_WORKFLOW'])
  cc(@Query() query: any, @Req() req: any) {
    return this.workflow.listCcTasks(req.user, query);
  }

  @Get('summary')
  @RequireMenu('MENU_WORKFLOW_TODO', 'V', ['MENU_WORKFLOW'])
  summary(@Req() req: any) {
    return this.workflow.getTaskSummary(req.user);
  }

  @Get('monitor')
  @RequireMenu('MENU_WORKFLOW_METRICS', 'X', ['MENU_WORKFLOW'])
  monitor(@Query() query: any, @Req() req: any) {
    return this.workflow.listMonitorTasks(req.user, query);
  }

  @Post('cc/:id/read')
  @RequireMenu('MENU_WORKFLOW_NOTIFY', 'E', ['MENU_WORKFLOW'])
  readCc(@Param('id') id: string, @Req() req: any) {
    return this.workflow.markCcRead(Number(id), req.user);
  }

  @Post(':id/approve')
  @RequireMenu('MENU_WORKFLOW_TODO', 'A', ['MENU_WORKFLOW'])
  approve(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.approveTask(Number(id), body, req.user);
  }

  @Post(':id/reject')
  @RequireMenu('MENU_WORKFLOW_TODO', 'A', ['MENU_WORKFLOW'])
  reject(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.rejectTask(Number(id), body, req.user);
  }

  @Post(':id/transfer')
  @RequireMenu('MENU_WORKFLOW_TODO', 'E', ['MENU_WORKFLOW'])
  transfer(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.transferTask(Number(id), body, req.user);
  }

  @Post(':id/comment')
  @RequireMenu('MENU_WORKFLOW_TODO', 'E', ['MENU_WORKFLOW'])
  comment(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.commentTask(Number(id), body, req.user);
  }

  // WF-UAT-1: 退回
  @Post(':id/return')
  @RequireMenu('MENU_WORKFLOW_TODO', 'A', ['MENU_WORKFLOW'])
  return(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.returnTask(Number(id), body, req.user);
  }

  // WF-UAT-1: 加签
  @Post(':id/countersign')
  @RequireMenu('MENU_WORKFLOW_TODO', 'A', ['MENU_WORKFLOW'])
  countersign(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.countersignTask(Number(id), body, req.user);
  }
}
