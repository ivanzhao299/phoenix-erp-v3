import {
  Controller, Get, Post, Patch, Param, Body, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
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
@UseGuards(MenuGuard)
export class FinShareholderController {
  constructor(
    private readonly contribSvc: ShareholderContributionsService,
    private readonly settleSvc:  ShareholderSettlementsService,
    private readonly cls:        ClsService,
  ) {}

  private get user() { return this.cls.get('user') as any; }

  // ════════════════════════════════════════════════════════════════════════
  // 股东出资
  // ════════════════════════════════════════════════════════════════════════

  /** GET /api/v2/finance/shareholders/contributions */
  @Get('contributions')
  @RequireMenu(MENU, 'V')
  listContributions(@Query() dto: QueryShareholderContributionDto) {
    return this.contribSvc.list(dto, this.user);
  }

  /** GET /api/v2/finance/shareholders/contributions/summary */
  @Get('contributions/summary')
  @RequireMenu(MENU, 'V')
  contributionSummary() {
    return this.contribSvc.getSummary(this.user);
  }

  /** GET /api/v2/finance/shareholders/contributions/:id */
  @Get('contributions/:id')
  @RequireMenu(MENU, 'V')
  getContribution(@Param('id') id: string) {
    return this.contribSvc.findById(id, this.user);
  }

  /** POST /api/v2/finance/shareholders/contributions */
  @Post('contributions')
  @RequireMenu(MENU, 'E')
  createContribution(@Body() dto: CreateShareholderContributionDto) {
    return this.contribSvc.createManual(dto, this.user);
  }

  /** PATCH /api/v2/finance/shareholders/contributions/:id */
  @Patch('contributions/:id')
  @RequireMenu(MENU, 'E')
  updateContribution(
    @Param('id') id: string,
    @Body() dto: UpdateShareholderContributionDto,
  ) {
    return this.contribSvc.update(id, dto, this.user);
  }

  /** POST /api/v2/finance/shareholders/contributions/:id/submit-confirm */
  @Post('contributions/:id/submit-confirm')
  @RequireMenu(MENU, 'E')
  @HttpCode(HttpStatus.OK)
  submitConfirm(@Param('id') id: string) {
    return this.contribSvc.submitConfirm(id, this.user);
  }

  /** POST /api/v2/finance/shareholders/contributions/:id/confirm-direct */
  @Post('contributions/:id/confirm-direct')
  @RequireMenu(MENU, 'E')
  @HttpCode(HttpStatus.OK)
  confirmDirect(
    @Param('id') id: string,
    @Body() dto: ConfirmShareholderContributionDto,
  ) {
    return this.contribSvc.confirmDirect(id, dto, this.user);
  }

  /** POST /api/v2/finance/shareholders/contributions/:id/cancel */
  @Post('contributions/:id/cancel')
  @RequireMenu(MENU, 'E')
  @HttpCode(HttpStatus.OK)
  cancelContribution(
    @Param('id') id: string,
    @Body() dto: CancelShareholderContributionDto,
  ) {
    return this.contribSvc.cancel(id, dto, this.user);
  }

  /** POST /api/v2/finance/shareholders/import-from-prc2 */
  @Post('import-from-prc2')
  @RequireMenu(MENU, 'E')
  @HttpCode(HttpStatus.OK)
  importFromPrc2() {
    return this.contribSvc.importFromPrc2(this.user);
  }

  // ════════════════════════════════════════════════════════════════════════
  // 股东还款/核销
  // ════════════════════════════════════════════════════════════════════════

  /** GET /api/v2/finance/shareholders/settlements */
  @Get('settlements')
  @RequireMenu(MENU, 'V')
  listSettlements(@Query() dto: QueryShareholderSettlementDto) {
    return this.settleSvc.list(dto, this.user);
  }

  /** GET /api/v2/finance/shareholders/settlements/:id */
  @Get('settlements/:id')
  @RequireMenu(MENU, 'V')
  getSettlement(@Param('id') id: string) {
    return this.settleSvc.findById(id, this.user);
  }

  /** POST /api/v2/finance/shareholders/settlements */
  @Post('settlements')
  @RequireMenu(MENU, 'E')
  createSettlement(@Body() dto: CreateShareholderSettlementDto) {
    return this.settleSvc.create(dto, this.user);
  }

  /** POST /api/v2/finance/shareholders/settlements/:id/submit */
  @Post('settlements/:id/submit')
  @RequireMenu(MENU, 'E')
  @HttpCode(HttpStatus.OK)
  submitSettlement(
    @Param('id') id: string,
    @Body() dto: SubmitShareholderSettlementDto,
  ) {
    return this.settleSvc.submit(id, dto, this.user);
  }

  /** POST /api/v2/finance/shareholders/settlements/:id/approve-direct */
  @Post('settlements/:id/approve-direct')
  @RequireMenu(MENU, 'E')
  @HttpCode(HttpStatus.OK)
  approveDirectSettlement(
    @Param('id') id: string,
    @Body() dto: ApproveShareholderSettlementDto,
  ) {
    return this.settleSvc.approveDirect(id, dto, this.user);
  }

  /** POST /api/v2/finance/shareholders/settlements/:id/execute */
  @Post('settlements/:id/execute')
  @RequireMenu(MENU, 'E')
  @HttpCode(HttpStatus.OK)
  executeSettlement(@Param('id') id: string) {
    return this.settleSvc.execute(id, this.user);
  }

  /** POST /api/v2/finance/shareholders/settlements/:id/cancel */
  @Post('settlements/:id/cancel')
  @RequireMenu(MENU, 'E')
  @HttpCode(HttpStatus.OK)
  cancelSettlement(
    @Param('id') id: string,
    @Body() dto: CancelShareholderSettlementDto,
  ) {
    return this.settleSvc.cancel(id, dto, this.user);
  }
}
