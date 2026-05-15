import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

/**
 * 权限集 4 层模型 CRUD + 绑定服务
 *
 * 表：
 *   sys_permission_set        权限集主表
 *   sys_permission_set_item   权限集 × 菜单 × CRUD 三元组（含 deny_codes / scope）
 *   sys_role_permission_set   角色 ↔ 权限集 多对多
 *   sys_user_permission_set   用户 ↔ 权限集 直绑（绕开角色）
 *
 * 触发器 trg_bump_perms_pset_item / trg_bump_perms_role_pset / trg_bump_perms_user_pset
 * 已经在 DDL 09 里建好，所有写操作自动 bump 受影响用户的 perms_version
 */

export interface SetItemDto {
  menu_code: string;
  perm_codes: string;   // 'V,C,E' / '*'
  deny_codes?: string;
  scope_type?: string;  // STORE | REGION | FARM | null
  scope_value?: string;
}

const VALID_PERM_CODES = new Set(['V', 'C', 'E', 'D', 'A', 'X', '*']);
const VALID_SCOPE_TYPES = new Set([null, '', 'STORE', 'REGION', 'FARM']);

function validatePermString(s: string | undefined, fieldName: string): void {
  if (!s) return;
  if (s === '*') return;
  for (const part of s.split(',')) {
    const code = part.trim().toUpperCase();
    if (!VALID_PERM_CODES.has(code)) {
      throw new BadRequestException(`${fieldName} 包含非法权限码 "${code}"，合法值: V/C/E/D/A/X/* 或逗号分隔组合`);
    }
  }
}

@Injectable()
export class PermissionSetsService {
  constructor(
    @InjectEntityManager() private readonly em: EntityManager,
  ) {}

  // ─── 列出全部权限集 ─────────────────────────────────────────────
  async list() {
    const rows = await this.em.query(
      `SELECT s.set_id, s.set_code, s.set_name_zh, s.set_name_lo, s.description,
              s.created_at, s.updated_at,
              (SELECT COUNT(*) FROM sys_permission_set_item i WHERE i.set_id = s.set_id) AS item_count,
              (SELECT COUNT(*) FROM sys_role_permission_set rps WHERE rps.set_id = s.set_id) AS role_count,
              (SELECT COUNT(*) FROM sys_user_permission_set ups WHERE ups.set_id = s.set_id) AS user_count
       FROM sys_permission_set s
       ORDER BY s.set_code`,
    );
    return { code: 200, data: rows };
  }

  // ─── 单个权限集（含 items + 绑定的角色/用户列表）────────────────
  async get(setCode: string) {
    const meta = await this.em.query(
      `SELECT * FROM sys_permission_set WHERE set_code = $1 LIMIT 1`,
      [setCode],
    );
    if (!meta[0]) throw new NotFoundException(`权限集 ${setCode} 不存在`);
    const setId = meta[0].set_id;
    const items = await this.em.query(
      `SELECT i.item_id, i.menu_id, m.menu_code, m.menu_name_zh,
              i.perm_codes, i.deny_codes, i.scope_type, i.scope_value
       FROM sys_permission_set_item i
       JOIN sys_menu m ON m.menu_id = i.menu_id
       WHERE i.set_id = $1
       ORDER BY m.sort_order`,
      [setId],
    );
    const roles = await this.em.query(
      `SELECT r.role_id, r.role_code, r.role_name_zh
       FROM sys_role_permission_set rps
       JOIN sys_role r ON r.role_id = rps.role_id
       WHERE rps.set_id = $1
       ORDER BY r.role_code`,
      [setId],
    );
    const users = await this.em.query(
      `SELECT u.user_id, u.username, u.real_name AS real_name_zh, ups.granted_at
       FROM sys_user_permission_set ups
       JOIN sys_user u ON u.user_id = ups.user_id
       WHERE ups.set_id = $1
       ORDER BY u.username`,
      [setId],
    );
    return { code: 200, data: { ...meta[0], items, roles, users } };
  }

  // ─── 创建权限集 ───────────────────────────────────────────────
  async create(body: { set_code: string; set_name_zh: string; set_name_lo?: string; description?: string }, userId: number) {
    if (!body.set_code || !/^SET_[A-Z][A-Z0-9_]*$/.test(body.set_code)) {
      throw new BadRequestException('set_code 必须形如 SET_XXX（仅大写字母数字下划线）');
    }
    if (!body.set_name_zh) throw new BadRequestException('set_name_zh 必填');
    try {
      const row = await this.em.query(
        `INSERT INTO sys_permission_set (set_code, set_name_zh, set_name_lo, description, created_by)
         VALUES ($1,$2,$3,$4,$5) RETURNING set_id, set_code`,
        [body.set_code, body.set_name_zh, body.set_name_lo || null, body.description || null, userId || null],
      );
      return { code: 200, data: row[0] };
    } catch (e: any) {
      if (String(e?.message || '').includes('duplicate key')) {
        throw new BadRequestException(`set_code ${body.set_code} 已存在`);
      }
      throw e;
    }
  }

  // ─── 更新权限集元数据 ─────────────────────────────────────────
  async update(setCode: string, body: { set_name_zh?: string; set_name_lo?: string; description?: string }) {
    const fields: string[] = [];
    const values: any[] = [];
    if (body.set_name_zh !== undefined) { fields.push(`set_name_zh = $${fields.length + 1}`); values.push(body.set_name_zh); }
    if (body.set_name_lo !== undefined) { fields.push(`set_name_lo = $${fields.length + 1}`); values.push(body.set_name_lo); }
    if (body.description !== undefined) { fields.push(`description = $${fields.length + 1}`); values.push(body.description); }
    if (fields.length === 0) throw new BadRequestException('无可更新字段');
    values.push(setCode);
    const r = await this.em.query(
      `UPDATE sys_permission_set SET ${fields.join(',')}, updated_at = NOW() WHERE set_code = $${values.length} RETURNING set_id`,
      values,
    );
    if (r.length === 0) throw new NotFoundException(`权限集 ${setCode} 不存在`);
    return { code: 200, msg: 'updated' };
  }

  // ─── 删除权限集 ───────────────────────────────────────────────
  async remove(setCode: string) {
    const r = await this.em.query(`DELETE FROM sys_permission_set WHERE set_code = $1 RETURNING set_id`, [setCode]);
    if (r.length === 0) throw new NotFoundException(`权限集 ${setCode} 不存在`);
    return { code: 200, msg: 'deleted' };
  }

  // ─── 批量覆盖权限集 items（事务：全删 + 全插）─────────────────
  async setItems(setCode: string, items: SetItemDto[]) {
    if (!Array.isArray(items)) throw new BadRequestException('items 必须是数组');
    for (const it of items) {
      if (!it.menu_code) throw new BadRequestException('item.menu_code 必填');
      validatePermString(it.perm_codes, 'perm_codes');
      validatePermString(it.deny_codes, 'deny_codes');
      if (it.scope_type && !VALID_SCOPE_TYPES.has(it.scope_type)) {
        throw new BadRequestException(`scope_type "${it.scope_type}" 非法，合法: STORE/REGION/FARM 或空`);
      }
    }

    return await this.em.transaction(async (mgr) => {
      const meta = await mgr.query(`SELECT set_id FROM sys_permission_set WHERE set_code = $1`, [setCode]);
      if (!meta[0]) throw new NotFoundException(`权限集 ${setCode} 不存在`);
      const setId = meta[0].set_id;

      await mgr.query(`DELETE FROM sys_permission_set_item WHERE set_id = $1`, [setId]);

      for (const it of items) {
        const m = await mgr.query(`SELECT menu_id FROM sys_menu WHERE menu_code = $1`, [it.menu_code]);
        if (!m[0]) throw new BadRequestException(`菜单 ${it.menu_code} 不存在`);
        await mgr.query(
          `INSERT INTO sys_permission_set_item (set_id, menu_id, perm_codes, deny_codes, scope_type, scope_value)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [setId, m[0].menu_id, it.perm_codes, it.deny_codes || null, it.scope_type || null, it.scope_value || null],
        );
      }
      return { code: 200, msg: `${items.length} items saved` };
    });
  }

  // ─── 绑定 权限集 → 角色 ────────────────────────────────────────
  async bindRole(setCode: string, roleCode: string) {
    const r = await this.em.query(
      `INSERT INTO sys_role_permission_set (role_id, set_id)
       SELECT r.role_id, s.set_id
       FROM sys_role r, sys_permission_set s
       WHERE r.role_code = $1 AND s.set_code = $2
       ON CONFLICT DO NOTHING
       RETURNING role_id`,
      [roleCode, setCode],
    );
    if (r.length === 0) {
      // 检查是否真的不存在，还是 ON CONFLICT 跳过
      const exists = await this.em.query(
        `SELECT 1 FROM sys_role_permission_set rps
         JOIN sys_role r ON r.role_id = rps.role_id
         JOIN sys_permission_set s ON s.set_id = rps.set_id
         WHERE r.role_code = $1 AND s.set_code = $2 LIMIT 1`,
        [roleCode, setCode],
      );
      if (exists.length > 0) return { code: 200, msg: 'already bound' };
      throw new NotFoundException(`角色 ${roleCode} 或权限集 ${setCode} 不存在`);
    }
    return { code: 200, msg: 'bound' };
  }

  async unbindRole(setCode: string, roleCode: string) {
    await this.em.query(
      `DELETE FROM sys_role_permission_set
       WHERE role_id = (SELECT role_id FROM sys_role WHERE role_code = $1)
         AND set_id  = (SELECT set_id  FROM sys_permission_set WHERE set_code = $2)`,
      [roleCode, setCode],
    );
    return { code: 200, msg: 'unbound' };
  }

  // ─── 绑定 权限集 → 用户（直绑，绕开角色路径） ───────────────────
  async bindUser(setCode: string, userId: number, grantedBy: number) {
    const r = await this.em.query(
      `INSERT INTO sys_user_permission_set (user_id, set_id, granted_by)
       SELECT $1, s.set_id, $3
       FROM sys_permission_set s
       WHERE s.set_code = $2
       ON CONFLICT DO NOTHING
       RETURNING user_id`,
      [userId, setCode, grantedBy || null],
    );
    if (r.length === 0) {
      const exists = await this.em.query(
        `SELECT 1 FROM sys_user_permission_set ups
         JOIN sys_permission_set s ON s.set_id = ups.set_id
         WHERE ups.user_id = $1 AND s.set_code = $2 LIMIT 1`,
        [userId, setCode],
      );
      if (exists.length > 0) return { code: 200, msg: 'already bound' };
      throw new NotFoundException(`用户 ${userId} 或权限集 ${setCode} 不存在`);
    }
    return { code: 200, msg: 'bound' };
  }

  async unbindUser(setCode: string, userId: number) {
    await this.em.query(
      `DELETE FROM sys_user_permission_set
       WHERE user_id = $1 AND set_id = (SELECT set_id FROM sys_permission_set WHERE set_code = $2)`,
      [userId, setCode],
    );
    return { code: 200, msg: 'unbound' };
  }
}
