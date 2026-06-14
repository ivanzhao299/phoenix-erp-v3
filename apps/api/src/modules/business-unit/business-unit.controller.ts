import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { BusinessUnitService } from './business-unit.service';

/**
 * G110/S5 事业群（业务维度）管理 + 经营概览。
 * 权限沿用组织管理菜单 MENU_SYS_ORG（读）/ 写操作需 :E。
 */
@Controller('api/business-units')
@UseGuards(MenuGuard)
@RequireMenu('MENU_SYS_ORG', 'V')
export class BusinessUnitController {
  constructor(private readonly svc: BusinessUnitService) {}

  @Get()
  async list() { return { code: 200, data: await this.svc.listBus() }; }

  @Get('overview')
  async overview() { return { code: 200, data: await this.svc.overview() }; }

  @Get(':buCode/members')
  async members(@Param('buCode') buCode: string) { return { code: 200, data: await this.svc.getMembers(buCode) }; }

  @Post()
  @RequireMenu('MENU_SYS_ORG', 'E')
  async create(@Body() dto: any) { return { code: 200, data: await this.svc.createBu(dto) }; }

  @Patch(':buCode')
  @RequireMenu('MENU_SYS_ORG', 'E')
  async update(@Param('buCode') buCode: string, @Body() dto: any) { return { code: 200, data: await this.svc.updateBu(buCode, dto) }; }

  @Post('members')
  @RequireMenu('MENU_SYS_ORG', 'E')
  async addMember(@Body() dto: any) { return { code: 200, data: await this.svc.addMember(dto) }; }

  @Delete('members/:id')
  @RequireMenu('MENU_SYS_ORG', 'E')
  async removeMember(@Param('id') id: string) { return { code: 200, data: await this.svc.removeMember(id) }; }
}
