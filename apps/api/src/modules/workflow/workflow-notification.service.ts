import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationService } from '../notification/notification.service';

export interface WfNotifyTaskPayload {
  instanceId:   string | number;
  taskId?:      string | number;
  nodeId?:      string;
  nodeName?:    string;
  bizType:      string;
  bizId:        string;
  bizNo?:       string;
  subject?:     string;
  starterUserId?:    string;
  starterName?:      string;
  assigneeUserId?:   string | number;
  assigneeRoleCode?: string;
}

export interface WfNotifyInstancePayload {
  instanceId:    string | number;
  bizType:       string;
  bizId:         string;
  bizNo?:        string;
  subject?:      string;
  starterUserId?: string;
  result:        'APPROVED' | 'REJECTED' | 'CANCELLED';
}

const BIZ_LABEL: Record<string, string> = {
  PR:      '采购申请',
  PO:      '采购订单',
  PAYMENT: '付款申请',
  FUND:    '股东资金',
};

@Injectable()
export class WorkflowNotificationService {
  private readonly logger = new Logger(WorkflowNotificationService.name);

  constructor(
    @InjectDataSource()
    private readonly ds: DataSource,
    private readonly notificationSvc: NotificationService,
  ) {}

  /** 根据角色代码查询所有有效用户 ID */
  private async getUserIdsByRole(roleCode: string): Promise<string[]> {
    const rows: { user_id: string }[] = await this.ds.query(`
      SELECT CAST(u.user_id AS VARCHAR) AS user_id
      FROM sys_user u
      JOIN sys_user_role ur ON ur.user_id = u.user_id
      JOIN sys_role r       ON r.role_id  = ur.role_id
      WHERE r.role_code = $1 AND u.status = 1
    `, [roleCode]);
    return rows.map(r => r.user_id);
  }

  /** FUND 类型使用脱敏标题，不暴露金额/账号 */
  private buildTitle(bizType: string, action: 'pending' | 'approved' | 'rejected'): string {
    const label = BIZ_LABEL[bizType] ?? bizType;
    if (bizType === 'FUND') {
      const actionMap = { pending: '待处理', approved: '已通过', rejected: '已拒绝' };
      return `有一条${label}审批${actionMap[action]}`;
    }
    const actionMap = { pending: '待您审批', approved: '审批通过', rejected: '审批被拒绝' };
    return `${label} ${actionMap[action]}`;
  }

  private buildContent(payload: WfNotifyTaskPayload | WfNotifyInstancePayload, action: 'pending' | 'approved' | 'rejected'): string {
    const bizType = payload.bizType;
    // FUND 类型不暴露业务详情
    if (bizType === 'FUND') {
      const map = { pending: '请登录系统查看并处理。', approved: '流程已完结，资金已确认。', rejected: '流程已终止，请联系财务。' };
      return map[action];
    }
    const label  = BIZ_LABEL[bizType] ?? bizType;
    const bizNo  = payload.bizNo ? `单号：${payload.bizNo}` : '';
    const subj   = 'subject' in payload && payload.subject ? `，主题：${payload.subject}` : '';
    if (action === 'pending') return `${label}${bizNo ? ' ' + bizNo : ''}${subj} 待您审批，请登录系统处理。`;
    if (action === 'approved') return `您提交的${label}${bizNo ? ' ' + bizNo : ''}${subj} 已审批通过。`;
    return `您提交的${label}${bizNo ? ' ' + bizNo : ''}${subj} 已被拒绝，请查看审批意见。`;
  }

  /** 新任务创建 — 通知有审批权限的角色用户 */
  async onTaskCreated(payload: WfNotifyTaskPayload): Promise<void> {
    this.logger.log(
      `[NOTIFY] task_created | instance=${payload.instanceId}` +
      ` biz=${payload.bizType}#${payload.bizId}` +
      (payload.assigneeUserId   ? ` → user:${payload.assigneeUserId}`   : '') +
      (payload.assigneeRoleCode ? ` → role:${payload.assigneeRoleCode}` : ''),
    );

    try {
      let userIds: string[] = [];

      if (payload.assigneeUserId) {
        userIds = [String(payload.assigneeUserId)];
      } else if (payload.assigneeRoleCode) {
        userIds = await this.getUserIdsByRole(payload.assigneeRoleCode);
      }

      if (userIds.length === 0) return;

      const title   = this.buildTitle(payload.bizType, 'pending');
      const content = this.buildContent(payload, 'pending');

      await Promise.all(userIds.map(uid =>
        this.notificationSvc.create({
          userId:           uid,
          notificationType: 'WORKFLOW_TASK',
          title,
          content,
          linkType:         'APPROVAL_INSTANCE',
          linkId:           String(payload.instanceId),
          bizType:          payload.bizType,
          bizId:            payload.bizId,
          bizNo:            payload.bizNo,
        }),
      ));
    } catch (err) {
      this.logger.error(`[NOTIFY] onTaskCreated failed: ${(err as any)?.message}`);
    }
  }

  /** 任务完成（中间步骤通过）*/
  onTaskCompleted(payload: WfNotifyTaskPayload & { action: string }): void {
    this.logger.log(
      `[NOTIFY] task_completed | instance=${payload.instanceId}` +
      ` action=${payload.action} biz=${payload.bizType}#${payload.bizId}`,
    );
  }

  /** 实例全部审批通过 — 通知发起人 */
  async onInstanceCompleted(payload: WfNotifyInstancePayload): Promise<void> {
    this.logger.log(
      `[NOTIFY] instance_completed | instance=${payload.instanceId}` +
      ` result=${payload.result} biz=${payload.bizType}#${payload.bizId}`,
    );

    if (!payload.starterUserId) return;

    try {
      await this.notificationSvc.create({
        userId:           payload.starterUserId,
        notificationType: 'APPROVAL_RESULT',
        title:            this.buildTitle(payload.bizType, 'approved'),
        content:          this.buildContent(payload, 'approved'),
        linkType:         'APPROVAL_INSTANCE',
        linkId:           String(payload.instanceId),
        bizType:          payload.bizType,
        bizId:            payload.bizId,
        bizNo:            payload.bizNo,
      });
    } catch (err) {
      this.logger.error(`[NOTIFY] onInstanceCompleted failed: ${(err as any)?.message}`);
    }
  }

  /** 实例被拒绝 — 通知发起人 */
  async onInstanceRejected(payload: WfNotifyInstancePayload): Promise<void> {
    this.logger.log(
      `[NOTIFY] instance_rejected | instance=${payload.instanceId}` +
      ` biz=${payload.bizType}#${payload.bizId}`,
    );

    if (!payload.starterUserId) return;

    try {
      await this.notificationSvc.create({
        userId:           payload.starterUserId,
        notificationType: 'APPROVAL_RESULT',
        title:            this.buildTitle(payload.bizType, 'rejected'),
        content:          this.buildContent(payload, 'rejected'),
        linkType:         'APPROVAL_INSTANCE',
        linkId:           String(payload.instanceId),
        bizType:          payload.bizType,
        bizId:            payload.bizId,
        bizNo:            payload.bizNo,
      });
    } catch (err) {
      this.logger.error(`[NOTIFY] onInstanceRejected failed: ${(err as any)?.message}`);
    }
  }
}
