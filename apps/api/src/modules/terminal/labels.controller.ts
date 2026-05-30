import { Controller, Post, Get, Body, Param, Req, UseGuards } from '@nestjs/common';
import { TerminalService } from './terminal.service';
import { LabelsService } from './labels.service';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';

// [Fix Pack 1 — HIGH-2] 替换 AuthGuard → MenuGuard，添加 RequireMenu
// [Phase R1 — HIGH-3] 添加 DataScopeGuard
@Controller('api/labels')
@UseGuards(MenuGuard, DataScopeGuard)
@RequireMenu('MENU_PKG_MGR', 'V')
export class LabelsController {
  constructor(
    private readonly terminalService: TerminalService,
    private readonly labelsService: LabelsService,
  ) {}

  // ─── ZPL 模板生成（保留旧端点）─────────────────────────────
  @Post('zpl/generate')
  async generateZpl(@Body('template_id') templateId: string, @Body('params') params: any) {
    return await this.terminalService.generateZpl(templateId, params || {});
  }

  // ─── 旧版打印日志（保留兼容，不再使用）─────────────────────
  @Post('log')
  async logPrint(@Body() body: any, @Req() req: any) {
    const userId = req.user?.userId || 1;
    return await this.terminalService.logPrint(body, userId);
  }

  // ─── 标签打印审计 V3 新端点 ────────────────────────────────
  //   PackagingTerminal 每次 iframe 静默打印后调一次
  //   LabelPrint 独立页 doPrint 也调一次
  @Post('record')
  async recordPrint(@Body() body: any, @Req() req: any) {
    const userId = Number(req.user?.userId) || 0;
    return this.labelsService.recordPrint(body, userId);
  }

  // ─── 按批次号查打印历史 ─────────────────────────────────────
  @Get('records/batch/:batchNo')
  async listByBatch(@Param('batchNo') batchNo: string) {
    return this.labelsService.listByBatch(batchNo);
  }
}
