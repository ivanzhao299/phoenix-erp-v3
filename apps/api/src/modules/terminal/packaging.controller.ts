import {
  Controller, Post, Get, Patch, Body, Param, Query, Req, UseGuards,
} from '@nestjs/common';
import { TerminalService } from './terminal.service';
import { PackagingService } from './packaging.service';
import { AuthGuard } from '@nestjs/passport';

// ──────────────────────────────────────────────────────────────────────────────
// 包装作业 BFF  /api/packaging/*
// ──────────────────────────────────────────────────────────────────────────────
@Controller('api/packaging')
@UseGuards(AuthGuard('jwt'))
export class PackagingController {
  constructor(
    private readonly terminalService: TerminalService,
    private readonly packagingService: PackagingService,
  ) {}

  // ── 等级配置 ────────────────────────────────────────────────────────────────
  @Get('grade-config')
  getGradeConfig() {
    return this.terminalService.getGradeConfig();
  }

  // ── 包装规格配置 ─────────────────────────────────────────────────────────────
  @Get('pack-spec-config')
  getPackSpecConfig() {
    return this.packagingService.getPackSpecConfig();
  }

  // ── 操作员列表（包装作业台用户下拉）─────────────────────────────────────────
  @Get('operators')
  getOperators() {
    return this.packagingService.getOperators();
  }

  // ── 包装日报 ─────────────────────────────────────────────────────────────────
  @Get('daily-report')
  getDailyReport(@Query('date') date: string) {
    return this.packagingService.getDailyReport(date);
  }

  // B6: 一次返回 N 天日报（替代前端 Promise.all 7 次 GET）
  @Get('daily-report-range')
  getDailyReportRange(@Query('end_date') endDate: string, @Query('days') days: string) {
    return this.packagingService.getDailyReportRange(endDate, Number(days) || 7);
  }

  // ── 分级任务列表 ─────────────────────────────────────────────────────────────
  @Get('grading-tasks')
  getGradingTasks(
    @Query('status') status: string,
    @Query('date') date: string,
  ) {
    return this.packagingService.getGradingTasks({ status, date });
  }

  // ── 包装任务列表（包装作业台）────────────────────────────────────────────────
  @Get('tasks')
  getPackagingTasks(@Query() query: Record<string, string>) {
    return this.packagingService.getPackagingTasks(query);
  }

  // ── 集蛋班次列表 ─────────────────────────────────────────────────────────────
  @Get('shifts')
  getShifts(@Query() query: Record<string, string>) {
    return this.packagingService.getShifts(query);
  }

  // ── 新建集蛋班次 ─────────────────────────────────────────────────────────────
  @Post('shifts')
  createShift(@Body() body: any, @Req() req: any) {
    return this.packagingService.createShift(body, req.user?.userId || 0);
  }

  // ── 完成集蛋录入 ─────────────────────────────────────────────────────────────
  @Post('shifts/:id/complete')
  completeShift(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.packagingService.completeShift(Number(id), body, req.user?.userId || 0);
  }

  // ── 重开集蛋班次（申请更正）──────────────────────────────────────────────────
  @Post('shifts/:id/reopen')
  reopenShift(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.packagingService.reopenShift(Number(id), body, req.user?.userId || 0);
  }

  // ── 提交分级结果 ─────────────────────────────────────────────────────────────
  @Post('tasks/:id/grade')
  submitGrade(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.packagingService.submitGrade(id, body, req.user?.userId || 0);
  }

  // ── 包装结单 ─────────────────────────────────────────────────────────────────
  @Post('tasks/:id/pack-complete')
  packComplete(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.packagingService.packComplete(id, body, req.user?.userId || 0);
  }

  // ── 尾数合拼 ─────────────────────────────────────────────────────────────────
  @Post('tasks/merge-remainder')
  mergeRemainder(@Body() body: any, @Req() req: any) {
    return this.packagingService.mergeRemainder(body, req.user?.userId || 0);
  }

  // ── 标签补打审计（第 2 次起强制选原因）───────────────────────────────────────
  // body: { operator?, reason, label_count? }
  @Post('tasks/:id/reprint-log')
  reprintLog(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.packagingService.reprintLog(id, body, req.user?.userId || 0);
  }

  // ── 旧版提交接口（兼容）──────────────────────────────────────────────────────
  @Post('submit')
  submitPackagingTask(@Body() body: any, @Req() req: any) {
    return this.terminalService.submitPackagingTask(body, req.user?.userId || 1);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// 分级作业 BFF  /api/grading/*
// ──────────────────────────────────────────────────────────────────────────────
@Controller('api/grading')
@UseGuards(AuthGuard('jwt'))
export class GradingController {
  constructor(
    private readonly terminalService: TerminalService,
    private readonly packagingService: PackagingService,
  ) {}

  @Get('grade-config')
  getGradeConfig() {
    return this.terminalService.getGradeConfig();
  }

  @Get('tasks')
  getTasks(@Query() query: Record<string, string>) {
    return this.packagingService.getGradingTasks(query);
  }

  @Post('tasks/:id/grade')
  submitGrade(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.packagingService.submitGrade(id, body, req.user?.userId || 0);
  }
}
