import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RequireMenu } from '../../common/guards/menu.guard';
import { PresenceService } from './presence.service';

/**
 * G171：在线用户（管理员）。基于 SSE 长连接的在线状态。
 * 全局 MenuGuard 生效，@RequireMenu('MENU_SYSTEM','V') 限管理员/系统角色（ROLE_ADMIN 持 * 通过）。
 */
@Controller('api/system')
export class PresenceController {
  constructor(
    private readonly presence: PresenceService,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  /** GET /api/system/online-users — 在线用户明细（含姓名/角色/上次活跃） */
  @Get('online-users')
  @RequireMenu('MENU_SYSTEM', 'V')
  async onlineUsers() {
    const snap = this.presence.snapshot();
    if (snap.length === 0) return { total: 0, items: [] };
    const ids = snap.map((s) => s.userId);
    const rows: Array<{ user_id: string; username: string; real_name_zh: string; role_name_zh: string; store_code: string }> =
      await this.ds.query(
        `SELECT CAST(user_id AS VARCHAR) AS user_id, username, real_name_zh, role_name_zh, store_code
           FROM sys_user WHERE user_id = ANY($1::bigint[])`,
        [ids],
      );
    const byId = new Map(rows.map((r) => [r.user_id, r]));
    const items = snap
      .map((s) => ({
        userId: s.userId,
        username: byId.get(s.userId)?.username ?? null,
        realNameZh: byId.get(s.userId)?.real_name_zh ?? null,
        roleNameZh: byId.get(s.userId)?.role_name_zh ?? null,
        storeCode: byId.get(s.userId)?.store_code ?? null,
        connections: s.connections,
        lastSeen: s.lastSeen,
        since: s.since,
      }))
      .sort((a, b) => b.lastSeen - a.lastSeen);
    return { total: snap.length, items };
  }

  /** GET /api/system/online-count — 在线人数（顶栏小指示用） */
  @Get('online-count')
  @RequireMenu('MENU_SYSTEM', 'V')
  onlineCount() {
    return { count: this.presence.onlineCount() };
  }
}
