import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationService } from '../notification/notification.service';
import { PushNotificationService } from '../notification/push-notification.service';
import { AssignmentResolverService, ApproverType } from './assignment-resolver.service';

interface OverdueRow {
  step_id:                  string;
  instance_id:              string;
  step_no:                  number;
  approver_role:            string | null;
  approver_user_id:         string | null;
  approver_name:            string | null;
  due_at:                   Date;
  reminder_count:           number;
  last_reminded_at:         Date | null;
  escalation_level:         number;
  biz_type:                 string;
  biz_id:                   string;
  biz_no:                   string | null;
  subject:                  string | null;
  instance_no:              string;
  // rule step SLA config (LEFT JOIN, may be null for legacy rows)
  sla_hours:                number | null;
  reminder_interval_hours:  number | null;
  max_reminders:            number | null;
  escalation_enabled:       boolean | null;
  escalation_after_hours:   number | null;
  escalation_role:          string | null;
}

@Injectable()
export class WorkflowSlaService {
  private readonly logger = new Logger(WorkflowSlaService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly notificationSvc: NotificationService,
    private readonly pushSvc: PushNotificationService,
    private readonly assignmentResolver: AssignmentResolverService,
  ) {}

  /**
   * 主入口：每次调度时执行。
   * 1. 标记新超期任务
   * 2. 发送催办通知
   * 3. 执行升级（escalation）
   */
  async checkOverdueTasks(): Promise<void> {
    this.logger.log('[SLA] checkOverdueTasks start');
    try {
      await this.markNewOverdue();
      await this.sendReminders();
      await this.processEscalations();
    } catch (err) {
      this.logger.error(`[SLA] checkOverdueTasks error: ${(err as any)?.message ?? err}`);
    }
    this.logger.log('[SLA] checkOverdueTasks done');
  }

  // ── 1. 标记新超期 ────────────────────────────────────────────────────────────

  private async markNewOverdue(): Promise<void> {
    const result = await this.ds.query(`
      UPDATE wf_approval_instance_steps
         SET is_overdue = TRUE
       WHERE status = 'PENDING'
         AND is_overdue = FALSE
         AND due_at IS NOT NULL
         AND due_at < NOW()
    `);
    const count = result?.[1] ?? 0;
    if (count > 0) this.logger.warn(`[SLA] Marked ${count} steps as overdue`);
  }

  // ── 2. 发送催办通知 ──────────────────────────────────────────────────────────

  private async sendReminders(): Promise<void> {
    const rows: OverdueRow[] = await this.ds.query(`
      SELECT
        s.id                      AS step_id,
        s.instance_id,
        s.step_no,
        s.approver_role,
        s.approver_user_id,
        s.approver_name,
        s.due_at,
        s.reminder_count,
        s.last_reminded_at,
        s.escalation_level,
        i.biz_type,
        i.biz_id,
        i.biz_no,
        i.subject,
        i.instance_no,
        rs.sla_hours,
        rs.reminder_interval_hours,
        rs.max_reminders,
        rs.escalation_enabled,
        rs.escalation_after_hours,
        rs.escalation_role
      FROM wf_approval_instance_steps s
      JOIN wf_approval_instances       i  ON i.id = s.instance_id
      LEFT JOIN wf_approval_rule_steps rs ON rs.rule_id = i.rule_id
                                         AND rs.step_no = s.step_no
      WHERE s.status    = 'PENDING'
        AND i.status    = 'PENDING'
        AND s.is_overdue = TRUE
      ORDER BY s.due_at ASC
    `);

    for (const row of rows) {
      const maxReminders       = row.max_reminders ?? 3;
      const intervalHours      = row.reminder_interval_hours ?? 12;

      if (row.reminder_count >= maxReminders) continue;

      // 检查上次催办是否已过催办间隔
      if (row.last_reminded_at) {
        const msSinceLast = Date.now() - new Date(row.last_reminded_at).getTime();
        if (msSinceLast < intervalHours * 3600 * 1000) continue;
      }

      await this.sendReminder(row);
    }
  }

  private async sendReminder(row: OverdueRow): Promise<void> {
    try {
      const bizLabel = BIZ_LABEL[row.biz_type] ?? row.biz_type;
      const title    = `【催办】${bizLabel}审批待处理`;
      const content  = this.buildReminderContent(row, bizLabel);

      // 确定通知接收人
      const userIds = await this.resolveStepUserIds(row);

      for (const uid of userIds) {
        // 站内通知
        await this.notificationSvc.create({
          userId:           uid,
          notificationType: 'TASK_REMINDER',
          title,
          content,
          linkType:         'APPROVAL_INSTANCE',
          linkId:           String(row.instance_id),
          bizType:          row.biz_type,
          bizId:            String(row.biz_id),
          bizNo:            row.biz_no ?? undefined,
        });

        // Web Push
        await this.pushSvc.sendToUser(uid, {
          title,
          body:  content,
          url:   '/mobile/workflow',
          tag:   `sla-reminder-${row.step_id}`,
        });
      }

      // 递增 reminder_count，更新 last_reminded_at
      await this.ds.query(`
        UPDATE wf_approval_instance_steps
           SET reminder_count   = reminder_count + 1,
               last_reminded_at = NOW()
         WHERE id = $1
      `, [row.step_id]);

      this.logger.log(`[SLA] Reminder sent for step=${row.step_id} (count=${row.reminder_count + 1})`);
    } catch (err) {
      this.logger.warn(`[SLA] sendReminder failed for step=${row.step_id}: ${(err as any)?.message}`);
    }
  }

  // ── 3. Escalation ───────────────────────────────────────────────────────────

  private async processEscalations(): Promise<void> {
    const rows: OverdueRow[] = await this.ds.query(`
      SELECT
        s.id                      AS step_id,
        s.instance_id,
        s.step_no,
        s.approver_role,
        s.approver_user_id,
        s.approver_name,
        s.due_at,
        s.reminder_count,
        s.last_reminded_at,
        s.escalation_level,
        i.biz_type,
        i.biz_id,
        i.biz_no,
        i.subject,
        i.instance_no,
        rs.sla_hours,
        rs.reminder_interval_hours,
        rs.max_reminders,
        rs.escalation_enabled,
        rs.escalation_after_hours,
        rs.escalation_role
      FROM wf_approval_instance_steps s
      JOIN wf_approval_instances       i  ON i.id = s.instance_id
      LEFT JOIN wf_approval_rule_steps rs ON rs.rule_id = i.rule_id
                                         AND rs.step_no = s.step_no
      WHERE s.status         = 'PENDING'
        AND i.status         = 'PENDING'
        AND s.is_overdue     = TRUE
        AND s.escalation_level = 0          -- 只升级原始任务（不重复升级）
        AND rs.escalation_enabled = TRUE
        AND rs.escalation_after_hours IS NOT NULL
        AND rs.escalation_role IS NOT NULL
        AND s.due_at IS NOT NULL
        AND NOW() > s.due_at + (rs.escalation_after_hours || ' hours')::INTERVAL
        AND NOT EXISTS (                   -- 尚未有 escalation task
          SELECT 1 FROM wf_approval_instance_steps es
          WHERE es.source_task_id = s.id AND es.escalation_level > 0 AND es.status = 'PENDING'
        )
      ORDER BY s.due_at ASC
    `);

    for (const row of rows) {
      await this.escalateTask(row).catch(err =>
        this.logger.warn(`[SLA] escalate failed for step=${row.step_id}: ${(err as any)?.message}`),
      );
    }
  }

  private async escalateTask(row: OverdueRow): Promise<void> {
    const escalationRole = row.escalation_role!;

    // 解析升级审批人
    const resolved = await this.assignmentResolver.resolveApprovers({
      approverType: 'ROLE' as ApproverType,
      approverRole: escalationRole,
    }).catch(() => []);

    if (resolved.length === 0) {
      this.logger.warn(`[SLA] No users for escalation role=${escalationRole}, step=${row.step_id}`);
      return;
    }

    const dueAt = new Date(Date.now() + (row.sla_hours ?? 48) * 3600 * 1000);

    // 批量创建 escalation steps
    await Promise.all(resolved.map(approver =>
      this.ds.query(`
        INSERT INTO wf_approval_instance_steps
          (instance_id, step_no, approver_type, approver_role, approver_user_id, approver_name,
           status, due_at, escalation_level, source_task_id, created_at)
        VALUES ($1, $2, 'ROLE', $3, $4, $5, 'PENDING', $6, 1, $7, NOW())
      `, [
        row.instance_id,
        row.step_no,
        escalationRole,
        approver.userId,
        approver.displayName,
        dueAt,
        row.step_id,
      ]),
    ));

    // Audit log：记录升级事件
    await this.ds.query(`
      INSERT INTO wf_approval_instance_steps
        (instance_id, step_no, approver_type, approver_role, status,
         action, comment, acted_at, escalation_level, source_task_id, created_at)
      VALUES ($1, $2, 'SYSTEM', $3, 'ESCALATED',
              'ESCALATE', $4, NOW(), 99, $5, NOW())
    `, [
      row.instance_id,
      row.step_no,
      escalationRole,
      `SLA 超时升级：原步骤 #${row.step_id} 超过截止时间，升级至角色 ${escalationRole}`,
      row.step_id,
    ]);

    // 通知升级审批人
    const bizLabel = BIZ_LABEL[row.biz_type] ?? row.biz_type;
    const title    = `【升级】${bizLabel}审批需要您处理`;
    const content  = `${bizLabel}${row.biz_no ? ` ${row.biz_no}` : ''}${row.subject ? `（${row.subject}）` : ''} 原审批人超时，已升级至您处理，请登录系统审批。`;

    for (const approver of resolved) {
      await this.notificationSvc.create({
        userId:           String(approver.userId),
        notificationType: 'TASK_ESCALATED',
        title,
        content,
        linkType:         'APPROVAL_INSTANCE',
        linkId:           String(row.instance_id),
        bizType:          row.biz_type,
        bizId:            String(row.biz_id),
        bizNo:            row.biz_no ?? undefined,
      });
      await this.pushSvc.sendToUser(approver.userId, {
        title,
        body:  content,
        url:   '/mobile/workflow',
        tag:   `sla-escalation-${row.step_id}`,
      });
    }

    this.logger.warn(
      `[SLA] Escalated step=${row.step_id} → role=${escalationRole} (${resolved.length} users)`,
    );
  }

  // ── 工具方法 ─────────────────────────────────────────────────────────────────

  private async resolveStepUserIds(row: OverdueRow): Promise<string[]> {
    if (row.approver_user_id) return [String(row.approver_user_id)];
    if (row.approver_role) {
      const resolved = await this.assignmentResolver.resolveApprovers({
        approverType: 'ROLE' as ApproverType,
        approverRole: row.approver_role,
      }).catch(() => []);
      return resolved.map(r => String(r.userId));
    }
    return [];
  }

  private buildReminderContent(row: OverdueRow, bizLabel: string): string {
    // 不暴露金额等敏感字段
    const bizNo  = row.biz_no ? ` ${row.biz_no}` : '';
    const subj   = row.subject ? `（${row.subject}）` : '';
    const due    = row.due_at ? new Date(row.due_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '';
    return `${bizLabel}${bizNo}${subj} 已超过审批截止时间（${due}），请尽快处理。`;
  }
}

const BIZ_LABEL: Record<string, string> = {
  PR:      '采购申请',
  PO:      '采购订单',
  PAYMENT: '付款申请',
  FUND:    '股东资金',
};
