/**
 * NotificationConfigController — /api/notifications/* CRUD
 *
 *   GET  /rules           列规则
 *   GET  /rules/:code     单条
 *   POST /rules           新建
 *   PUT  /rules/:code     改
 *   DELETE /rules/:code   删
 *
 *   GET  /templates / POST / PUT / DELETE
 *   GET  /channels  / PUT     仅启停 + config
 *   GET  /logs?status=...&user_id=...&rule_code=...&limit=100
 *   POST /logs/:id/retry      重试
 *   POST /test/:rule_code     管理员手动触发测试
 *
 *   GET  /prefs/me            当前用户偏好
 *   PUT  /prefs/me/:category  设置开关
 */

import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, Req, NotFoundException, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { NotificationDispatcherService } from './notification-dispatcher.service';

@Controller('api/notifications/config')
@UseGuards(AuthGuard('jwt'), MenuGuard)
export class NotificationConfigController {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly dispatcher: NotificationDispatcherService,
  ) {}

  // ── 规则 ─────────────────────────────────────────────────────────────────
  @Get('rules')
  @RequireMenu('MENU_SETTINGS_NOTIFY', 'V')
  async listRules(@Query('category') category?: string, @Query('status') status?: string) {
    const where: string[] = [];
    const args: any[] = [];
    if (category) { args.push(category); where.push(`category=$${args.length}`); }
    if (status)   { args.push(status);   where.push(`status=$${args.length}`); }
    const sql = `SELECT * FROM sys_notification_rules ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id`;
    return await this.ds.query(sql, args);
  }

  @Get('rules/:code')
  @RequireMenu('MENU_SETTINGS_NOTIFY', 'V')
  async getRule(@Param('code') code: string) {
    const rows = await this.ds.query(`SELECT * FROM sys_notification_rules WHERE rule_code=$1 LIMIT 1`, [code]);
    if (!rows[0]) throw new NotFoundException(code);
    return rows[0];
  }

  @Post('rules')
  @RequireMenu('MENU_SETTINGS_NOTIFY', 'C')
  async createRule(@Body() body: any) {
    const r = await this.ds.query(
      `INSERT INTO sys_notification_rules
       (rule_code, rule_name, category, event_type, trigger_config, recipient_strategy, recipient_config,
        channels, template_code, priority, dedupe_window_sec, status, remark)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [body.rule_code, body.rule_name, body.category, body.event_type,
       JSON.stringify(body.trigger_config || {}),
       body.recipient_strategy, JSON.stringify(body.recipient_config || {}),
       body.channels || ['STATION'], body.template_code,
       body.priority || 'NORMAL', body.dedupe_window_sec || 300,
       body.status || 'ACTIVE', body.remark || null],
    );
    return r[0];
  }

  @Put('rules/:code')
  @RequireMenu('MENU_SETTINGS_NOTIFY', 'E')
  async updateRule(@Param('code') code: string, @Body() body: any) {
    await this.ds.query(
      `UPDATE sys_notification_rules SET
          rule_name=COALESCE($2, rule_name),
          category=COALESCE($3, category),
          event_type=COALESCE($4, event_type),
          trigger_config=COALESCE($5::jsonb, trigger_config),
          recipient_strategy=COALESCE($6, recipient_strategy),
          recipient_config=COALESCE($7::jsonb, recipient_config),
          channels=COALESCE($8, channels),
          template_code=COALESCE($9, template_code),
          priority=COALESCE($10, priority),
          dedupe_window_sec=COALESCE($11, dedupe_window_sec),
          status=COALESCE($12, status),
          remark=COALESCE($13, remark),
          updated_at=now()
        WHERE rule_code=$1`,
      [code, body.rule_name, body.category, body.event_type,
       body.trigger_config ? JSON.stringify(body.trigger_config) : null,
       body.recipient_strategy,
       body.recipient_config ? JSON.stringify(body.recipient_config) : null,
       body.channels, body.template_code, body.priority,
       body.dedupe_window_sec, body.status, body.remark],
    );
    return { ok: true };
  }

  @Delete('rules/:code')
  @RequireMenu('MENU_SETTINGS_NOTIFY', 'D')
  async deleteRule(@Param('code') code: string) {
    await this.ds.query(`DELETE FROM sys_notification_rules WHERE rule_code=$1`, [code]);
    return { ok: true };
  }

  // ── 模板 ─────────────────────────────────────────────────────────────────
  @Get('templates')
  @RequireMenu('MENU_SETTINGS_NOTIFY', 'V')
  async listTemplates(@Query('template_code') code?: string) {
    if (code) {
      return await this.ds.query(
        `SELECT * FROM sys_notification_templates WHERE template_code=$1 ORDER BY locale, channel`,
        [code],
      );
    }
    return await this.ds.query(`SELECT * FROM sys_notification_templates ORDER BY template_code, locale, channel`);
  }

  @Post('templates')
  @RequireMenu('MENU_SETTINGS_NOTIFY', 'C')
  async createTemplate(@Body() body: any) {
    const r = await this.ds.query(
      `INSERT INTO sys_notification_templates (template_code, locale, channel, title_tmpl, content_tmpl, variables, status)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7) RETURNING *`,
      [body.template_code, body.locale || 'zh-CN', body.channel, body.title_tmpl, body.content_tmpl,
       JSON.stringify(body.variables || {}), body.status || 'ACTIVE'],
    );
    return r[0];
  }

  @Put('templates/:id')
  @RequireMenu('MENU_SETTINGS_NOTIFY', 'E')
  async updateTemplate(@Param('id') id: string, @Body() body: any) {
    await this.ds.query(
      `UPDATE sys_notification_templates SET
         title_tmpl=COALESCE($2,title_tmpl),
         content_tmpl=COALESCE($3,content_tmpl),
         variables=COALESCE($4::jsonb,variables),
         status=COALESCE($5,status),
         updated_at=now() WHERE id=$1`,
      [id, body.title_tmpl, body.content_tmpl,
       body.variables ? JSON.stringify(body.variables) : null, body.status],
    );
    return { ok: true };
  }

  @Delete('templates/:id')
  @RequireMenu('MENU_SETTINGS_NOTIFY', 'D')
  async deleteTemplate(@Param('id') id: string) {
    await this.ds.query(`DELETE FROM sys_notification_templates WHERE id=$1`, [id]);
    return { ok: true };
  }

  // ── 渠道 ─────────────────────────────────────────────────────────────────
  @Get('channels')
  @RequireMenu('MENU_SETTINGS_NOTIFY', 'V')
  async listChannels() {
    return await this.ds.query(`SELECT * FROM sys_notification_channels ORDER BY channel_code`);
  }

  @Put('channels/:code')
  @RequireMenu('MENU_SETTINGS_NOTIFY', 'E')
  async updateChannel(@Param('code') code: string, @Body() body: any) {
    await this.ds.query(
      `UPDATE sys_notification_channels SET
         enabled=COALESCE($2,enabled),
         config=COALESCE($3::jsonb,config),
         daily_quota=COALESCE($4,daily_quota),
         rate_limit_per_min=COALESCE($5,rate_limit_per_min),
         status=COALESCE($6,status),
         remark=COALESCE($7,remark),
         updated_at=now() WHERE channel_code=$1`,
      [code, body.enabled, body.config ? JSON.stringify(body.config) : null,
       body.daily_quota, body.rate_limit_per_min, body.status, body.remark],
    );
    return { ok: true };
  }

  // ── 日志 ─────────────────────────────────────────────────────────────────
  @Get('logs')
  @RequireMenu('MENU_SETTINGS_NOTIFY', 'V')
  async listLogs(
    @Query('status') status?: string,
    @Query('rule_code') ruleCode?: string,
    @Query('user_id') userId?: string,
    @Query('limit') limit = '100',
  ) {
    const where: string[] = []; const args: any[] = [];
    if (status)   { args.push(status);   where.push(`status=$${args.length}`); }
    if (ruleCode) { args.push(ruleCode); where.push(`rule_code=$${args.length}`); }
    if (userId)   { args.push(userId);   where.push(`recipient_user_id=$${args.length}`); }
    args.push(Math.min(parseInt(limit, 10) || 100, 1000));
    const sql = `SELECT id, rule_code, template_code, recipient_user_id, channel, title, content,
                        status, attempt_count, last_error, sent_at, created_at
                   FROM sys_notification_log
                  ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                  ORDER BY created_at DESC LIMIT $${args.length}`;
    return await this.ds.query(sql, args);
  }

  /** 手动触发测试一条规则（管理员用） */
  @Post('test/:code')
  @RequireMenu('MENU_SETTINGS_NOTIFY', 'E')
  async testFire(@Param('code') code: string, @Body() body: any) {
    await this.dispatcher.fire(code, body || {});
    return { ok: true, msg: '已触发，请查看日志' };
  }

  // ── 用户偏好 ─────────────────────────────────────────────────────────────
  @Get('prefs/me')
  async myPrefs(@Req() req: any) {
    const userId = req?.user?.userId || req?.user?.id;
    if (!userId) return [];
    return await this.ds.query(
      `SELECT category, channels_opt_in, enabled FROM sys_user_notification_prefs WHERE user_id=$1`,
      [userId],
    );
  }

  @Put('prefs/me/:category')
  async setMyPref(@Param('category') category: string, @Body() body: any, @Req() req: any) {
    const userId = req?.user?.userId || req?.user?.id;
    if (!userId) return { ok: false };
    await this.ds.query(
      `INSERT INTO sys_user_notification_prefs (user_id, category, channels_opt_in, enabled)
       VALUES ($1,$2,$3::jsonb,$4)
       ON CONFLICT (user_id, category) DO UPDATE
         SET channels_opt_in=EXCLUDED.channels_opt_in,
             enabled=EXCLUDED.enabled,
             updated_at=now()`,
      [userId, category, JSON.stringify(body.channels_opt_in || {}), body.enabled !== false],
    );
    return { ok: true };
  }
}
