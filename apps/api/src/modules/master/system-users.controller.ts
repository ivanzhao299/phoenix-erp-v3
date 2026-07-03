import {
  Controller, Get, Post, Put, Body, Param, Req, UseGuards,
  BadRequestException, ConflictException, NotFoundException,
} from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';

/**
 * V2 fidelity SystemUsersController
 * 来源：_archive/phoenix-backend-v2-sqlite/src/routes/users.js
 *
 * 挂载 /api/system/users
 *
 * V3 实现要点：
 *   - 写入 V3 canonical 表 sys_user / sys_user_role / sys_role (与 auth.service 一致)
 *   - 保持 V2 API 契约 (real_name_zh / role / status 等字段名)
 *   - V2 字段映射：real_name_zh → real_name, status='ACTIVE' → 1, role → role_code (通过 sys_role 翻译)
 *
 * 端点：
 *   GET    /api/system/users                列表（含角色名）
 *   POST   /api/system/users                新建（含密码强度校验 + bcrypt）
 *   PUT    /api/system/users/:id            编辑基本信息
 *   PUT    /api/system/users/:id/status     启用/冻结（ACTIVE→1 / FROZEN→0）
 *   PUT    /api/system/users/:id/role       变更主角色（写 sys_user_role is_primary=true）
 *   PUT    /api/system/users/:id/password   重置密码（bcrypt）
 */

function validatePassword(pw: string): string | null {
  if (!pw || pw.length < 8) return '密码长度至少 8 位';
  if (!/[A-Za-z]/.test(pw)) return '密码必须包含字母';
  if (!/[0-9]/.test(pw))    return '密码必须包含数字';
  return null;
}

function statusToInt(s: string): number {
  const v = String(s || '').toUpperCase();
  if (v === 'ACTIVE') return 1;
  if (v === 'FROZEN' || v === 'INACTIVE') return 0;
  if (v === 'ARCHIVED') return -1;
  throw new BadRequestException('无效状态值 (ACTIVE/FROZEN/ARCHIVED)');
}
function statusToStr(n: number): string {
  if (n === -1) return 'ARCHIVED';
  return n === 1 ? 'ACTIVE' : 'FROZEN';
}

// [Phase R1 — HIGH-3] 替换 AuthGuard('jwt') → MenuGuard + DataScopeGuard，添加 RequireMenu
@Controller('api/system/users')
@UseGuards(MenuGuard, DataScopeGuard)
@RequireMenu('MENU_SETTINGS_USER', 'V')
export class SystemUsersController {
  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  private async validateLifecycleChange(
    userId: string,
    actorUserId: number | undefined,
    nextStatus: number,
    action: 'status' | 'archive',
  ) {
    const rows = await this.em.query(
      `SELECT user_id, username, status FROM sys_user WHERE user_id = $1 LIMIT 1`,
      [userId],
    );
    const user = rows[0];
    if (!user) throw new NotFoundException(`用户 ${userId} 不存在`);

    if (String(user.username).toLowerCase() === 'admin') {
      throw new ConflictException('系统特权总控账号不可冻结、归档或恢复');
    }
    if (actorUserId && Number(user.user_id) === Number(actorUserId) && nextStatus !== 1) {
      throw new ConflictException('不能冻结或归档当前登录账号');
    }
    if (action === 'status' && Number(user.status) === -1) {
      throw new ConflictException('归档用户不能直接启用或冻结，请先执行恢复归档');
    }

    if (nextStatus !== 1) {
      const targetIsAdmin = await this.em.query(
        `SELECT 1
           FROM sys_user_role ur
           JOIN sys_role r ON r.role_id = ur.role_id
          WHERE ur.user_id = $1
            AND r.role_code = 'ROLE_ADMIN'
            AND COALESCE(ur.is_visible, true) = true
          LIMIT 1`,
        [userId],
      );
      if (targetIsAdmin[0]) {
        const otherAdmins = await this.em.query(
          `SELECT COUNT(DISTINCT u.user_id)::int AS c
             FROM sys_user u
             JOIN sys_user_role ur ON ur.user_id = u.user_id
             JOIN sys_role r ON r.role_id = ur.role_id
            WHERE u.status = 1
              AND r.role_code = 'ROLE_ADMIN'
              AND COALESCE(ur.is_visible, true) = true
              AND u.user_id <> $1`,
          [userId],
        );
        if (Number(otherAdmins[0]?.c || 0) < 1) {
          throw new ConflictException('不能冻结或归档最后一个有效管理员账号');
        }
      }
    }
  }

  private async ensureEditable(userId: string) {
    const rows = await this.em.query(`SELECT status FROM sys_user WHERE user_id = $1 LIMIT 1`, [userId]);
    if (rows.length === 0) throw new NotFoundException(`用户 ${userId} 不存在`);
    if (Number(rows[0].status) === -1) throw new ConflictException('归档用户不可编辑，请先恢复归档');
  }

  @Get()
  @RequireMenu('MENU_SETTINGS_USER', 'V')
  async list() {
    const rows = await this.em.query(`
	      SELECT u.user_id AS id, u.username, u.real_name AS real_name_zh, u.locale,
	             u.store_code, u.status, u.email, u.phone,
                 u.archived_at, u.archived_by, u.archive_reason,
             COALESCE(
               (SELECT r.role_code FROM sys_user_role ur
                  JOIN sys_role r ON ur.role_id = r.role_id
                 WHERE ur.user_id = u.user_id AND ur.is_primary = true
                 LIMIT 1),
               (SELECT r.role_code FROM sys_user_role ur
                  JOIN sys_role r ON ur.role_id = r.role_id
                 WHERE ur.user_id = u.user_id LIMIT 1)
             ) AS role,
             COALESCE(
               (SELECT json_agg(r.role_code) FROM sys_user_role ur
                  JOIN sys_role r ON ur.role_id = r.role_id
                 WHERE ur.user_id = u.user_id),
               '[]'::json
             ) AS roles,
             COALESCE(
               (SELECT json_agg(json_build_object(
                                  'role_code', r.role_code,
                                  'role_name_zh', r.role_name_zh,
                                  'approval_level', COALESCE(r.approval_level, 0),
                                  'is_primary', ur.is_primary,
                                  'is_visible', COALESCE(ur.is_visible, true)
                                ) ORDER BY ur.is_primary DESC, r.approval_level DESC NULLS LAST)
                  FROM sys_user_role ur
                  JOIN sys_role r ON ur.role_id = r.role_id
                 WHERE ur.user_id = u.user_id),
               '[]'::json
             ) AS roles_detail
        FROM sys_user u
       ORDER BY u.created_at DESC
    `).catch(() => []);

    // 兼容 V2 输出格式：status=ACTIVE/FROZEN 字符串
    const data = rows.map((r: any) => ({ ...r, status: statusToStr(Number(r.status)) }));
    const roles = await this.em.query(
      `SELECT role_code, role_name_zh, role_name_lo, description FROM sys_role ORDER BY role_code`,
    ).catch(() => []);
    return { code: 200, data, roles };
  }

  @Post()
  @RequireMenu('MENU_SETTINGS_USER', 'C')
  async create(@Body() body: any) {
    const { username, real_name_zh, real_name_lo, role, store_code, password, locale } = body || {};
    if (!username || !real_name_zh) throw new BadRequestException('用户名和姓名为必填项');
    const pwErr = validatePassword(password);
    if (pwErr) throw new BadRequestException(pwErr);

    // 用户名重复
    const dup = await this.em.query(
      `SELECT user_id FROM sys_user WHERE username = $1 LIMIT 1`,
      [username],
    ).catch(() => []);
    if (dup.length > 0) throw new ConflictException(`用户名 "${username}" 已存在`);

    // 校验角色存在 + 拿 role_id
    let roleId: number | null = null;
    if (role) {
      const roleRows = await this.em.query(
        `SELECT role_id FROM sys_role WHERE role_code = $1 LIMIT 1`,
        [role],
      ).catch(() => []);
      if (roleRows.length === 0) throw new BadRequestException(`角色 [${role}] 不存在`);
      roleId = roleRows[0].role_id;
    }

    const password_hash = await bcrypt.hash(password, 10);

    return await this.em.transaction(async (mgr) => {
      const inserted = await mgr.query(
        `INSERT INTO sys_user
           (username, password_hash, real_name, store_code, status, locale, note, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 1, $5, $6, now(), now())
         RETURNING user_id`,
        [
          username, password_hash, real_name_zh,
          store_code || 'ALL',
          locale || 'zh-CN',
          real_name_lo || null,
        ],
      );
      const userId = inserted[0]?.user_id;

      // 写 sys_user_role
      if (role && roleId && userId) {
        await mgr.query(
          `INSERT INTO sys_user_role (user_id, role_id, is_primary, granted_at)
           VALUES ($1, $2, true, now())
           ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = true`,
          [userId, roleId],
        );
      }

      return { code: 200, msg: `用户 ${username} 创建成功`, data: { id: userId } };
    });
  }

  @Put(':id/status')
  @RequireMenu('MENU_SETTINGS_USER', 'E')
  async setStatus(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const statusInt = statusToInt(body?.status);
    if (statusInt === -1) throw new BadRequestException('归档请使用 archive 接口');
    await this.validateLifecycleChange(id, req?.user?.userId, statusInt, 'status');
    const result = await this.em.query(
      `UPDATE sys_user
          SET status = $1,
              perms_version = COALESCE(perms_version,0) + 1,
              updated_at = now()
        WHERE user_id = $2
        RETURNING user_id`,
      [statusInt, id],
    );
    if (result.length === 0) throw new NotFoundException(`用户 ${id} 不存在`);
    return { code: 200, msg: '用户状态已更新', data: { id, status: statusToStr(statusInt) } };
  }

  @Put(':id/archive')
  @RequireMenu('MENU_SETTINGS_USER', 'D')
  async archive(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    await this.validateLifecycleChange(id, req?.user?.userId, -1, 'archive');
    const result = await this.em.query(
      `UPDATE sys_user
          SET status = -1,
              archived_at = now(),
              archived_by = $2,
              archive_reason = NULLIF($3, ''),
              perms_version = COALESCE(perms_version,0) + 1,
              updated_at = now()
        WHERE user_id = $1
        RETURNING user_id`,
      [id, req?.user?.userId || null, String(body?.reason || '').trim()],
    );
    if (result.length === 0) throw new NotFoundException(`用户 ${id} 不存在`);
    return { code: 200, msg: '用户已归档', data: { id, status: 'ARCHIVED' } };
  }

  @Put(':id/restore')
  @RequireMenu('MENU_SETTINGS_USER', 'E')
  async restore(@Param('id') id: string) {
    const result = await this.em.query(
      `UPDATE sys_user
          SET status = 0,
              archived_at = NULL,
              archived_by = NULL,
              archive_reason = NULL,
              perms_version = COALESCE(perms_version,0) + 1,
              updated_at = now()
        WHERE user_id = $1 AND status = -1
        RETURNING user_id`,
      [id],
    );
    if (result.length === 0) throw new NotFoundException(`归档用户 ${id} 不存在或无需恢复`);
    return { code: 200, msg: '用户已恢复至冻结态，请复核后再启用', data: { id, status: 'FROZEN' } };
  }

  @Put(':id/role')
  @RequireMenu('MENU_SETTINGS_USER', 'E')
  async setRole(@Param('id') id: string, @Body() body: any) {
    const { role } = body || {};
    if (!role) throw new BadRequestException('role 必填');
    await this.ensureEditable(id);

    const roleRows = await this.em.query(
      `SELECT role_id FROM sys_role WHERE role_code = $1 LIMIT 1`,
      [role],
    ).catch(() => []);
    if (roleRows.length === 0) throw new BadRequestException(`角色 [${role}] 不存在`);
    const roleId = roleRows[0].role_id;

    return await this.em.transaction(async (mgr) => {
      const exists = await mgr.query(
        `SELECT user_id FROM sys_user WHERE user_id = $1 LIMIT 1`,
        [id],
      );
      if (exists.length === 0) throw new NotFoundException(`用户 ${id} 不存在`);

      // 清掉所有现有 is_primary，再插入或更新本次为 primary
      await mgr.query(
        `UPDATE sys_user_role SET is_primary = false WHERE user_id = $1`,
        [id],
      );
      await mgr.query(
        `INSERT INTO sys_user_role (user_id, role_id, is_primary, granted_at)
         VALUES ($1, $2, true, now())
         ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = true`,
        [id, roleId],
      );

      // perms_version +1 触发权限刷新
      await mgr.query(
        `UPDATE sys_user SET perms_version = COALESCE(perms_version,0) + 1, updated_at = now() WHERE user_id = $1`,
        [id],
      );

      return { code: 200, msg: '用户角色已更新', data: { id, role } };
    });
  }

  @Put(':id/password')
  @RequireMenu('MENU_SETTINGS_USER', 'E')
  async resetPassword(@Param('id') id: string, @Body() body: any) {
    const { password } = body || {};
    const pwErr = validatePassword(password);
    if (pwErr) throw new BadRequestException(pwErr);
    await this.ensureEditable(id);

    const password_hash = await bcrypt.hash(password, 10);
    const result = await this.em.query(
      `UPDATE sys_user SET password_hash = $1, updated_at = now() WHERE user_id = $2 RETURNING user_id`,
      [password_hash, id],
    );
    if (result.length === 0) throw new NotFoundException(`用户 ${id} 不存在`);
    return { code: 200, msg: '密码已重置' };
  }

  @Put(':id')
  @RequireMenu('MENU_SETTINGS_USER', 'E')
  async updateInfo(@Param('id') id: string, @Body() body: any) {
    const { real_name_zh, store_code, locale, email, phone } = body || {};
    await this.ensureEditable(id);
    const result = await this.em.query(
      `UPDATE sys_user
          SET real_name = COALESCE($1, real_name),
              store_code = COALESCE($2, store_code),
              locale = COALESCE($3, locale),
              email = COALESCE($4, email),
              phone = COALESCE($5, phone),
              updated_at = now()
        WHERE user_id = $6
        RETURNING user_id`,
      [real_name_zh ?? null, store_code ?? null, locale ?? null, email ?? null, phone ?? null, id],
    );
    if (result.length === 0) throw new NotFoundException(`用户 ${id} 不存在`);
    return { code: 200, msg: '用户信息已更新' };
  }

  /**
   * PUT /api/system/users/:id/role-visibility
   * 历史字段名保留。当前语义：is_visible=false 代表该用户角色授权停用，
   * 不再参与登录 token、权限计算和前端展示；is_visible=true 恢复该角色授权。
   * body: { items: [{ role_code: string, is_visible: boolean }] }
   */
  @Put(':id/role-visibility')
  @RequireMenu('MENU_SETTINGS_USER', 'E')
  async updateRoleVisibility(@Param('id') id: string, @Body() body: any) {
    const items: { role_code: string; is_visible: boolean }[] = body?.items || [];
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException('items 不能为空');
    }
    await this.ensureEditable(id);

    await this.em.transaction(async (mgr) => {
      for (const it of items) {
        if (typeof it?.role_code !== 'string' || typeof it?.is_visible !== 'boolean') continue;
        await mgr.query(
          `UPDATE sys_user_role ur
              SET is_visible = $1
             FROM sys_role r
            WHERE ur.role_id = r.role_id
              AND ur.user_id = $2
              AND r.role_code = $3`,
          [it.is_visible, id, it.role_code],
        );
      }
      // 触发 token 重算，让前台立即看到效果
      await mgr.query(
        `UPDATE sys_user SET perms_version = COALESCE(perms_version,0) + 1, updated_at = now() WHERE user_id = $1`,
        [id],
      );
    });

    return { code: 200, msg: '角色显示状态已更新', data: { id, updated: items.length } };
  }
}
