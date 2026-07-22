import {
  Controller, Get, Post, Patch, Delete, Param, Query, Body, UseGuards,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { DataScopeGuard } from '../../org/guards/data-scope.guard';
import { ShareholderService } from '../services/shareholder.service';
import { ShareholderAccountingReconciliationService } from '../services/shareholder-accounting-reconciliation.service';
import {
  CreateProjectDto, UpdateProjectDto, CreateShareholderDto, UpdateShareholderDto,
  CreateEquityDto, UpdateEquityDto, CreateContributionDto, CreateScopeDto,
} from '../dto/shareholder.dto';

const VIEW    = 'MENU_SHAREHOLDER_VIEW';
const MANAGE  = 'MENU_SHAREHOLDER_MANAGE';
const CONTRIB = 'MENU_SHAREHOLDER_CONTRIBUTION';
const SCOPE   = 'MENU_SHAREHOLDER_SCOPE';
const DASH    = 'MENU_SHAREHOLDER_DASHBOARD';
const CAPITAL = 'MENU_SHAREHOLDER_CAPITAL';

@Controller('api/shareholders')
@UseGuards(MenuGuard, DataScopeGuard)
export class ShareholderController {
  constructor(
    private readonly svc: ShareholderService,
    private readonly accounting: ShareholderAccountingReconciliationService,
    private readonly cls: ClsService,
  ) {}

  private get user() {
    const u = this.cls.get('user') as any;
    return { userId: String(u?.userId ?? ''), roles: (u?.roles ?? (u?.role ? [u.role] : [])) as string[] };
  }

  // ── 项目 ──
  @Get('projects')                @RequireMenu(VIEW, 'V')   listProjects() { return this.svc.listProjects(this.user); }
  @Get('projects/:projectCode')   @RequireMenu(VIEW, 'V')   getProject(@Param('projectCode') c: string) { return this.svc.getProject(c, this.user); }
  @Post('projects')               @RequireMenu(MANAGE, 'C') createProject(@Body() dto: CreateProjectDto) { return this.svc.createProject(dto); }
  @Patch('projects/:projectCode') @RequireMenu(MANAGE, 'E') updateProject(@Param('projectCode') c: string, @Body() dto: UpdateProjectDto) { return this.svc.updateProject(c, dto); }

  // ── 股权结构 ──（放在 :shareholderCode 之前，避免被参数路由吞掉）
  @Get('equity')        @RequireMenu(VIEW, 'V')   listEquity(@Query('projectCode') p?: string) { return this.svc.listEquity(p, this.user); }
  @Post('equity')       @RequireMenu(MANAGE, 'C')  createEquity(@Body() dto: CreateEquityDto) { return this.svc.createEquity(dto); }
  @Patch('equity/:id')  @RequireMenu(MANAGE, 'E')  updateEquity(@Param('id') id: string, @Body() dto: UpdateEquityDto) { return this.svc.updateEquity(id, dto); }

  // ── 出资台账 ──
  @Get('contributions')             @RequireMenu(CONTRIB, 'V') listContributions(@Query('projectCode') p?: string, @Query('shareholderCode') s?: string) { return this.svc.listContributions(p, s, this.user); }
  @Post('contributions')            @RequireMenu(CONTRIB, 'C') createContribution(@Body() dto: CreateContributionDto) { return this.svc.createContribution(dto, this.user.userId); }
  @Post('contributions/:id/confirm') @RequireMenu(CONTRIB, 'A') confirmContribution(@Param('id') id: string) { return this.svc.confirmContribution(id); }
  @Post('contributions/:id/cancel')  @RequireMenu(CONTRIB, 'E') cancelContribution(@Param('id') id: string) { return this.svc.cancelContribution(id); }

  // ── 股东查看范围 ──
  @Get('scopes')       @RequireMenu(SCOPE, 'V')  listScopes(@Query('userId') u?: string) { return this.svc.listScopes(u); }
  @Post('scopes')      @RequireMenu(SCOPE, 'C')  createScope(@Body() dto: CreateScopeDto) { return this.svc.createScope(dto); }
  @Delete('scopes/:id') @RequireMenu(SCOPE, 'D') deleteScope(@Param('id') id: string) { return this.svc.deleteScope(id); }

  // ── 股东驾驶舱（scope 驱动）──
  @Get('dashboard')                @RequireMenu(DASH, 'V') dashboard() { return this.svc.dashboard(this.user); }
  @Get('finance-bridge')           @RequireMenu(VIEW, 'V') financeBridge(@Query('projectCode') p?: string) { return this.svc.financeBridge(p, this.user); }
  @Get('capital-summary')          @RequireMenu(VIEW, 'V') capitalSummary(@Query('projectCode') p?: string) { return this.svc.capitalSummary(p, this.user); }
  @Get('beneficial')               @RequireMenu(VIEW, 'V') listBeneficial(@Query('projectCode') p?: string) { return this.svc.listBeneficial(p, this.user); }

  // ── 股东权益 ↔ 好业财会计勾稽（好业财始终只读）──
  @Get('accounting/overview')
  @RequireMenu(CAPITAL, 'V')
  accountingOverview(@Query('period') period?: string) { return this.accounting.overview(period); }

  @Get('accounting/contributions/:id/voucher-candidates')
  @RequireMenu(CAPITAL, 'V')
  voucherCandidates(@Param('id') id: string) { return this.accounting.voucherCandidates(id); }

  @Get('accounting/contributions/:id/voucher-draft-preview')
  @RequireMenu(CAPITAL, 'V')
  voucherDraftPreview(@Param('id') id: string) { return this.accounting.voucherDraftPreview(id); }

  @Get('accounting/month-close-readiness')
  @RequireMenu(CAPITAL, 'V')
  monthCloseReadiness(@Query('period') period?: string) { return this.accounting.monthCloseReadiness(period); }

  @Post('accounting/mappings/confirm')
  @RequireMenu(CAPITAL, 'A')
  confirmAccountingMapping(@Body() body: Record<string, unknown>) { return this.accounting.confirmShareholderMapping(body, this.user); }

  @Post('accounting/voucher-links/confirm')
  @RequireMenu(CAPITAL, 'A')
  confirmVoucherLink(@Body() body: Record<string, unknown>) { return this.accounting.confirmVoucherLink(body, this.user); }

  @Post('accounting/contributions/:id/voucher-drafts')
  @RequireMenu(CAPITAL, 'A')
  createAccountingVoucherDraft(@Param('id') id: string, @Body() body: { confirmationToken?: string }) {
    return this.accounting.createErpVoucherDraft(id, body?.confirmationToken, this.user);
  }

  @Post('accounting/month-close')
  @RequireMenu(CAPITAL, 'A')
  closeAccountingPeriod(@Body() body: Record<string, unknown>) { return this.accounting.closePeriod(body, this.user); }

  // ── 资本流引擎（Phase 3）──
  @Get('capital/stats')            @RequireMenu(CAPITAL, 'V') capitalStats() { return this.svc.capitalStats(this.user); }
  @Get('capital')                  @RequireMenu(CAPITAL, 'V') listFlows(@Query('projectCode') p?: string, @Query('shareholderCode') s?: string, @Query('status') st?: string) { return this.svc.listFlows({ projectCode: p, shareholderCode: s, status: st }, this.user); }
  @Get('capital/:id')              @RequireMenu(CAPITAL, 'V') getFlow(@Param('id') id: string) { return this.svc.getFlow(id, this.user); }
  @Post('capital')                 @RequireMenu(CAPITAL, 'C') createFlow(@Body() dto: any) { return this.svc.createFlow(dto, this.user); }
  @Patch('capital/:id/attachments') @RequireMenu(CAPITAL, 'E') updateFlowAttachments(@Param('id') id: string, @Body() body: { attachmentUrls?: string[] }) { return this.svc.updateFlowAttachments(id, body?.attachmentUrls ?? [], this.user); }
  @Post('capital/:id/submit')      @RequireMenu(CAPITAL, 'E') submitFlow(@Param('id') id: string) { return this.svc.submitFlow(id, this.user); }
  @Post('capital/:id/confirm')     @RequireMenu(CAPITAL, 'E') confirmFlow(@Param('id') id: string) { return this.svc.confirmFlow(id, this.user); }
  @Post('capital/:id/reverse')     @RequireMenu(CAPITAL, 'E') reverseFlow(@Param('id') id: string, @Body() body: { reason?: string }) { return this.svc.reverseFlow(id, this.user, body?.reason); }
  @Get('dashboard/:projectCode')   @RequireMenu(DASH, 'V') dashboardProject(@Param('projectCode') c: string) { return this.svc.dashboardProject(c, this.user); }

  // ── 股东档案（根路径，置于最后避免吞 static 段）──
  @Get()                       @RequireMenu(VIEW, 'V')   listShareholders() { return this.svc.listShareholders(); }
  @Post()                      @RequireMenu(MANAGE, 'C') createShareholder(@Body() dto: CreateShareholderDto) { return this.svc.createShareholder(dto); }
  @Patch(':shareholderCode')   @RequireMenu(MANAGE, 'E') updateShareholder(@Param('shareholderCode') c: string, @Body() dto: UpdateShareholderDto) { return this.svc.updateShareholder(c, dto); }
}
