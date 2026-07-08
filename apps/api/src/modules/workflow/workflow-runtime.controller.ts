import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';
import { WorkflowService } from './workflow.service';

@Controller('api/workflow')
@UseGuards(MenuGuard, DataScopeGuard)
export class WorkflowRuntimeController {
  constructor(private readonly workflow: WorkflowService) {}

  /**
   * 统一任务入口 — Phase B
   * 聚合 ApprovalEngine 待办 + WorkflowEngine wf_task
   * 支持分页、过滤、关键字搜索
   */
  @Get('my-tasks')
  @RequireMenu('MENU_WORKFLOW_TODO', 'V')
  async getMyTasks(@Query() q: {
    page?:       string;
    pageSize?:   string;
    taskSource?: string;  // APPROVAL_ENGINE | WORKFLOW_ENGINE
    bizType?:    string;
    keyword?:    string;
  }, @Req() req: any) {
    return this.workflow.listMyTasks(req.user, q);
  }

  @Post('start')
  @RequireMenu('MENU_WORKFLOW_TODO', 'C')
  start(@Body() body: any, @Req() req: any) {
    return this.workflow.startWorkflow(body, req.user);
  }

  @Get('instances')
  @RequireMenu('MENU_WORKFLOW_HISTORY', 'V')
  listInstances(@Query() query: any, @Req() req: any) {
    return this.workflow.listInstances(query, req.user);
  }

  @Get('analytics')
  @RequireMenu('MENU_WORKFLOW_METRICS', 'X')
  analytics(@Query() query: any, @Req() req: any) {
    return this.workflow.getAnalytics(req.user, query);
  }

  @Get('instances/:id')
  @RequireMenu('MENU_WORKFLOW_HISTORY', 'V')
  getInstance(@Param('id') id: string, @Req() req: any) {
    return this.workflow.getInstance(Number(id), req.user);
  }

  @Post('instances/:id/cancel')
  @RequireMenu('MENU_WORKFLOW_TODO', 'E')
  cancel(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.cancelInstance(Number(id), body, req.user);
  }

  @Post('instances/:id/urge')
  @RequireMenu('MENU_WORKFLOW_TODO', 'E')
  urge(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.urgeInstance(Number(id), body, req.user);
  }
}
