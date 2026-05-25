import { Injectable, Logger } from '@nestjs/common';

export interface WfNotifyTaskPayload {
  instanceId:   number;
  taskId:       number;
  nodeId:       string;
  nodeName:     string;
  bizType:      string;
  bizId:        string;
  bizNo?:       string;
  subject?:     string;
  starterName?: string;
  assigneeUserId?:   number;
  assigneeRoleCode?: string;
}

export interface WfNotifyInstancePayload {
  instanceId: number;
  bizType:    string;
  bizId:      string;
  bizNo?:     string;
  subject?:   string;
  result:     'APPROVED' | 'REJECTED' | 'CANCELLED';
}

/**
 * Workflow 通知 Hook — Phase A Stub
 * 当前仅记录日志，Phase B 接入站内信 / 钉钉 / 邮件。
 */
@Injectable()
export class WorkflowNotificationService {
  private readonly logger = new Logger(WorkflowNotificationService.name);

  onTaskCreated(payload: WfNotifyTaskPayload): void {
    this.logger.log(
      `[NOTIFY] task_created | instance=${payload.instanceId} task=${payload.taskId}` +
      ` node="${payload.nodeName}" biz=${payload.bizType}#${payload.bizId}` +
      (payload.assigneeUserId   ? ` → user:${payload.assigneeUserId}`   : '') +
      (payload.assigneeRoleCode ? ` → role:${payload.assigneeRoleCode}` : ''),
    );
  }

  onTaskCompleted(payload: WfNotifyTaskPayload & { action: string }): void {
    this.logger.log(
      `[NOTIFY] task_completed | instance=${payload.instanceId} task=${payload.taskId}` +
      ` action=${payload.action} biz=${payload.bizType}#${payload.bizId}`,
    );
  }

  onInstanceCompleted(payload: WfNotifyInstancePayload): void {
    this.logger.log(
      `[NOTIFY] instance_completed | instance=${payload.instanceId}` +
      ` result=${payload.result} biz=${payload.bizType}#${payload.bizId}`,
    );
  }

  onInstanceRejected(payload: WfNotifyInstancePayload): void {
    this.logger.log(
      `[NOTIFY] instance_rejected | instance=${payload.instanceId}` +
      ` biz=${payload.bizType}#${payload.bizId}`,
    );
  }
}
