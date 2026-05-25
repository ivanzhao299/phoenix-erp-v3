import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';
import { WorkflowService } from './workflow.service';
import { ApprovalEngineService } from '../approval-engine/approval-engine.service';

@Controller('api/workflow')
@UseGuards(MenuGuard, DataScopeGuard)
export class WorkflowRuntimeController {
  constructor(
    private readonly workflow: WorkflowService,
    private readonly approvalEngine: ApprovalEngineService,
  ) {}

  /**
   * 统一任务入口 — Phase A 聚合 ApprovalEngine 待办
   * Phase B 追加 WorkflowEngine wf_task 数据
   */
  @Get('my-tasks')
  @RequireMenu('MENU_WORKFLOW', 'V')
  async getMyTasks() {
    const apTodos: any[] = await this.approvalEngine.getMyTodos();
    return apTodos.map(t => ({
      taskSource:    'APPROVAL_ENGINE',
      taskId:        String(t.step_id),
      instanceId:    String(t.instance_id),
      instanceNo:    t.instance_no ?? null,
      bizType:       t.biz_type,
      bizId:         String(t.biz_id),
      bizNo:         t.biz_no ?? null,
      subject:       t.subject ?? null,
      amount:        t.amount != null ? Number(t.amount) : null,
      currencyCode:  t.currency_code ?? null,
      companyCode:   t.company_code ?? null,
      companyName:   t.company_name ?? null,
      projectCode:   t.project_code ?? null,
      projectName:   t.project_name ?? null,
      requiredRole:  t.approver_role,
      stepNo:        t.step_no ?? 1,
      totalSteps:    t.total_steps ?? 1,
      currentStepNo: t.current_step_no ?? 1,
      startedBy:     t.started_by ?? null,
      status:        t.step_status,
      createdAt:     t.started_at,
    }));
  }

  @Post('start')
  @RequireMenu('MENU_WORKFLOW', 'C')
  start(@Body() body: any, @Req() req: any) {
    return this.workflow.startWorkflow(body, req.user);
  }

  @Get('instances')
  @RequireMenu('MENU_WORKFLOW', 'V')
  listInstances(@Query() query: any, @Req() req: any) {
    return this.workflow.listInstances(query, req.user);
  }

  @Get('analytics')
  @RequireMenu('MENU_WORKFLOW', 'V')
  analytics(@Query() query: any, @Req() req: any) {
    return this.workflow.getAnalytics(req.user, query);
  }

  @Get('instances/:id')
  @RequireMenu('MENU_WORKFLOW', 'V')
  getInstance(@Param('id') id: string, @Req() req: any) {
    return this.workflow.getInstance(Number(id), req.user);
  }

  @Post('instances/:id/cancel')
  @RequireMenu('MENU_WORKFLOW', 'E')
  cancel(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.cancelInstance(Number(id), body, req.user);
  }

  @Post('instances/:id/urge')
  @RequireMenu('MENU_WORKFLOW', 'E')
  urge(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.urgeInstance(Number(id), body, req.user);
  }
}
