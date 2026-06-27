/**
 * Phoenix ERP V3 — 备份记录 / 计划配置 Controller
 * 路由：/api/system/backup/...   安全：MENU_SETTINGS_CONFIG
 *   - GET  records  列表(V)
 *   - POST request  手动请求备份,入队 PENDING(E) —— 不在应用内执行 pg_dump
 *   - GET  config   计划/保留配置(V)
 *   - PUT  config   改配置(E)
 */
import {
  Controller, Get, Post, Put, Query, Body, UseGuards,
  ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { ClsService } from 'nestjs-cls';
import { SysBackupService } from '../services/sys-backup.service';

@Controller('api/system/backup')
@UseGuards(AuthGuard('jwt'), MenuGuard)
export class SysBackupController {
  constructor(
    private readonly backupService: SysBackupService,
    private readonly cls: ClsService,
  ) {}

  @Get('records')
  @RequireMenu('MENU_SETTINGS_CONFIG', 'V')
  async records(
    @Query('status')                                         status?: string,
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page?:   number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?:  number,
  ) {
    return this.backupService.listRecords({ status, page, limit });
  }

  @Post('request')
  @RequireMenu('MENU_SETTINGS_CONFIG', 'E')
  async request(@Body() body: { backupType?: string }) {
    const user = this.cls.get('user');
    return this.backupService.requestBackup(body?.backupType, user?.name ?? user?.username);
  }

  @Get('config')
  @RequireMenu('MENU_SETTINGS_CONFIG', 'V')
  async getConfig() {
    return this.backupService.getConfig();
  }

  @Put('config')
  @RequireMenu('MENU_SETTINGS_CONFIG', 'E')
  async putConfig(@Body() body: { enabled?: boolean; cronExpr?: string; retentionDays?: number }) {
    return this.backupService.putConfig(body);
  }
}
