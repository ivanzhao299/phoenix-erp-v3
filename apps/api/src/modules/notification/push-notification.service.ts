import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import * as webpush from 'web-push';

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
  tag?:    string;
  icon?:   string;
  badge?:  string;
}

interface PushSubscriptionRow {
  id:       string;
  endpoint: string;
  p256dh:   string;
  auth:     string;
}

@Injectable()
export class PushNotificationService implements OnModuleInit {
  private readonly logger = new Logger(PushNotificationService.name);
  private vapidReady = false;

  constructor(
    @InjectDataSource()
    private readonly ds: DataSource,
    private readonly cls: ClsService,
  ) {}

  onModuleInit() {
    const pub  = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    const subj = process.env.VAPID_SUBJECT;
    if (pub && priv && subj) {
      webpush.setVapidDetails(subj, pub, priv);
      this.vapidReady = true;
      this.logger.log('[Push] VAPID configured — real push enabled');
    } else {
      this.logger.warn('[Push] VAPID not configured — push disabled (set VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT)');
    }
  }

  private currentUserId(): string {
    const u = this.cls.get('user') as any;
    return String(u?.userId ?? u?.id ?? '0');
  }

  /** GET /api/notifications/push/public-key */
  getPublicKey(): { enabled: boolean; publicKey?: string; reason?: string } {
    if (!this.vapidReady) return { enabled: false, reason: 'VAPID_NOT_CONFIGURED' };
    return { enabled: true, publicKey: process.env.VAPID_PUBLIC_KEY };
  }

  /** POST /api/notifications/push/subscribe */
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

    this.logger.log(`[Push] subscription saved for user=${userId}`);
    return { ok: true };
  }

  /** POST /api/notifications/push/unsubscribe */
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
   * 向指定用户的所有启用订阅发送 Web Push。
   * 410/404 响应自动禁用订阅；失败不影响主业务。
   */
  async sendToUser(userId: string | number, payload: PushPayload): Promise<void> {
    if (!this.vapidReady) return;

    try {
      const rows: PushSubscriptionRow[] = await this.ds.query(`
        SELECT id, endpoint, p256dh, auth
          FROM sys_push_subscriptions
         WHERE user_id = $1 AND enabled = TRUE
      `, [String(userId)]);

      if (rows.length === 0) return;

      // payload 不包含敏感字段，只发摘要
      const safePayload = JSON.stringify({
        title: payload.title ?? 'Phoenix ERP',
        body:  payload.body  ?? '你有新的审批待办',
        url:   payload.url   ?? '/mobile/workflow',
        tag:   payload.tag   ?? 'phoenix-erp-push',
        icon:  payload.icon  ?? '/icon-256.png',
        badge: payload.badge ?? '/icon-32.png',
      });

      await Promise.allSettled(
        rows.map(sub =>
          webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            safePayload,
          ).catch(async (err: any) => {
            const status: number = err?.statusCode ?? err?.status ?? 0;
            if (status === 410 || status === 404) {
              // 订阅已失效，自动禁用
              await this.ds.query(
                `UPDATE sys_push_subscriptions SET enabled=FALSE, updated_at=NOW() WHERE id=$1`,
                [sub.id],
              ).catch(() => {});
              this.logger.log(`[Push] subscription ${sub.id} expired (${status}), disabled`);
            } else {
              this.logger.warn(`[Push] send failed for sub=${sub.id}: ${err?.message ?? err}`);
            }
          }),
        ),
      );
    } catch (err) {
      this.logger.warn(`[Push] sendToUser failed for user=${userId}: ${err}`);
    }
  }
}
