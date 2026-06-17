import { Controller, Get, Logger } from '@nestjs/common';
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
  private readonly log = new Logger('Presence');
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
    // SSE 连接的 userId 应是数字 user_id；过滤非数字，避免单个脏值让 ::bigint[] 转换失败拖垮整端点
    const ids = snap.map((s) => s.userId).filter((id) => /^\d+$/.test(String(id)));
    const byId = new Map<string, { user_id: string; username: string; real_name_zh: string; role_name_zh: string; store_code: string }>();
    if (ids.length > 0) {
      try {
        // 列名照 bff /api/users 范式：sys_user 主键是 user_id，中文名是 real_name，
        // 角色中文名需从 sys_user_role JOIN sys_role 取（sys_user 无 role_name_zh 列）。
        const rows: Array<{ user_id: string; username: string; real_name_zh: string; role_name_zh: string; store_code: string }> =
          await this.ds.query(
            `SELECT CAST(u.user_id AS VARCHAR) AS user_id,
                    u.username,
                    u.real_name AS real_name_zh,
                    COALESCE(
                      (SELECT r.role_name_zh FROM sys_user_role ur
                         JOIN sys_role r ON ur.role_id = r.role_id
                        WHERE ur.user_id = u.user_id AND ur.is_primary = true LIMIT 1),
                      (SELECT r.role_name_zh FROM sys_user_role ur
                         JOIN sys_role r ON ur.role_id = r.role_id
                        WHERE ur.user_id = u.user_id LIMIT 1)
                    ) AS role_name_zh,
                    u.store_code
               FROM sys_user u WHERE u.user_id = ANY($1::bigint[])`,
            [ids],
          );
        for (const r of rows) byId.set(String(r.user_id), r);
      } catch (e) {
        // 查库失败时降级：仍返回在线快照（仅缺姓名/角色），不让整端点 500/400
        this.log.warn(`online-users 用户信息查询失败，降级返回: ${(e as Error).message}`);
      }
    }
    const items = snap
      .map((s) => ({
        userId: s.userId,
        username: byId.get(String(s.userId))?.username ?? null,
        realNameZh: byId.get(String(s.userId))?.real_name_zh ?? null,
        roleNameZh: byId.get(String(s.userId))?.role_name_zh ?? null,
        storeCode: byId.get(String(s.userId))?.store_code ?? null,
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
