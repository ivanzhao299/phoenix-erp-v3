/**
 * Phoenix ERP V3 — OrgController
 * RBAC-2 组织管理 API（16个端点）
 * 路由前缀：/api/org
 * 2026-05-25
 */
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { DataScopeGuard } from './guards/data-scope.guard';
import { OrgService } from './services/org.service';
import { CreateOrgDto } from './dto/create-org.dto';
import { UpdateOrgDto } from './dto/update-org.dto';
import { AssignUserOrgDto, UpdateUserOrgDto } from './dto/assign-user-org.dto';
import { CreateDataScopeDto, UpdateDataScopeDto } from './dto/update-data-scope.dto';

// [Phase R1 — HIGH-3] 添加 DataScopeGuard
@Controller('api/org')
@UseGuards(MenuGuard, DataScopeGuard)
export class OrgController {
  constructor(private readonly orgService: OrgService) {}

  // ── 组织树 ──────────────────────────────────────────────────────────────────

  @Get('organizations')
  @RequireMenu('MENU_SYS_ORG', 'V')
  async listOrganizations() {
    const data = await this.orgService.listOrgs();
    return { code: 200, data };
  }

  @Get('organizations/:id')
  @RequireMenu('MENU_SYS_ORG', 'V')
  async getOrganization(@Param('id', ParseIntPipe) id: number) {
    const data = await this.orgService.getOrg(id);
    return { code: 200, data };
  }

  @Post('organizations')
  @RequireMenu('MENU_SYS_ORG', 'C')
  async createOrganization(@Body() dto: CreateOrgDto) {
    const data = await this.orgService.createOrg(dto);
    return { code: 200, data };
  }

  @Put('organizations/:id')
  @RequireMenu('MENU_SYS_ORG', 'E')
  async updateOrganization(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrgDto,
  ) {
    const data = await this.orgService.updateOrg(id, dto);
    return { code: 200, data };
  }

  @Delete('organizations/:id')
  @RequireMenu('MENU_SYS_ORG', 'D')
  @HttpCode(HttpStatus.OK)
  async deleteOrganization(@Param('id', ParseIntPipe) id: number) {
    await this.orgService.deleteOrg(id);
    return { code: 200, message: 'deleted' };
  }

  // ── 用户-组织关系 ────────────────────────────────────────────────────────────

  /** 获取某组织的所有成员（含用户信息 + 数据范围等级） — settings/organizations 页面使用 */
  @Get('organizations/:orgId/members')
  @RequireMenu('MENU_SYS_ORG', 'V')
  async getOrgMembers(@Param('orgId', ParseIntPipe) orgId: number) {
    const data = await this.orgService.getOrgMembers(orgId);
    return { code: 200, data };
  }

  @Get('user-orgs/:userId')
  @RequireMenu('MENU_SYS_ORG', 'V')
  async getUserOrgs(@Param('userId', ParseIntPipe) userId: number) {
    const data = await this.orgService.getUserOrgs(userId);
    return { code: 200, data };
  }

  @Post('user-orgs')
  @RequireMenu('MENU_SYS_ORG', 'C')
  async assignUserOrg(@Body() dto: AssignUserOrgDto) {
    const data = await this.orgService.assignUserOrg(dto);
    return { code: 200, data };
  }

  @Put('user-orgs/:id')
  @RequireMenu('MENU_SYS_ORG', 'E')
  async updateUserOrg(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserOrgDto,
  ) {
    const data = await this.orgService.updateUserOrg(id, dto);
    return { code: 200, data };
  }

  @Delete('user-orgs/:id')
  @RequireMenu('MENU_SYS_ORG', 'D')
  @HttpCode(HttpStatus.OK)
  async removeUserOrg(@Param('id', ParseIntPipe) id: number) {
    await this.orgService.removeUserOrg(id);
    return { code: 200, message: 'deleted' };
  }

  // ── 用户额外授权 ─────────────────────────────────────────────────────────────

  @Get('user-scopes/:userId')
  @RequireMenu('MENU_SYS_ORG', 'V')
  async getUserScopes(@Param('userId', ParseIntPipe) userId: number) {
    const data = await this.orgService.getUserScopes(userId);
    return { code: 200, data };
  }

  @Post('user-scopes/project')
  @RequireMenu('MENU_SYS_ORG', 'C')
  async addProjectScope(@Body() body: { userId: number; projectCode: string }) {
    const data = await this.orgService.addProjectScope(body.userId, body.projectCode);
    return { code: 200, data };
  }

  @Delete('user-scopes/project/:id')
  @RequireMenu('MENU_SYS_ORG', 'D')
  @HttpCode(HttpStatus.OK)
  async removeProjectScope(@Param('id', ParseIntPipe) id: number) {
    await this.orgService.removeProjectScope(id);
    return { code: 200, message: 'deleted' };
  }

  @Post('user-scopes/warehouse')
  @RequireMenu('MENU_SYS_ORG', 'C')
  async addWarehouseScope(@Body() body: { userId: number; warehouseCode: string }) {
    const data = await this.orgService.addWarehouseScope(body.userId, body.warehouseCode);
    return { code: 200, data };
  }

  @Delete('user-scopes/warehouse/:id')
  @RequireMenu('MENU_SYS_ORG', 'D')
  @HttpCode(HttpStatus.OK)
  async removeWarehouseScope(@Param('id', ParseIntPipe) id: number) {
    await this.orgService.removeWarehouseScope(id);
    return { code: 200, message: 'deleted' };
  }

  // ── 数据范围规则 ─────────────────────────────────────────────────────────────

  @Get('data-scopes')
  @RequireMenu('MENU_SYS_ORG', 'V')
  async listDataScopes() {
    const data = await this.orgService.listDataScopes();
    return { code: 200, data };
  }

  @Post('data-scopes')
  @RequireMenu('MENU_SYS_ORG', 'C')
  async createDataScope(@Body() dto: CreateDataScopeDto) {
    const data = await this.orgService.createDataScope(dto);
    return { code: 200, data };
  }

  @Put('data-scopes/:id')
  @RequireMenu('MENU_SYS_ORG', 'E')
  async updateDataScope(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDataScopeDto,
  ) {
    const data = await this.orgService.updateDataScope(id, dto);
    return { code: 200, data };
  }

  @Delete('data-scopes/:id')
  @RequireMenu('MENU_SYS_ORG', 'D')
  @HttpCode(HttpStatus.OK)
  async deleteDataScope(@Param('id', ParseIntPipe) id: number) {
    await this.orgService.deleteDataScope(id);
    return { code: 200, message: 'deleted' };
  }
}
