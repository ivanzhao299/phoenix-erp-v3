import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';
import { NotificationService } from './notification.service';
import { PushNotificationService, PushSubscribeDto } from './push-notification.service';

@Controller('api/notifications')
@UseGuards(MenuGuard, DataScopeGuard)
export class NotificationController {
  constructor(
    private readonly svc: NotificationService,
    private readonly pushSvc: PushNotificationService,
  ) {}

  @Get()
  @RequireMenu('MENU_WORKFLOW_NOTIFY', 'V', ['MENU_WORKFLOW'])
  list(@Query() q: {
    status?: string;
    notificationType?: string;
    keyword?: string;
    page?: string;
    pageSize?: string;
  }) {
    return this.svc.list({
      status:           q.status,
      notificationType: q.notificationType,
      keyword:          q.keyword,
      page:             q.page     ? Number(q.page)     : 1,
      pageSize:         q.pageSize ? Number(q.pageSize) : 20,
    });
  }

  @Get('unread-count')
  @RequireMenu('MENU_WORKFLOW_NOTIFY', 'V', ['MENU_WORKFLOW'])
  async unreadCount() {
    const count = await this.svc.getUnreadCount();
    return { count };
  }

  @Post(':id/read')
  @RequireMenu('MENU_WORKFLOW_NOTIFY', 'E', ['MENU_WORKFLOW'])
  async markRead(@Param('id') id: string) {
    await this.svc.markRead(id);
    return { ok: true };
  }

  @Post('read-all')
  @RequireMenu('MENU_WORKFLOW_NOTIFY', 'E', ['MENU_WORKFLOW'])
  async markAllRead() {
    await this.svc.markAllRead();
    return { ok: true };
  }

  @Post(':id/archive')
  @RequireMenu('MENU_WORKFLOW_NOTIFY', 'E', ['MENU_WORKFLOW'])
  async archive(@Param('id') id: string) {
    await this.svc.archive(id);
    return { ok: true };
  }

  // ── Web Push ────────────────────────────────────────────────────────────────

  /** GET /api/notifications/push/public-key — 返回 VAPID 公钥（未配置时 enabled=false） */
  @Get('push/public-key')
  @RequireMenu('MENU_WORKFLOW_NOTIFY', 'V', ['MENU_WORKFLOW'])
  pushPublicKey() {
    return this.pushSvc.getPublicKey();
  }

  /** POST /api/notifications/push/subscribe — 保存当前用户的 Push 订阅 */
  @Post('push/subscribe')
  @RequireMenu('MENU_WORKFLOW_NOTIFY', 'E', ['MENU_WORKFLOW'])
  async pushSubscribe(@Body() dto: PushSubscribeDto) {
    return this.pushSvc.subscribe(dto);
  }

  /** POST /api/notifications/push/unsubscribe — 按 endpoint 禁用当前用户订阅 */
  @Post('push/unsubscribe')
  @RequireMenu('MENU_WORKFLOW_NOTIFY', 'E', ['MENU_WORKFLOW'])
  async pushUnsubscribe(@Body() body: { endpoint: string }) {
    return this.pushSvc.unsubscribe(body.endpoint);
  }

  /** GET /api/notifications/push/health — VAPID 配置 + 订阅统计（运维健康检查） */
  @Get('push/health')
  @RequireMenu('MENU_WORKFLOW_NOTIFY', 'V', ['MENU_WORKFLOW'])
  pushHealth() {
    return this.pushSvc.getHealth();
  }
}
