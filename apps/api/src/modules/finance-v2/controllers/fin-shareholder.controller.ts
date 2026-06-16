import {
  Controller, Get, Post, Patch, Param, Body, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { MenuGuard, RequireMenu }  from '../../../common/guards/menu.guard';
import { DataScopeGuard }          from '../../org/guards/data-scope.guard';
import { DataScopeContext }         from '../../org/services/data-scope.service';
import { ShareholderContributionsService } from '../services/shareholder-contributions.service';
import { ShareholderSettlementsService }   from '../services/shareholder-settlements.service';

import {
  CreateShareholderContributionDto,
  UpdateShareholderContributionDto,
  QueryShareholderContributionDto,
  ConfirmShareholderContributionDto,
  CancelShareholderContributionDto,
  CreateShareholderSettlementDto,
  QueryShareholderSettlementDto,
  SubmitShareholderSettlementDto,
  ApproveShareholderSettlementDto,
  CancelShareholderSettlementDto,
} from '../dto/shareholder.dto';

const MENU = 'MENU_FIN2_SHAREHOLDER';

@Controller('api/v2/finance/shareholders')
@UseGuards(MenuGuard, DataScopeGuard)
export class FinShareholderController {
  constructor(
    private readonly contribSvc: ShareholderContributionsService,
    private readonly settleSvc:  ShareholderSettlementsService,
    private readonly cls:        ClsService,
  ) {}

  private get user() { return this.cls.get('user') as any; }

  /** C2 修复：从 CLS DataScope 构建 enrichedUser */
  private get scopedUser() {
    const user = this.cls.get('user') as any;
    const scope = this.cls.get('dataScope') as DataScopeContext | undefined;
    return {
      ...user,
      dataScope: {
        scopeAll:     scope ? scope.isGlobal : false,
        companyCodes: scope ? scope.allowedCompanyCodes : [],
      },
    };
  }

  // ════════════════════════════════════════════════════════════════════════
  // 股东出资
  // ════════════════════════════════════════════════════════════════════════

  /** GET /api/v2/finance/shareholders/contributions */
  @Get('contributions')
  @RequireMenu(MENU, 'V')
  listContributions(@Query() dto: QueryShareholderContributionDto) {
    return this.contribSvc.list(dto, this.scopedUser);
  }

  /** GET /api/v2/finance/shareholders/contributions/summary */
  @Get('contributions/summary')
  @RequireMenu(MENU, 'V')
  contributionSummary() {
    return this.contribSvc.getSummary(this.scopedUser);
  }

  /** GET /api/v2/finance/shareholders/contributions/:id */
  @Get('contributions/:id')
  @RequireMenu(MENU, 'V')
  getContribution(@Param('id') id: string) {
    return this.contribSvc.findById(id, this.scopedUser);
  }

  /** POST /api/v2/finance/shareholders/contributions */
  // G170：新建出资改判 'C'(创建)，与确认/直接入账('E')分开——支持"出纳建单、财务确认"的职责分离。
  //   原来 create/edit/submit/confirm/cancel 全判 'E'，给了建单权就等于给了确认入账权。
  @Post('contributions')
  @RequireMenu(MENU, 'C')
  createContribution(@Body() dto: CreateShareholderContributionDto) {
    return this.contribSvc.createManual(dto, this.scopedUser);
  }

  /** PATCH /api/v2/finance/shareholders/contributions/:id */
  @Patch('contributions/:id')
  @RequireMenu(MENU, 'E')
  updateContribution(
    @Param('id') id: string,
    @Body() dto: UpdateShareholderContributionDto,
  ) {
    return this.contribSvc.update(id, dto, this.scopedUser);
  }

  /** POST /api/v2/finance/shareholders/contributions/:id/submit-confirm */
  @Post('contributions/:id/submit-confirm')
  @RequireMenu(MENU, 'E')
  @HttpCode(HttpStatus.OK)
  submitConfirm(@Param('id') id: string) {
    return this.contribSvc.submitConfirm(id, this.scopedUser);
  }

  /** POST /api/v2/finance/shareholders/contributions/:id/confirm-direct */
  @Post('contributions/:id/confirm-direct')
  @RequireMenu(MENU, 'E')
  @HttpCode(HttpStatus.OK)
  confirmDirect(
    @Param('id') id: string,
    @Body() dto: ConfirmShareholderContributionDto,
  ) {
    return this.contribSvc.confirmDirect(id, dto, this.scopedUser);
  }

  /** POST /api/v2/finance/shareholders/contributions/:id/cancel */
  @Post('contributions/:id/cancel')
  @RequireMenu(MENU, 'E')
  @HttpCode(HttpStatus.OK)
  cancelContribution(
    @Param('id') id: string,
    @Body() dto: CancelShareholderContributionDto,
  ) {
    return this.contribSvc.cancel(id, dto, this.scopedUser);
  }

  /** POST /api/v2/finance/shareholders/import-from-prc2 */
  @Post('import-from-prc2')
  @RequireMenu(MENU, 'E')
  @HttpCode(HttpStatus.OK)
  importFromPrc2() {
    return this.contribSvc.importFromPrc2(this.scopedUser);
  }

  // ════════════════════════════════════════════════════════════════════════
  // 股东还款/核销
  // ════════════════════════════════════════════════════════════════════════

  /** GET /api/v2/finance/shareholders/settlements */
  @Get('settlements')
  @RequireMenu(MENU, 'V')
  listSettlements(@Query() dto: QueryShareholderSettlementDto) {
    return this.settleSvc.list(dto, this.scopedUser);
  }

  /** GET /api/v2/finance/shareholders/settlements/:id */
  @Get('settlements/:id')
  @RequireMenu(MENU, 'V')
  getSettlement(@Param('id') id: string) {
    return this.settleSvc.findById(id, this.scopedUser);
  }

  /** POST /api/v2/finance/shareholders/settlements */
  @Post('settlements')
  @RequireMenu(MENU, 'E')
  createSettlement(@Body() dto: CreateShareholderSettlementDto) {
    return this.settleSvc.create(dto, this.scopedUser);
  }

  /** POST /api/v2/finance/shareholders/settlements/:id/submit */
  @Post('settlements/:id/submit')
  @RequireMenu(MENU, 'E')
  @HttpCode(HttpStatus.OK)
  submitSettlement(
    @Param('id') id: string,
    @Body() dto: SubmitShareholderSettlementDto,
  ) {
    return this.settleSvc.submit(id, dto, this.scopedUser);
  }

  /** POST /api/v2/finance/shareholders/settlements/:id/approve-direct */
  @Post('settlements/:id/approve-direct')
  @RequireMenu(MENU, 'A')   // H2 修复：审批动作需要 A（Approve）权限，而非 E（Edit）
  @HttpCode(HttpStatus.OK)
  approveDirectSettlement(
    @Param('id') id: string,
    @Body() dto: ApproveShareholderSettlementDto,
  ) {
    return this.settleSvc.approveDirect(id, dto, this.scopedUser);
  }

  /** POST /api/v2/finance/shareholders/settlements/:id/execute */
  @Post('settlements/:id/execute')
  @RequireMenu(MENU, 'E')
  @HttpCode(HttpStatus.OK)
  executeSettlement(@Param('id') id: string) {
    return this.settleSvc.execute(id, this.scopedUser);
  }

  /** POST /api/v2/finance/shareholders/settlements/:id/cancel */
  @Post('settlements/:id/cancel')
  @RequireMenu(MENU, 'E')
  @HttpCode(HttpStatus.OK)
  cancelSettlement(
    @Param('id') id: string,
    @Body() dto: CancelShareholderSettlementDto,
  ) {
    return this.settleSvc.cancel(id, dto, this.scopedUser);
  }
}
