import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';
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
    @InjectDataSource()
    private readonly ds: DataSource,
    private readonly cls: ClsService,
  ) {}

  private currentUser(): { userId: string; roles: string[] } {
    const u = this.cls.get('user') as any;
    return {
      userId: String(u?.userId ?? u?.id ?? '0'),
      roles:  u?.roles ?? (u?.role ? [u.role] : []),
    };
  }

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
  }) {
    const page     = Math.max(1, Number(q.page     ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(q.pageSize ?? 20)));
    const { userId, roles } = this.currentUser();

    // ── Phase A: ApprovalEngine 待办 ─────────────────────────────────────
    let aeTasks: any[] = [];
    if (!q.taskSource || q.taskSource === 'APPROVAL_ENGINE') {
      const rows: any[] = await this.approvalEngine.getMyTodos();
      aeTasks = rows.map(t => ({
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
        requiredRole:     t.approver_role,
        stepNo:           t.step_no ?? 1,
        totalSteps:       t.total_steps ?? 1,
        currentStepNo:    t.current_step_no ?? 1,
        startedBy:        t.started_by ?? null,
        status:           t.step_status,
        createdAt:        t.started_at,
        dueAt:            t.due_at ?? null,
        isOverdue:        t.is_overdue ?? false,
        escalationLevel:  t.escalation_level ?? 0,
      }));
    }

    // ── Phase B: WorkflowEngine wf_task ──────────────────────────────────
    let wfTasks: any[] = [];
    if (!q.taskSource || q.taskSource === 'WORKFLOW_ENGINE') {
      const wfRows: any[] = await this.ds.query(`
        SELECT
          t.id            AS task_id,
          t.task_no,
          t.node_id,
          t.node_name,
          t.assignee_role_code AS required_role,
          t.status        AS task_status,
          t.created_at,
          i.id            AS instance_id,
          i.instance_no,
          i.business_type AS biz_type,
          i.business_id   AS biz_id,
          i.title         AS subject,
          i.starter_id    AS started_by,
          i.starter_name,
          i.started_at
        FROM wf_task t
        JOIN wf_instance i ON i.id = t.instance_id
        WHERE t.status = 'TODO'
          AND (
            t.assignee_user_id = $1
            OR t.assignee_role_code = ANY($2::varchar[])
          )
        ORDER BY t.created_at ASC
      `, [Number(userId), roles]);

      wfTasks = wfRows.map(t => ({
        taskSource:    'WORKFLOW_ENGINE',
        taskId:        String(t.task_id),
        instanceId:    String(t.instance_id),
        instanceNo:    t.instance_no ?? null,
        bizType:       t.biz_type ?? null,
        bizId:         t.biz_id   ?? null,
        bizNo:         null,
        subject:       t.subject  ?? null,
        amount:        null,
        currencyCode:  null,
        companyCode:   null,
        companyName:   null,
        projectCode:   null,
        projectName:   null,
        requiredRole:  t.required_role ?? null,
        stepNo:        null,
        totalSteps:    null,
        currentStepNo: null,
        startedBy:     t.started_by ? String(t.started_by) : null,
        status:        t.task_status,
        createdAt:     t.started_at ?? t.created_at,
      }));
    }

    // ── 合并、过滤、排序 ─────────────────────────────────────────────────
    let all = [...aeTasks, ...wfTasks];

    if (q.bizType) {
      all = all.filter(t => t.bizType === q.bizType);
    }
    if (q.keyword) {
      const kw = q.keyword.toLowerCase();
      all = all.filter(t =>
        t.bizNo?.toLowerCase().includes(kw) ||
        t.subject?.toLowerCase().includes(kw) ||
        t.instanceNo?.toLowerCase().includes(kw),
      );
    }

    // 按 createdAt 降序
    all.sort((a, b) => {
      const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return db - da;
    });

    const total = all.length;
    const items = all.slice((page - 1) * pageSize, page * pageSize);

    return { items, total, page, pageSize };
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
