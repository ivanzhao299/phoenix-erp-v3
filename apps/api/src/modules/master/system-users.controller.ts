import {
  Controller, Get, Post, Put, Body, Param, UseGuards, Req,
  BadRequestException, ConflictException, NotFoundException, ForbiddenException,
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

const MGMT_ROLES = ['ROLE_ADMIN', 'ROLE_HR_ADMIN', 'ROLE_SYSOPS'];

function statusToInt(s: string): number {
  const v = String(s || '').toUpperCase();
  if (v === 'ACTIVE') return 1;
  if (v === 'FROZEN' || v === 'INACTIVE') return 0;
  throw new BadRequestException('无效状态值 (ACTIVE/FROZEN/INACTIVE)');
}
function statusToStr(n: number): string {
  return n === 1 ? 'ACTIVE' : 'FROZEN';
}

// [Phase R1 — HIGH-3] 替换 AuthGuard('jwt') → MenuGuard + DataScopeGuard，添加 RequireMenu
@Controller('api/system/users')
@UseGuards(MenuGuard, DataScopeGuard)
@RequireMenu('MENU_SYSTEM', 'V')
export class SystemUsersController {
  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  private requireRole(user: any, allowed: string[]) {
    const role = String(user?.role || '').toUpperCase();
    if (!allowed.map(r => r.toUpperCase()).includes(role)) {
      throw new ForbiddenException(`需要角色 ${allowed.join(' / ')}`);
    }
  }

  @Get()
  async list(@Req() req: any) {
    this.requireRole(req.user, MGMT_ROLES);
    const rows = await this.em.query(`
      SELECT u.user_id AS id, u.username, u.real_name AS real_name_zh, u.locale,
             u.store_code, u.status, u.email, u.phone,
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
             ) AS roles
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
  async create(@Body() body: any, @Req() req: any) {
    this.requireRole(req.user, MGMT_ROLES);
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
  async setStatus(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    this.requireRole(req.user, MGMT_ROLES);
    const statusInt = statusToInt(body?.status);
    const result = await this.em.query(
      `UPDATE sys_user SET status = $1, updated_at = now() WHERE user_id = $2 RETURNING user_id`,
      [statusInt, id],
    );
    if (result.length === 0) throw new NotFoundException(`用户 ${id} 不存在`);
    return { code: 200, msg: '用户状态已更新', data: { id, status: statusToStr(statusInt) } };
  }

  @Put(':id/role')
  async setRole(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    this.requireRole(req.user, ['ROLE_ADMIN', 'ROLE_HR_ADMIN']);
    const { role } = body || {};
    if (!role) throw new BadRequestException('role 必填');

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
  async resetPassword(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    this.requireRole(req.user, ['ROLE_ADMIN', 'ROLE_HR_ADMIN']);
    const { password } = body || {};
    const pwErr = validatePassword(password);
    if (pwErr) throw new BadRequestException(pwErr);

    const password_hash = await bcrypt.hash(password, 10);
    const result = await this.em.query(
      `UPDATE sys_user SET password_hash = $1, updated_at = now() WHERE user_id = $2 RETURNING user_id`,
      [password_hash, id],
    );
    if (result.length === 0) throw new NotFoundException(`用户 ${id} 不存在`);
    return { code: 200, msg: '密码已重置' };
  }

  @Put(':id')
  async updateInfo(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    this.requireRole(req.user, MGMT_ROLES);
    const { real_name_zh, store_code, locale, email, phone } = body || {};
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
}
