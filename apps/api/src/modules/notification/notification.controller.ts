import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';
import { NotificationService } from './notification.service';

@Controller('api/notifications')
@UseGuards(MenuGuard, DataScopeGuard)
export class NotificationController {
  constructor(private readonly svc: NotificationService) {}

  @Get()
  @RequireMenu('MENU_WORKFLOW', 'V')
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
  @RequireMenu('MENU_WORKFLOW', 'V')
  async unreadCount() {
    const count = await this.svc.getUnreadCount();
    return { count };
  }

  @Post(':id/read')
  @RequireMenu('MENU_WORKFLOW', 'V')
  async markRead(@Param('id') id: string) {
    await this.svc.markRead(id);
    return { ok: true };
  }

  @Post('read-all')
  @RequireMenu('MENU_WORKFLOW', 'V')
  async markAllRead() {
    await this.svc.markAllRead();
    return { ok: true };
  }

  @Post(':id/archive')
  @RequireMenu('MENU_WORKFLOW', 'V')
  async archive(@Param('id') id: string) {
    await this.svc.archive(id);
    return { ok: true };
  }
}
