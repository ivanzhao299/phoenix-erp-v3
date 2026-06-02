import { Controller, Get, UseGuards } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';

@Controller('api/workflow/metrics')
@UseGuards(MenuGuard, DataScopeGuard)
export class WorkflowMetricsController {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  /**
   * GET /api/workflow/metrics/overview
   * 返回 Workflow 全局健康指标
   */
  @Get('overview')
  @RequireMenu('MENU_WORKFLOW', 'V')
  async overview() {
    const [pending, overdue, completedToday, escalated, avgRows] = await Promise.all([
      // 当前 PENDING 步骤数
      this.ds.query<[{ cnt: string }]>(`
        SELECT COUNT(*) AS cnt
          FROM wf_approval_instance_steps s
          JOIN wf_approval_instances i ON i.id = s.instance_id
         WHERE s.status = 'PENDING' AND i.status = 'PENDING'
      `),
      // 当前超期数
      this.ds.query<[{ cnt: string }]>(`
        SELECT COUNT(*) AS cnt
          FROM wf_approval_instance_steps s
          JOIN wf_approval_instances i ON i.id = s.instance_id
         WHERE s.status = 'PENDING' AND i.status = 'PENDING' AND s.is_overdue = TRUE
      `),
      // 今日完成实例数
      this.ds.query<[{ cnt: string }]>(`
        SELECT COUNT(*) AS cnt
          FROM wf_approval_instances
         WHERE status IN ('APPROVED','REJECTED')
           AND finished_at >= CURRENT_DATE
      `),
      // 升级任务数（escalation_level > 0 且 PENDING）
      this.ds.query<[{ cnt: string }]>(`
        SELECT COUNT(*) AS cnt
          FROM wf_approval_instance_steps s
          JOIN wf_approval_instances i ON i.id = s.instance_id
         WHERE s.escalation_level > 0 AND s.status = 'PENDING' AND i.status = 'PENDING'
      `),
      // 平均审批时长（已完成实例，小时）
      this.ds.query<[{ avg_hours: string | null; avg_comp_hours: string | null }]>(`
        SELECT
          AVG(EXTRACT(EPOCH FROM (finished_at - started_at)) / 3600.0) AS avg_comp_hours,
          AVG(
            EXTRACT(EPOCH FROM (
              COALESCE(finished_at, NOW()) - started_at
            )) / 3600.0
          ) AS avg_hours
        FROM wf_approval_instances
        WHERE started_at IS NOT NULL
      `),
    ]);

    return {
      pendingTasks:       Number(pending[0]?.cnt ?? 0),
      overdueTasks:       Number(overdue[0]?.cnt ?? 0),
      completedToday:     Number(completedToday[0]?.cnt ?? 0),
      escalatedTasks:     Number(escalated[0]?.cnt ?? 0),
      avgApprovalHours:   avgRows[0]?.avg_hours       ? Number(Number(avgRows[0].avg_hours).toFixed(1))       : null,
      avgCompletionHours: avgRows[0]?.avg_comp_hours  ? Number(Number(avgRows[0].avg_comp_hours).toFixed(1))  : null,
    };
  }

  /**
   * GET /api/workflow/metrics/bottlenecks
   * 返回各审批角色的平均处理时长、待办量、超期量
   */
  @Get('bottlenecks')
  @RequireMenu('MENU_WORKFLOW', 'V')
  async bottlenecks() {
    const rows = await this.ds.query<{
      role:          string;
      pending_count: string;
      overdue_count: string;
      avg_hours:     string | null;
    }[]>(`
      SELECT
        COALESCE(s.approver_role, '未知角色') AS role,
        COUNT(*) FILTER (WHERE s.status = 'PENDING' AND i.status = 'PENDING')  AS pending_count,
        COUNT(*) FILTER (WHERE s.status = 'PENDING' AND i.status = 'PENDING'
                           AND s.is_overdue = TRUE)                             AS overdue_count,
        AVG(
          CASE WHEN s.status != 'PENDING'
               THEN EXTRACT(EPOCH FROM (s.acted_at - s.created_at)) / 3600.0
          END
        )                                                                       AS avg_hours
      FROM wf_approval_instance_steps s
      JOIN wf_approval_instances i ON i.id = s.instance_id
      WHERE s.escalation_level = 0     -- 排除升级步骤，只看原始角色
      GROUP BY COALESCE(s.approver_role, '未知角色')
      HAVING COUNT(*) > 0
      ORDER BY overdue_count DESC, pending_count DESC
      LIMIT 20
    `);

    return rows.map(r => ({
      role:         r.role,
      pendingCount: Number(r.pending_count),
      overdueCount: Number(r.overdue_count),
      avgHours:     r.avg_hours ? Number(Number(r.avg_hours).toFixed(1)) : null,
    }));
  }

  /**
   * GET /api/workflow/metrics/overdue-tasks
   * 超期待办任务列表（Top 20），供健康看板展示
   */
  @Get('overdue-tasks')
  @RequireMenu('MENU_WORKFLOW', 'V')
  async overdueTasks() {
    const rows = await this.ds.query<{
      step_id:        string;
      instance_id:    string;
      biz_type:       string;
      biz_no:         string | null;
      approver_role:  string | null;
      assignee_id:    string | null;
      due_at:         string;
      reminder_count: string;
      escalation_level: string;
      created_at:     string;
    }[]>(`
      SELECT
        s.id           AS step_id,
        i.id           AS instance_id,
        i.biz_type,
        i.biz_no,
        s.approver_role,
        s.approver_user_id AS assignee_id,
        s.due_at,
        s.reminder_count,
        s.escalation_level,
        s.created_at
      FROM wf_approval_instance_steps s
      JOIN wf_approval_instances i ON i.id = s.instance_id
      WHERE s.status = 'PENDING'
        AND i.status = 'PENDING'
        AND s.is_overdue = TRUE
      ORDER BY s.due_at ASC
      LIMIT 20
    `);

    return rows.map(r => ({
      stepId:           r.step_id,
      instanceId:       r.instance_id,
      bizType:          r.biz_type,
      bizNo:            r.biz_no ?? null,
      approverRole:     r.approver_role ?? null,
      assigneeId:       r.assignee_id ?? null,
      dueAt:            r.due_at,
      reminderCount:    Number(r.reminder_count),
      escalationLevel:  Number(r.escalation_level),
      createdAt:        r.created_at,
      overdueHours:     Math.round((Date.now() - new Date(r.due_at).getTime()) / 3_600_000),
    }));
  }

  /**
   * GET /api/workflow/metrics/escalated-tasks
   * 已升级待办任务列表（escalation_level > 0），供健康看板展示
   */
  @Get('escalated-tasks')
  @RequireMenu('MENU_WORKFLOW', 'V')
  async escalatedTasks() {
    const rows = await this.ds.query<{
      step_id:          string;
      instance_id:      string;
      biz_type:         string;
      biz_no:           string | null;
      approver_role:    string | null;
      assignee_id:      string | null;
      due_at:           string | null;
      escalation_level: string;
      source_task_id:   string | null;
      created_at:       string;
    }[]>(`
      SELECT
        s.id               AS step_id,
        i.id               AS instance_id,
        i.biz_type,
        i.biz_no,
        s.approver_role,
        s.approver_user_id AS assignee_id,
        s.due_at,
        s.escalation_level,
        s.source_task_id,
        s.created_at
      FROM wf_approval_instance_steps s
      JOIN wf_approval_instances i ON i.id = s.instance_id
      WHERE s.status = 'PENDING'
        AND i.status = 'PENDING'
        AND s.escalation_level > 0
      ORDER BY s.escalation_level DESC, s.created_at ASC
      LIMIT 20
    `);

    return rows.map(r => ({
      stepId:          r.step_id,
      instanceId:      r.instance_id,
      bizType:         r.biz_type,
      bizNo:           r.biz_no ?? null,
      approverRole:    r.approver_role ?? null,
      assigneeId:      r.assignee_id ?? null,
      dueAt:           r.due_at ?? null,
      escalationLevel: Number(r.escalation_level),
      sourceTaskId:    r.source_task_id ?? null,
      createdAt:       r.created_at,
    }));
  }
}
