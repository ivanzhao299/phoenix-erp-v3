import {
  Controller, Get, Post, Put, Patch, Delete,
  Param, Query, Body, UseGuards, HttpCode,
} from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';
import { ApprovalRulesService } from './approval-rules.service';
import {
  QueryApprovalRuleDto,
  CreateApprovalRuleDto,
  UpdateApprovalRuleDto,
  UpdateApprovalRuleStatusDto,
} from './dto/approval-rule.dto';

// [Phase R1 — HIGH-3] 添加 DataScopeGuard
@Controller('api/approval/rules')
@UseGuards(MenuGuard, DataScopeGuard)
export class ApprovalRulesController {
  constructor(private readonly rulesService: ApprovalRulesService) {}

  /** 规则列表（含各规则步骤） */
  @Get()
  @RequireMenu('MENU_WORKFLOW', 'V')
  list(@Query() q: QueryApprovalRuleDto) {
    return this.rulesService.list(q);
  }

  /** 规则详情 */
  @Get(':id')
  @RequireMenu('MENU_WORKFLOW', 'V')
  findOne(@Param('id') id: string) {
    return this.rulesService.findOne(id);
  }

  /** 新建规则 — 仅 ADMIN / CEO / CFO */
  @Post()
  @RequireMenu('MENU_WORKFLOW', 'C')
  create(@Body() dto: CreateApprovalRuleDto) {
    return this.rulesService.create(dto);
  }

  /** 编辑规则（含步骤替换） — 仅 ADMIN / CEO / CFO */
  @Put(':id')
  @RequireMenu('MENU_WORKFLOW', 'E')
  update(@Param('id') id: string, @Body() dto: UpdateApprovalRuleDto) {
    return this.rulesService.update(id, dto);
  }

  /** 启用 / 禁用规则 */
  @Patch(':id/status')
  @RequireMenu('MENU_WORKFLOW', 'E')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateApprovalRuleStatusDto,
  ) {
    return this.rulesService.updateStatus(id, dto.enabled);
  }

  /** 删除规则（无进行中实例时允许） */
  @Delete(':id')
  @HttpCode(204)
  @RequireMenu('MENU_WORKFLOW', 'D')
  remove(@Param('id') id: string) {
    return this.rulesService.remove(id);
  }
}
