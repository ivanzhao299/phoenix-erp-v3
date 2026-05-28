/**
 * Phoenix ERP V3 — 错误日志查询 Controller
 * Production Stabilization Phase 1
 *
 * 路由：/api/system/error-logs/...
 * 安全：仅 ADMIN 可访问（MENU_SYS_MONITOR V 权限），stack_trace 仅详情接口返回
 */
import {
  Controller, Get, Param, Query, UseGuards,
  ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { SysErrorLogsService } from '../services/sys-error-logs.service';

@Controller('api/system/error-logs')
@UseGuards(AuthGuard('jwt'), MenuGuard)
export class SysErrorLogsController {
  constructor(private readonly errorLogService: SysErrorLogsService) {}

  /** 错误列表（不含 stack_trace） */
  @Get()
  @RequireMenu('MENU_SYS_MONITOR', 'V')
  async list(
    @Query('errorType')                                         errorType?:  string,
    @Query('httpStatus', new DefaultValuePipe(0), ParseIntPipe) httpStatus?: number,
    @Query('page',       new DefaultValuePipe(1), ParseIntPipe) page?:       number,
    @Query('limit',      new DefaultValuePipe(50),ParseIntPipe) limit?:      number,
  ) {
    return this.errorLogService.list({
      errorType,
      httpStatus: httpStatus || undefined,
      page,
      limit,
    });
  }

  /** 错误详情（含 stack_trace，仅 ADMIN） */
  @Get(':id')
  @RequireMenu('MENU_SYS_MONITOR', 'V')
  async getDetail(@Param('id', ParseIntPipe) id: number) {
    return this.errorLogService.getDetail(id);
  }
}
