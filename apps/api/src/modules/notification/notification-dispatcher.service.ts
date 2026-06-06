/**
 * NotificationDispatcherService — 通知规则引擎核心
 *
 * 用法：业务 service 在事件发生后调用：
 *   await this.dispatcher.fire('PR_SUBMITTED_TO_APPROVER', {
 *     biz_no: 'PR-2026-001',
 *     biz_id: 123,
 *     biz_type: 'PR',
 *     submitter_user_id: 42,
 *     submitter_name: '张三',
 *     subject: '采购豆粕',
 *     amount: 251600,
 *     currency: 'CNY',
 *     // 工作流字段（用于 NEXT_APPROVER）
 *     wf_instance_id: 456,
 *   });
 *
 * Dispatcher 内部：
 *   1. 加载规则
 *   2. 接收人解析（NEXT_APPROVER / ROLE / USER）
 *   3. 用户偏好过滤
 *   4. 5 分钟内合并去重
 *   5. 模板渲染（简易 {{var}} 替换）
 *   6. 渠道发送（STATION 写 sys_notifications + PUSH 调 webpush）
 *   7. 写 sys_notification_log
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PushNotificationService } from './push-notification.service';
import * as crypto from 'crypto';

export interface DispatchContext {
  // 业务字段（任意；模板里用 {{key}} 引用）
  [key: string]: any;
  // 工作流字段（NEXT_APPROVER 用）
  wf_instance_id?: number | string;
  // 业务关联（用于 sys_notifications.biz_*）
  biz_type?: string;
  biz_id?: string | number;
  biz_no?: string;
}

interface NotificationRule {
  id: number;
  rule_code: string;
  rule_name: string;
  category: string;
  event_type: string;
  trigger_config: any;
  recipient_strategy: 'NEXT_APPROVER' | 'ROLE' | 'USER';
  recipient_config: any;
  channels: string[];
  template_code: string;
  priority: string;
  dedupe_window_sec: number;
  status: string;
}

interface NotificationTemplate {
  template_code: string;
  locale: string;
  channel: string;
  title_tmpl: string;
  content_tmpl: string;
}

@Injectable()
export class NotificationDispatcherService {
  private readonly logger = new Logger(NotificationDispatcherService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly pushService: PushNotificationService,
  ) {}

  /**
   * 触发一条规则。失败不抛异常（避免影响业务事务）；详情写入 log。
   */
  async fire(ruleCode: string, ctx: DispatchContext): Promise<void> {
    try {
      const rule = await this.loadRule(ruleCode);
      if (!rule) {
        this.logger.warn(`[dispatch] rule ${ruleCode} not found or inactive, skip`);
        return;
      }

      // 1) 接收人解析
      const recipientIds = await this.resolveRecipients(rule, ctx);
      if (recipientIds.length === 0) {
        this.logger.warn(`[dispatch] rule=${ruleCode} resolved 0 recipients`);
        return;
      }

      // 2) 模板加载（zh-CN 优先；后续可按用户 locale）
      const templates = await this.loadTemplates(rule.template_code);
      const byChannel: Record<string, NotificationTemplate> = {};
      for (const t of templates) byChannel[t.channel] = t;

      // 3) 对每个用户 × 每个渠道 发送
      for (const userId of recipientIds) {
        const prefs = await this.getUserPrefs(userId, rule.category);
        if (!prefs.enabled) continue;

        for (const channel of rule.channels) {
          if (prefs.channels_opt_in?.[channel] === false) continue;
          const tmpl = byChannel[channel];
          if (!tmpl) {
            this.logger.warn(`[dispatch] template ${rule.template_code} missing for channel ${channel}`);
            continue;
          }

          const title = this.render(tmpl.title_tmpl, ctx);
          const content = this.render(tmpl.content_tmpl, ctx);

          // 4) 去重（同 rule+user+content_hash 在窗口内已发过则跳过）
          const dedupeKey = this.dedupeKey(rule.rule_code, userId, channel, title, content);
          const isDup = await this.checkDedup(dedupeKey, rule.dedupe_window_sec);
          if (isDup) {
            await this.writeLog(rule, userId, channel, ctx, title, content, 'DEDUPED', null, dedupeKey);
            continue;
          }

          // 5) 渠道发送
          let status: 'SENT' | 'FAILED' = 'SENT';
          let err: string | null = null;
          try {
            await this.send(channel, userId, title, content, ctx);
          } catch (e: any) {
            status = 'FAILED';
            err = e?.message || String(e);
            this.logger.error(`[dispatch] send fail rule=${ruleCode} user=${userId} channel=${channel}: ${err}`);
          }
          await this.writeLog(rule, userId, channel, ctx, title, content, status, err, dedupeKey);
        }
      }
    } catch (e: any) {
      this.logger.error(`[dispatch] rule ${ruleCode} fatal: ${e?.message || e}`, e?.stack);
    }
  }

  // ── 内部 ───────────────────────────────────────────────────────────────

  private async loadRule(code: string): Promise<NotificationRule | null> {
    const rows = await this.ds.query(
      `SELECT id, rule_code, rule_name, category, event_type, trigger_config,
              recipient_strategy, recipient_config, channels, template_code,
              priority, dedupe_window_sec, status
         FROM sys_notification_rules
        WHERE rule_code = $1 AND status='ACTIVE' LIMIT 1`,
      [code],
    );
    return rows[0] || null;
  }

  private async loadTemplates(code: string): Promise<NotificationTemplate[]> {
    return await this.ds.query(
      `SELECT template_code, locale, channel, title_tmpl, content_tmpl
         FROM sys_notification_templates
        WHERE template_code = $1 AND locale = 'zh-CN' AND status='ACTIVE'`,
      [code],
    );
  }

  private async resolveRecipients(
    rule: NotificationRule, ctx: DispatchContext,
  ): Promise<number[]> {
    const ids = new Set<number>();
    if (rule.recipient_strategy === 'USER') {
      const list = rule.recipient_config?.user_ids || [];
      for (const id of list) ids.add(Number(id));
    } else if (rule.recipient_strategy === 'ROLE') {
      const codes = rule.recipient_config?.role_codes || [];
      if (codes.length > 0) {
        const rows = await this.ds.query(
          `SELECT DISTINCT u.user_id AS id
             FROM sys_user u
             JOIN sys_user_role ur ON ur.user_id=u.user_id
             JOIN sys_role r       ON r.role_id=ur.role_id
            WHERE r.role_code = ANY($1) AND u.status=1`,
          [codes],
        );
        for (const r of rows) ids.add(Number(r.id));
      }
    } else if (rule.recipient_strategy === 'NEXT_APPROVER') {
      const wfId = ctx.wf_instance_id;
      if (wfId) {
        const rows = await this.ds.query(
          `SELECT DISTINCT assignee_user_id AS id
             FROM wf_task
            WHERE wf_instance_id = $1 AND status='PENDING'`,
          [wfId],
        ).catch(() => []);
        for (const r of rows) if (r.id) ids.add(Number(r.id));
      }
    }
    return [...ids];
  }

  private async getUserPrefs(
    userId: number, category: string,
  ): Promise<{ enabled: boolean; channels_opt_in: Record<string, boolean> }> {
    const rows = await this.ds.query(
      `SELECT enabled, channels_opt_in FROM sys_user_notification_prefs
        WHERE user_id=$1 AND category=$2 LIMIT 1`,
      [userId, category],
    );
    if (!rows[0]) return { enabled: true, channels_opt_in: { STATION: true, PUSH: true } };
    return {
      enabled: rows[0].enabled,
      channels_opt_in: rows[0].channels_opt_in || {},
    };
  }

  /** 简易 {{var}} 模板渲染（不支持嵌套；够用） */
  private render(tmpl: string, ctx: DispatchContext): string {
    if (!tmpl) return '';
    return tmpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
      const v = ctx[key];
      return v === undefined || v === null ? '' : String(v);
    });
  }

  private dedupeKey(
    ruleCode: string, userId: number, channel: string, title: string, content: string,
  ): string {
    const h = crypto.createHash('sha256')
      .update(`${ruleCode}|${userId}|${channel}|${title}|${content}`)
      .digest('hex').substring(0, 24);
    return h;
  }

  private async checkDedup(key: string, windowSec: number): Promise<boolean> {
    const rows = await this.ds.query(
      `SELECT 1 FROM sys_notification_log
        WHERE dedupe_key = $1 AND status IN ('SENT','PENDING')
          AND created_at > now() - ($2 || ' seconds')::interval
        LIMIT 1`,
      [key, windowSec],
    );
    return rows.length > 0;
  }

  private async send(
    channel: string, userId: number, title: string, content: string, ctx: DispatchContext,
  ): Promise<void> {
    if (channel === 'STATION') {
      // 写 sys_notifications（已有 inbox 表）
      await this.ds.query(
        `INSERT INTO sys_notifications (user_id, notification_type, title, content, biz_type, biz_id, biz_no)
         VALUES ($1, 'WORKFLOW_TASK', $2, $3, $4, $5, $6)`,
        [userId, title, content, ctx.biz_type || null, ctx.biz_id ? String(ctx.biz_id) : null, ctx.biz_no || null],
      );
    } else if (channel === 'PUSH') {
      await this.pushService.sendToUser(userId, {
        title,
        body: content,
        url: ctx.biz_type && ctx.biz_id ? this.bizLink(ctx.biz_type, ctx.biz_id) : undefined,
      });
    } else {
      throw new Error(`channel ${channel} not implemented in V1 (P0 = STATION+PUSH only)`);
    }
  }

  private bizLink(bizType: string, bizId: string | number): string {
    // 简单映射 biz_type → 前端路由
    const map: Record<string, string> = {
      PR: '/procurement2/requests/',
      PO: '/procurement2/orders/',
      AP: '/finance2/ap/',
      AR: '/finance2/ar/',
    };
    return (map[bizType] || '/') + bizId;
  }

  private async writeLog(
    rule: NotificationRule, userId: number, channel: string,
    ctx: DispatchContext, title: string, content: string,
    status: 'SENT' | 'FAILED' | 'SKIPPED' | 'DEDUPED' | 'PENDING',
    err: string | null, dedupeKey: string,
  ): Promise<void> {
    await this.ds.query(
      `INSERT INTO sys_notification_log
         (rule_code, template_code, recipient_user_id, channel, trigger_event,
          title, content, status, last_error, dedupe_key, sent_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10, CASE WHEN $8='SENT' THEN now() ELSE NULL END)`,
      [
        rule.rule_code, rule.template_code, userId, channel,
        JSON.stringify(ctx), title, content, status, err, dedupeKey,
      ],
    ).catch((e) => this.logger.error(`[log] write fail: ${e?.message}`));
  }
}
