import { Injectable, BadRequestException, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

/**
 * PdaTerminalsService — V2 fidelity port
 * 来源：_archive/phoenix-backend-v2-sqlite/src/routes/pdaTerminals.js
 *
 * 终端 CRUD + 自注册 + 心跳 + 全局配置 + 扫码协议下发
 */

const ALLOWED_PROTOCOLS = ['keyboard', 'newland', 'urovo', 'zebra', 'chainway', 'honeywell', 'custom'];
const ALLOWED_MODULES   = ['receipt', 'picking', 'inspection', 'loading', 'stocktake', 'labels', 'sync', 'download'];

function isOnline(lastSeen: string | null | undefined): boolean {
  if (!lastSeen) return false;
  const t = Date.parse(lastSeen);
  if (Number.isNaN(t)) return false;
  return (Date.now() - t) < 60000;
}

function formatTerminal(row: any) {
  return {
    ...row,
    enabled_modules: (() => {
      try { return JSON.parse(row.enabled_modules || '[]'); } catch { return []; }
    })(),
    // `last_seen` is a legacy TIMESTAMP (without time zone).  Compute the
    // liveness flag in PostgreSQL, where NOW() and the stored value share the
    // connection timezone, instead of reparsing the driver string in Node.
    online: typeof row._online === 'boolean' ? row._online : isOnline(row.last_seen),
  };
}

@Injectable()
export class PdaTerminalsService {
  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  // ─── 终端 CRUD ──────────────────────────────────────────────────────────
  async listTerminals() {
    const rows = await this.em.query(
      `SELECT pda_terminals.*,
              (last_seen IS NOT NULL
               AND last_seen >= (CURRENT_TIMESTAMP AT TIME ZONE current_setting('TIMEZONE')) - INTERVAL '60 seconds') AS _online
         FROM pda_terminals
        ORDER BY created_at DESC`,
    );
    return { code: 0, data: rows.map(formatTerminal) };
  }

  async createTerminal(body: any) {
    const {
      name, brand = '', model = '', serial = '', scan_protocol = 'keyboard',
      scan_prefix = '', scan_suffix = '', location = '',
      enabled_modules, printer_ip = '', notes = '',
    } = body || {};

    if (!name || !String(name).trim()) throw new BadRequestException('终端名称不能为空');
    if (!ALLOWED_PROTOCOLS.includes(scan_protocol)) {
      throw new BadRequestException(`无效的扫码协议: ${scan_protocol}`);
    }
    const mods = Array.isArray(enabled_modules) ? enabled_modules : ALLOWED_MODULES;
    const modulesJson = JSON.stringify(mods.filter((m: string) => ALLOWED_MODULES.includes(m)));

    // 重复 serial 拦截
    if (serial) {
      const dup = await this.em.query(`SELECT id FROM pda_terminals WHERE serial = $1 LIMIT 1`, [serial]).catch(() => []);
      if (dup.length > 0) throw new ConflictException('设备序列号已存在');
    }

    await this.em.query(
      `INSERT INTO pda_terminals
         (name, brand, model, serial, scan_protocol, scan_prefix, scan_suffix,
          location, enabled_modules, printer_ip, notes, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'active', now())`,
      [
        String(name).trim(), brand, model, serial, scan_protocol,
        scan_prefix, scan_suffix, location, modulesJson, printer_ip, notes,
      ],
    );
    const row = (await this.em.query(
      `SELECT * FROM pda_terminals WHERE serial = $1 ORDER BY id DESC LIMIT 1`,
      [serial],
    ))[0];
    return { code: 0, data: formatTerminal(row) };
  }

  async updateTerminal(id: number | string, body: any) {
    const existingRows = await this.em.query(`SELECT * FROM pda_terminals WHERE id = $1`, [id]);
    if (existingRows.length === 0) throw new NotFoundException('终端不存在');
    const ex = existingRows[0];

    const modules = body?.enabled_modules
      ? JSON.stringify(body.enabled_modules.filter((m: string) => ALLOWED_MODULES.includes(m)))
      : ex.enabled_modules;

    await this.em.query(
      `UPDATE pda_terminals SET
         name = $1, brand = $2, model = $3, serial = $4,
         scan_protocol = $5, scan_prefix = $6, scan_suffix = $7,
         location = $8, enabled_modules = $9, printer_ip = $10,
         status = $11, notes = $12
       WHERE id = $13`,
      [
        body?.name ?? ex.name, body?.brand ?? ex.brand, body?.model ?? ex.model,
        body?.serial ?? ex.serial, body?.scan_protocol ?? ex.scan_protocol,
        body?.scan_prefix ?? ex.scan_prefix, body?.scan_suffix ?? ex.scan_suffix,
        body?.location ?? ex.location, modules, body?.printer_ip ?? ex.printer_ip,
        body?.status ?? ex.status, body?.notes ?? ex.notes, id,
      ],
    );
    const row = (await this.em.query(`SELECT * FROM pda_terminals WHERE id = $1`, [id]))[0];
    return { code: 0, data: formatTerminal(row) };
  }

  async deleteTerminal(id: number | string) {
    const ex = await this.em.query(`SELECT id FROM pda_terminals WHERE id = $1`, [id]);
    if (ex.length === 0) throw new NotFoundException('终端不存在');
    await this.em.query(`DELETE FROM pda_terminals WHERE id = $1`, [id]);
    return { code: 0, msg: '已删除' };
  }

  // ─── 自注册 + 心跳 ──────────────────────────────────────────────────────
  async register(body: any) {
    const { serial, brand = '', model = '', app_version = '', name } = body || {};
    if (!serial) throw new BadRequestException('serial 不能为空');

    let existing = await this.em.query(`SELECT * FROM pda_terminals WHERE serial = $1`, [serial]);
    if (existing.length === 0) {
      const autoName = name || `${brand || '未知品牌'}-${String(serial).slice(-6)}`;
      await this.em.query(
        `INSERT INTO pda_terminals (name, brand, model, serial, app_version, status, created_at)
         VALUES ($1, $2, $3, $4, $5, 'pending', now())`,
        [autoName, brand, model, serial, app_version],
      );
      existing = await this.em.query(`SELECT * FROM pda_terminals WHERE serial = $1`, [serial]);
      return {
        code: 202,
        msg: '设备已提交注册，等待管理员审核激活',
        terminal: formatTerminal(existing[0]),
      };
    }

    await this.em.query(
      `UPDATE pda_terminals SET app_version = $1, last_seen = now() WHERE serial = $2`,
      [app_version, serial],
    );
    const row = existing[0];

    if (row.status === 'pending') {
      return { code: 202, msg: '等待管理员审核', terminal: formatTerminal(row) };
    }
    if (row.status === 'inactive') {
      throw new ForbiddenException({ code: 403, msg: '设备已被停用', terminal: formatTerminal(row) });
    }

    return {
      code: 0,
      msg: '注册成功',
      terminal: formatTerminal(row),
      scanner_config: {
        protocol: row.scan_protocol,
        prefix:   row.scan_prefix,
        suffix:   row.scan_suffix,
        debounce_ms: 200,
      },
      enabled_modules: (() => { try { return JSON.parse(row.enabled_modules || '[]'); } catch { return []; } })(),
    };
  }

  async heartbeat(body: any) {
    const { serial } = body || {};
    if (!serial) throw new BadRequestException('serial 不能为空');
    await this.em.query(
      `UPDATE pda_terminals SET last_seen = now() WHERE serial = $1`,
      [serial],
    );
    return { code: 0, ts: new Date().toISOString() };
  }

  // ─── 全局系统配置 ───────────────────────────────────────────────────────
  async getSystemConfig() {
    const rows = await this.em.query(`SELECT config_key AS key, config_value AS value FROM pda_system_config`).catch(() => []);
    return { code: 0, data: Object.fromEntries(rows.map((r: any) => [r.key, r.value])) };
  }

  async updateSystemConfig(body: any) {
    const allowed = ['server_url', 'api_url', 'scan_debounce_ms', 'heartbeat_interval_s',
                     'label_paper_size', 'auto_approve'];
    const updates = Object.entries(body || {}).filter(([k]) => allowed.includes(k));
    for (const [k, v] of updates) {
      await this.em.query(
        `INSERT INTO pda_system_config (config_key, config_value, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value, updated_at = EXCLUDED.updated_at`,
        [k, String(v)],
      );
    }
    const rows = await this.em.query(`SELECT config_key AS key, config_value AS value FROM pda_system_config`).catch(() => []);
    return { code: 0, data: Object.fromEntries(rows.map((r: any) => [r.key, r.value])) };
  }

  async getScannerConfig(serial: string) {
    const rows = await this.em.query(`SELECT * FROM pda_terminals WHERE serial = $1`, [serial]);
    if (rows.length === 0) throw new NotFoundException('未找到终端');
    const r = rows[0];
    return {
      code: 0,
      protocol: r.scan_protocol,
      prefix:   r.scan_prefix,
      suffix:   r.scan_suffix,
    };
  }
}
