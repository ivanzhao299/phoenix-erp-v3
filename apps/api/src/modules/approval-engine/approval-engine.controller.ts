import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';
import { ApprovalEngineService } from './approval-engine.service';

// [Phase R1 — HIGH-3] 添加 DataScopeGuard
@Controller('api/approval')
@UseGuards(MenuGuard, DataScopeGuard)
export class ApprovalEngineController {
  constructor(private readonly engine: ApprovalEngineService) {}

  /** 我的审批待办 */
  @Get('todos')
  @RequireMenu('MENU_WORKFLOW', 'V')
  async getMyTodos() {
    return this.engine.getMyTodos();
  }

  /** 审批历史 */
  @Get('history')
  @RequireMenu('MENU_WORKFLOW', 'V')
  async getHistory(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('bizType') bizType?: string,
  ) {
    return this.engine.getHistory(Number(page), Number(pageSize), bizType);
  }

  /** 实例详情 */
  @Get('instances/:id')
  @RequireMenu('MENU_WORKFLOW', 'V')
  async getDetail(@Param('id') id: string) {
    return this.engine.getInstanceDetail(id);
  }

  /** 通过业务单据获取实例 */
  @Get('by-biz/:bizType/:bizId')
  @RequireMenu('MENU_WORKFLOW', 'V')
  async getByBiz(
    @Param('bizType') bizType: string,
    @Param('bizId') bizId: string,
  ) {
    return this.engine.getInstanceByBiz(bizType, bizId);
  }

  /** 审批通过 */
  @Post('instances/:id/approve')
  @RequireMenu('MENU_WORKFLOW', 'A')
  async approve(
    @Param('id') id: string,
    @Body() body: { comment?: string },
  ) {
    return this.engine.approveStep(id, body.comment);
  }

  /** 审批拒绝 */
  @Post('instances/:id/reject')
  @RequireMenu('MENU_WORKFLOW', 'A')
  async reject(
    @Param('id') id: string,
    @Body() body: { comment?: string },
  ) {
    await this.engine.rejectStep(id, body.comment);
    return { code: 200, message: '已拒绝' };
  }

}
