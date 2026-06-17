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

  /** 候选审批人查询（开放式选人 / 转交用）：权限 ∩ 数据域过滤，排除发起人 */
  @Get('eligible-approvers')
  @RequireMenu('MENU_WORKFLOW', 'V')
  async eligibleApprovers(
    @Query('menuCode') menuCode: string,
    @Query('requiredPerm') requiredPerm?: string,
    @Query('companyCode') companyCode?: string,
    @Query('projectCode') projectCode?: string,
  ) {
    return this.engine.listEligibleApprovers({ menuCode, requiredPerm, companyCode, projectCode });
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

  /** 转交候选人：实例自身 moduleCode/companyCode 解析合格审批人 */
  @Get('instances/:id/reassign-candidates')
  @RequireMenu('MENU_WORKFLOW', 'V')
  async reassignCandidates(@Param('id') id: string) {
    return this.engine.reassignCandidates(id);
  }

  /** 转交审批：把当前步改派给另一合格审批人（发起人/当前审批人/ADMIN 可操作，后端再校验） */
  @Post('instances/:id/reassign')
  @RequireMenu('MENU_WORKFLOW', 'V')
  async reassign(
    @Param('id') id: string,
    @Body() body: { toUserId: string },
  ) {
    return this.engine.reassignStep(id, body.toUserId);
  }

}
