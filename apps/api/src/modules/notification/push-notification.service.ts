import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';

export interface PushSubscribeDto {
  endpoint:  string;
  keys: {
    p256dh: string;
    auth:   string;
  };
  userAgent?: string;
  platform?:  string;
}

export interface PushPayload {
  title?:  string;
  body?:   string;
  url?:    string;
  icon?:   string;
  badge?:  string;
}

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);

  private get vapidConfigured(): boolean {
    return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
  }

  constructor(
    @InjectDataSource()
    private readonly ds: DataSource,
    private readonly cls: ClsService,
  ) {}

  private currentUserId(): string {
    const u = this.cls.get('user') as any;
    return String(u?.userId ?? u?.id ?? '0');
  }

  /** GET /api/notifications/push/public-key */
  getPublicKey(): { enabled: boolean; publicKey?: string; reason?: string } {
    if (!this.vapidConfigured) {
      return { enabled: false, reason: 'VAPID_NOT_CONFIGURED' };
    }
    return { enabled: true, publicKey: process.env.VAPID_PUBLIC_KEY };
  }

  /** POST /api/notifications/push/subscribe — 保存当前用户订阅 */
  async subscribe(dto: PushSubscribeDto): Promise<{ ok: boolean }> {
    const userId = this.currentUserId();
    if (userId === '0') return { ok: false };

    await this.ds.query(`
      INSERT INTO sys_push_subscriptions
        (user_id, endpoint, p256dh, auth, user_agent, platform, enabled, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW())
      ON CONFLICT (user_id, endpoint) DO UPDATE
        SET p256dh     = EXCLUDED.p256dh,
            auth       = EXCLUDED.auth,
            user_agent = EXCLUDED.user_agent,
            platform   = EXCLUDED.platform,
            enabled    = TRUE,
            updated_at = NOW()
    `, [userId, dto.endpoint, dto.keys.p256dh, dto.keys.auth, dto.userAgent ?? null, dto.platform ?? null]);

    this.logger.log(`Push subscription saved for user=${userId}`);
    return { ok: true };
  }

  /** POST /api/notifications/push/unsubscribe — 按 endpoint 禁用当前用户订阅 */
  async unsubscribe(endpoint: string): Promise<{ ok: boolean }> {
    const userId = this.currentUserId();
    if (userId === '0') return { ok: false };

    await this.ds.query(`
      UPDATE sys_push_subscriptions
         SET enabled = FALSE, updated_at = NOW()
       WHERE user_id = $1 AND endpoint = $2
    `, [userId, endpoint]);

    return { ok: true };
  }

  /**
   * 向指定用户的所有启用订阅发送 Push 通知。
   * 本阶段：仅查询订阅并记录 log，不引入实际发送依赖。
   * 失败不影响主业务。
   */
  async sendToUser(userId: string | number, payload: PushPayload): Promise<void> {
    if (!this.vapidConfigured) return;

    try {
      const rows: { endpoint: string }[] = await this.ds.query(`
        SELECT endpoint FROM sys_push_subscriptions
        WHERE user_id = $1 AND enabled = TRUE
      `, [String(userId)]);

      if (rows.length === 0) return;

      this.logger.log(
        `[Push] Would send to user=${userId} on ${rows.length} device(s): ${payload.title ?? ''}`,
      );
      // TODO Phase F: 接入 web-push 库实际发送
      // for (const row of rows) { await webpush.sendNotification(row, JSON.stringify(payload)); }
    } catch (err) {
      this.logger.warn(`[Push] sendToUser failed for user=${userId}: ${err}`);
    }
  }
}
