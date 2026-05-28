import {
  Controller, Get, Post, Patch, Param, Body, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { MenuGuard, RequireMenu }  from '../../../common/guards/menu.guard';
import { DataScopeGuard }          from '../../org/guards/data-scope.guard';
import { DataScopeContext }         from '../../org/services/data-scope.service';

import { CashAccountsService }    from '../services/cash-accounts.service';
import { CashTransactionsService } from '../services/cash-transactions.service';
import { FundTransfersService }    from '../services/fund-transfers.service';

import {
  CreateCashAccountDto,
  UpdateCashAccountDto,
  QueryCashAccountDto,
  QueryCashTransactionDto,
} from '../dto/cash-account.dto';
import {
  CreateFundTransferDto,
  ApproveFundTransferDto,
  CancelFundTransferDto,
  QueryFundTransferDto,
} from '../dto/fund-transfer.dto';

const MENU = 'MENU_FIN2_CASH';

@Controller('api/v2/finance/cash')
@UseGuards(MenuGuard, DataScopeGuard)
export class FinCashController {
  constructor(
    private readonly accSvc:  CashAccountsService,
    private readonly txnSvc:  CashTransactionsService,
    private readonly tfrSvc:  FundTransfersService,
    private readonly cls:     ClsService,
  ) {}

  private get user() { return this.cls.get('user') as any; }

  /** C2 修复：从 CLS DataScope 构建 enrichedUser，提供正确的 scopeAll 和 companyCodes */
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
  // 资金账户
  // ════════════════════════════════════════════════════════════════════════

  /** GET /api/v2/finance/cash/accounts */
  @Get('accounts')
  @RequireMenu(MENU, 'V')
  listAccounts(@Query() dto: QueryCashAccountDto) {
    return this.accSvc.list(dto, this.scopedUser);
  }

  /** GET /api/v2/finance/cash/accounts/summary */
  @Get('accounts/summary')
  @RequireMenu(MENU, 'V')
  accountSummary() {
    return this.accSvc.getSummary(this.scopedUser);
  }

  /** GET /api/v2/finance/cash/accounts/:id */
  @Get('accounts/:id')
  @RequireMenu(MENU, 'V')
  getAccount(@Param('id') id: string) {
    return this.accSvc.findById(id, this.scopedUser);
  }

  /** POST /api/v2/finance/cash/accounts */
  @Post('accounts')
  @RequireMenu(MENU, 'E')
  async createAccount(@Body() dto: CreateCashAccountDto) {
    const acc = await this.accSvc.create(dto, this.scopedUser);
    // 如果有期初余额，写 OPENING 流水
    if (Number(acc.openingBalance) > 0) {
      await this.txnSvc.writeOpeningBalance({
        accountId: acc.id,
        accountCode: acc.accountCode,
        accountName: acc.accountName,
        companyCode: acc.companyCode,
        companyName: acc.companyName,
        currencyCode: acc.currencyCode,
        amount: Number(acc.openingBalance),
        createdBy: this.user?.username ?? null,
      });
    }
    return acc;
  }

  /** PATCH /api/v2/finance/cash/accounts/:id */
  @Patch('accounts/:id')
  @RequireMenu(MENU, 'E')
  updateAccount(@Param('id') id: string, @Body() dto: UpdateCashAccountDto) {
    return this.accSvc.update(id, dto, this.scopedUser);
  }

  /** POST /api/v2/finance/cash/accounts/:id/freeze */
  @Post('accounts/:id/freeze')
  @RequireMenu(MENU, 'E')
  @HttpCode(HttpStatus.OK)
  freezeAccount(@Param('id') id: string) {
    return this.accSvc.freeze(id, this.scopedUser);
  }

  /** POST /api/v2/finance/cash/accounts/:id/unfreeze */
  @Post('accounts/:id/unfreeze')
  @RequireMenu(MENU, 'E')
  @HttpCode(HttpStatus.OK)
  unfreezeAccount(@Param('id') id: string) {
    return this.accSvc.unfreeze(id, this.scopedUser);
  }

  /** POST /api/v2/finance/cash/accounts/:id/close */
  @Post('accounts/:id/close')
  @RequireMenu(MENU, 'E')
  @HttpCode(HttpStatus.OK)
  closeAccount(@Param('id') id: string) {
    return this.accSvc.close(id, this.scopedUser);
  }

  // ════════════════════════════════════════════════════════════════════════
  // 资金流水
  // ════════════════════════════════════════════════════════════════════════

  /** GET /api/v2/finance/cash/transactions */
  @Get('transactions')
  @RequireMenu(MENU, 'V')
  listTransactions(@Query() dto: QueryCashTransactionDto) {
    // C2 修复：从 CLS DataScope 读取（DataScopeGuard 已写入正确 scope）
    const scope = this.cls.get('dataScope') as DataScopeContext | undefined;
    const companyCodes: string[] | null = (!scope || scope.isGlobal)
      ? null
      : scope.allowedCompanyCodes;
    return this.txnSvc.list(dto, companyCodes);
  }

  // ════════════════════════════════════════════════════════════════════════
  // 资金转账
  // ════════════════════════════════════════════════════════════════════════

  /** GET /api/v2/finance/cash/transfers */
  @Get('transfers')
  @RequireMenu(MENU, 'V')
  listTransfers(@Query() dto: QueryFundTransferDto) {
    return this.tfrSvc.list(dto, this.scopedUser);
  }

  /** GET /api/v2/finance/cash/transfers/:id */
  @Get('transfers/:id')
  @RequireMenu(MENU, 'V')
  getTransfer(@Param('id') id: string) {
    return this.tfrSvc.findById(id, this.scopedUser);
  }

  /** POST /api/v2/finance/cash/transfers */
  @Post('transfers')
  @RequireMenu(MENU, 'E')
  createTransfer(@Body() dto: CreateFundTransferDto) {
    return this.tfrSvc.create(dto, this.scopedUser);
  }

  /** POST /api/v2/finance/cash/transfers/:id/submit */
  @Post('transfers/:id/submit')
  @RequireMenu(MENU, 'E')
  @HttpCode(HttpStatus.OK)
  submitTransfer(@Param('id') id: string) {
    return this.tfrSvc.submit(id, this.scopedUser);
  }

  /** POST /api/v2/finance/cash/transfers/:id/approve */
  @Post('transfers/:id/approve')
  @RequireMenu(MENU, 'A')
  @HttpCode(HttpStatus.OK)
  approveTransfer(@Param('id') id: string, @Body() dto: ApproveFundTransferDto) {
    return this.tfrSvc.approve(id, dto, this.scopedUser);
  }

  /** POST /api/v2/finance/cash/transfers/:id/execute */
  @Post('transfers/:id/execute')
  @RequireMenu(MENU, 'E')
  @HttpCode(HttpStatus.OK)
  executeTransfer(@Param('id') id: string) {
    return this.tfrSvc.execute(id, this.scopedUser);
  }

  /** POST /api/v2/finance/cash/transfers/:id/cancel */
  @Post('transfers/:id/cancel')
  @RequireMenu(MENU, 'E')
  @HttpCode(HttpStatus.OK)
  cancelTransfer(@Param('id') id: string, @Body() dto: CancelFundTransferDto) {
    return this.tfrSvc.cancel(id, dto, this.scopedUser);
  }
}
