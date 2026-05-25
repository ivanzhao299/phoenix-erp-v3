import {
  Controller, Get, Post, Patch, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { DataScopeGuard } from '../../../modules/org/guards/data-scope.guard';

import { PaymentsService }          from '../services/payments.service';
import { CreatePaymentDto }         from '../dto/create-payment.dto';
import { UpdatePaymentDto }         from '../dto/update-payment.dto';
import { QueryPaymentDto }          from '../dto/query-payment.dto';
import { SubmitPaymentDto }         from '../dto/submit-payment.dto';
import { ApprovePaymentDto }        from '../dto/approve-payment.dto';
import { PayPaymentDto }            from '../dto/pay-payment.dto';
import { CancelPaymentDto }         from '../dto/cancel-payment.dto';
import { QueryShareholderFundsDto } from '../dto/query-shareholder-funds.dto';

@Controller('api/v2/procurement')
@UseGuards(MenuGuard, DataScopeGuard)
export class PaymentsController {
  constructor(private readonly svc: PaymentsService) {}

  // ── 付款主流程 ─────────────────────────────────────────────────────────────

  @Get('payments')
  @RequireMenu('MENU_PRC2_PAYMENT', 'V')
  list(@Query() q: QueryPaymentDto) { return this.svc.list(q); }

  @Get('payments/:id')
  @RequireMenu('MENU_PRC2_PAYMENT', 'V')
  findById(@Param('id') id: string) { return this.svc.findById(id); }

  @Get('payments/:id/allocations')
  @RequireMenu('MENU_PRC2_PAYMENT', 'V')
  getAllocations(@Param('id') id: string) { return this.svc.getAllocations(id); }

  @Post('payments')
  @RequireMenu('MENU_PRC2_PAYMENT', 'C')
  create(@Body() dto: CreatePaymentDto) { return this.svc.create(dto); }

  @Patch('payments/:id')
  @RequireMenu('MENU_PRC2_PAYMENT', 'E')
  update(@Param('id') id: string, @Body() dto: UpdatePaymentDto) { return this.svc.update(id, dto); }

  @Post('payments/:id/submit')
  @RequireMenu('MENU_PRC2_PAYMENT', 'E')
  submit(@Param('id') id: string, @Body() dto: SubmitPaymentDto) { return this.svc.submit(id, dto); }

  @Post('payments/:id/approve')
  @RequireMenu('MENU_PRC2_PAYMENT', 'A')
  approve(@Param('id') id: string, @Body() dto: ApprovePaymentDto) { return this.svc.approve(id, dto); }

  @Post('payments/:id/pay')
  @RequireMenu('MENU_PRC2_PAYMENT', 'A')
  pay(@Param('id') id: string, @Body() dto: PayPaymentDto) { return this.svc.pay(id, dto); }

  @Post('payments/:id/cancel')
  @RequireMenu('MENU_PRC2_PAYMENT', 'E')
  cancel(@Param('id') id: string, @Body() dto: CancelPaymentDto) { return this.svc.cancel(id, dto); }

  // ── AP 台账（未核销，用于付款选择） ───────────────────────────────────────

  @Get('ap-ledger/open')
  @RequireMenu('MENU_PRC2_PAYMENT', 'V')
  listOpenAp(
    @Query('companyCode')  companyCode?:  string,
    @Query('supplierCode') supplierCode?: string,
    @Query('projectCode')  projectCode?:  string,
    @Query('keyword')      keyword?:      string,
  ) {
    return this.svc.listOpenAp(companyCode, supplierCode, projectCode, keyword);
  }

  // ── 股东资金池 ────────────────────────────────────────────────────────────

  @Get('shareholder-funds')
  @RequireMenu('MENU_PRC2_FUND', 'V')
  listFunds(@Query() q: QueryShareholderFundsDto) { return this.svc.listShareholderFunds(q); }
}
