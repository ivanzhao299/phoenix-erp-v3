import {
  Controller, Get, Post, Patch, Delete, Param, Query, Body, UseGuards,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { ShareholderService } from '../services/shareholder.service';
import {
  CreateProjectDto, UpdateProjectDto, CreateShareholderDto, UpdateShareholderDto,
  CreateEquityDto, UpdateEquityDto, CreateContributionDto, CreateScopeDto,
} from '../dto/shareholder.dto';

const VIEW    = 'MENU_SHAREHOLDER_VIEW';
const MANAGE  = 'MENU_SHAREHOLDER_MANAGE';
const CONTRIB = 'MENU_SHAREHOLDER_CONTRIBUTION';
const SCOPE   = 'MENU_SHAREHOLDER_SCOPE';
const DASH    = 'MENU_SHAREHOLDER_DASHBOARD';

@Controller('api/shareholders')
@UseGuards(MenuGuard)
export class ShareholderController {
  constructor(
    private readonly svc: ShareholderService,
    private readonly cls: ClsService,
  ) {}

  private get user() {
    const u = this.cls.get('user') as any;
    return { userId: String(u?.userId ?? ''), roles: (u?.roles ?? []) as string[] };
  }

  // ── 项目 ──
  @Get('projects')                @RequireMenu(VIEW, 'V')   listProjects() { return this.svc.listProjects(); }
  @Get('projects/:projectCode')   @RequireMenu(VIEW, 'V')   getProject(@Param('projectCode') c: string) { return this.svc.getProject(c); }
  @Post('projects')               @RequireMenu(MANAGE, 'C') createProject(@Body() dto: CreateProjectDto) { return this.svc.createProject(dto); }
  @Patch('projects/:projectCode') @RequireMenu(MANAGE, 'E') updateProject(@Param('projectCode') c: string, @Body() dto: UpdateProjectDto) { return this.svc.updateProject(c, dto); }

  // ── 股权结构 ──（放在 :shareholderCode 之前，避免被参数路由吞掉）
  @Get('equity')        @RequireMenu(VIEW, 'V')   listEquity(@Query('projectCode') p?: string) { return this.svc.listEquity(p); }
  @Post('equity')       @RequireMenu(MANAGE, 'C')  createEquity(@Body() dto: CreateEquityDto) { return this.svc.createEquity(dto); }
  @Patch('equity/:id')  @RequireMenu(MANAGE, 'E')  updateEquity(@Param('id') id: string, @Body() dto: UpdateEquityDto) { return this.svc.updateEquity(id, dto); }

  // ── 出资台账 ──
  @Get('contributions')             @RequireMenu(CONTRIB, 'V') listContributions(@Query('projectCode') p?: string, @Query('shareholderCode') s?: string) { return this.svc.listContributions(p, s); }
  @Post('contributions')            @RequireMenu(CONTRIB, 'C') createContribution(@Body() dto: CreateContributionDto) { return this.svc.createContribution(dto, this.user.userId); }
  @Post('contributions/:id/confirm') @RequireMenu(CONTRIB, 'A') confirmContribution(@Param('id') id: string) { return this.svc.confirmContribution(id); }
  @Post('contributions/:id/cancel')  @RequireMenu(CONTRIB, 'E') cancelContribution(@Param('id') id: string) { return this.svc.cancelContribution(id); }

  // ── 股东查看范围 ──
  @Get('scopes')       @RequireMenu(SCOPE, 'V')  listScopes(@Query('userId') u?: string) { return this.svc.listScopes(u); }
  @Post('scopes')      @RequireMenu(SCOPE, 'C')  createScope(@Body() dto: CreateScopeDto) { return this.svc.createScope(dto); }
  @Delete('scopes/:id') @RequireMenu(SCOPE, 'D') deleteScope(@Param('id') id: string) { return this.svc.deleteScope(id); }

  // ── 股东驾驶舱（scope 驱动）──
  @Get('dashboard')                @RequireMenu(DASH, 'V') dashboard() { return this.svc.dashboard(this.user); }
  @Get('finance-bridge')           @RequireMenu(VIEW, 'V') financeBridge(@Query('projectCode') p?: string) { return this.svc.financeBridge(p); }
  @Get('capital-summary')          @RequireMenu(VIEW, 'V') capitalSummary(@Query('projectCode') p?: string) { return this.svc.capitalSummary(p); }
  @Get('beneficial')               @RequireMenu(VIEW, 'V') listBeneficial(@Query('projectCode') p?: string) { return this.svc.listBeneficial(p); }
  @Get('dashboard/:projectCode')   @RequireMenu(DASH, 'V') dashboardProject(@Param('projectCode') c: string) { return this.svc.dashboardProject(c, this.user); }

  // ── 股东档案（根路径，置于最后避免吞 static 段）──
  @Get()                       @RequireMenu(VIEW, 'V')   listShareholders() { return this.svc.listShareholders(); }
  @Post()                      @RequireMenu(MANAGE, 'C') createShareholder(@Body() dto: CreateShareholderDto) { return this.svc.createShareholder(dto); }
  @Patch(':shareholderCode')   @RequireMenu(MANAGE, 'E') updateShareholder(@Param('shareholderCode') c: string, @Body() dto: UpdateShareholderDto) { return this.svc.updateShareholder(c, dto); }
}
