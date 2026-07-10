import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, Req,
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
  ReassignTransactionDto,
} from '../dto/cash-account.dto';
import {
  CreateFundTransferDto,
  ApproveFundTransferDto,
  CancelFundTransferDto,
  QueryFundTransferDto,
} from '../dto/fund-transfer.dto';

// G35 父子菜单粒度治理：17 endpoint 按子菜单细分（替代旧 MENU_FIN2_CASH 父菜单）
const MENU_VIEW     = 'MENU_FIN2_CASH_VIEW';      // 账户列表/详情/汇总
const MENU_MASTER   = 'MENU_FIN2_CASH_MASTER';    // 账户主档（建/改/冻/关）
const MENU_TXN      = 'MENU_FIN2_CASH_TXN';       // 流水（查/录）
const MENU_TRANSFER = 'MENU_FIN2_CASH_TRANSFER';  // 资金转账（查/建/审/执/撤）
const MENU_ACCOUNT_CREATE = 'MENU_MD_CASH_ACCOUNT'; // 账户建档归敏感主数据权限，不继承财务运行时权限

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
  @RequireMenu(MENU_VIEW, 'V')
  listAccounts(@Query() dto: QueryCashAccountDto) {
    return this.accSvc.list(dto, this.scopedUser);
  }

  /** GET /api/v2/finance/cash/accounts/summary */
  @Get('accounts/summary')
  @RequireMenu(MENU_VIEW, 'V')
  accountSummary() {
    return this.accSvc.getSummary(this.scopedUser);
  }

  /** GET /api/v2/finance/cash/accounts/:id */
  @Get('accounts/:id')
  @RequireMenu(MENU_VIEW, 'V')
  getAccount(@Param('id') id: string) {
    return this.accSvc.findById(id, this.scopedUser);
  }

  /** POST /api/v2/finance/cash/accounts */
  @Post('accounts')
  @RequireMenu(MENU_ACCOUNT_CREATE, 'C', undefined, '当前角色无权限新建账户')
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
  @RequireMenu(MENU_MASTER, 'E')
  updateAccount(@Param('id') id: string, @Body() dto: UpdateCashAccountDto) {
    return this.accSvc.update(id, dto, this.scopedUser);
  }

  /**
   * POST /api/v2/finance/cash/accounts/:id/recompute
   * 重算账户余额：按 期初 + Σ签名流水 重建 balance_after 链与 current_balance。
   * 初始数据导入(直灌流水未更新余额)后用于对齐账实。
   */
  @Post('accounts/:id/recompute')
  @RequireMenu(MENU_MASTER, 'E')
  @HttpCode(HttpStatus.OK)
  recomputeAccount(@Param('id') id: string) {
    return this.accSvc.recalcBalance(id, this.scopedUser);
  }

  /** POST /api/v2/finance/cash/accounts/:id/freeze */
  @Post('accounts/:id/freeze')
  @RequireMenu(MENU_MASTER, 'E')
  @HttpCode(HttpStatus.OK)
  freezeAccount(@Param('id') id: string) {
    return this.accSvc.freeze(id, this.scopedUser);
  }

  /** POST /api/v2/finance/cash/accounts/:id/unfreeze */
  @Post('accounts/:id/unfreeze')
  @RequireMenu(MENU_MASTER, 'E')
  @HttpCode(HttpStatus.OK)
  unfreezeAccount(@Param('id') id: string) {
    return this.accSvc.unfreeze(id, this.scopedUser);
  }

  /** POST /api/v2/finance/cash/accounts/:id/close */
  @Post('accounts/:id/close')
  @RequireMenu(MENU_MASTER, 'E')
  @HttpCode(HttpStatus.OK)
  closeAccount(@Param('id') id: string) {
    return this.accSvc.close(id, this.scopedUser);
  }

  // ════════════════════════════════════════════════════════════════════════
  // 资金流水
  // ════════════════════════════════════════════════════════════════════════

  /** GET /api/v2/finance/cash/transactions */
  @Get('transactions')
  @RequireMenu(MENU_TXN, 'V')
  listTransactions(@Query() dto: QueryCashTransactionDto) {
    // C2 修复：从 CLS DataScope 读取（DataScopeGuard 已写入正确 scope）
    const scope = this.cls.get('dataScope') as DataScopeContext | undefined;
    const companyCodes: string[] | null = (!scope || scope.isGlobal)
      ? null
      : scope.allowedCompanyCodes;
    return this.txnSvc.list(dto, companyCodes);
  }

  /**
   * POST /api/v2/finance/cash/transactions/manual
   *
   * 手工录入零散现金流水（出纳角色用）。
   * 不走 AR/AP 业务单据，直接写 fin_cash_transactions。
   * G35：需要 MENU_FIN2_CASH_TXN:C
   */
  @Post('transactions/manual')
  @RequireMenu(MENU_TXN, 'C')
  async createManualTransaction(@Body() body: any, @Req() req: any) {
    const userId = req?.user?.userId || req?.user?.id;
    const username = req?.user?.username || 'unknown';
    return this.txnSvc.createManual(body, userId, username);
  }

  /**
   * PATCH /api/v2/finance/cash/transactions/:id/reassign
   * 流水改挂账户：把挂错账户的流水迁移到正确账户并重算两边余额。
   * 属账户主档级修正，需 MENU_FIN2_CASH_MASTER:E。
   */
  @Patch('transactions/:id/reassign')
  @RequireMenu(MENU_MASTER, 'E')
  reassignTransaction(@Param('id') id: string, @Body() dto: ReassignTransactionDto) {
    return this.accSvc.reassignTransaction(id, dto.targetAccountId, this.scopedUser);
  }

  /**
   * PATCH /api/v2/finance/cash/transactions/:id  — 修改手工流水（金额/方向/日期/摘要）。
   *   G103：仅 source_type='MANUAL' 可改，改后重算余额链。需 MENU_FIN2_CASH_TXN:E。
   */
  @Patch('transactions/:id')
  @RequireMenu(MENU_TXN, 'E')
  editTransaction(@Param('id') id: string, @Body() body: any) {
    return this.accSvc.editManualTransaction(id, body, this.scopedUser);
  }

  /**
   * DELETE /api/v2/finance/cash/transactions/:id  — 删除手工流水（修正错误录入）。
   *   G103：仅 source_type='MANUAL' 可删，删后重算余额链。需 MENU_FIN2_CASH_TXN:D。
   */
  @Delete('transactions/:id')
  @RequireMenu(MENU_TXN, 'D')
  deleteTransaction(@Param('id') id: string) {
    return this.accSvc.deleteManualTransaction(id, this.scopedUser);
  }

  /**
   * POST /api/v2/finance/cash/transactions/bulk-delete — 批量删除无源单据流水（初始化对齐）。
   *   放开"仅 MANUAL"铁律为"source_id 为空可删"（手工/期初/导入）；业务单据流水(有源单据)仍保护。
   *   删后重算受影响账户余额链。需 MENU_FIN2_CASH_TXN:D。
   */
  @Post('transactions/bulk-delete')
  @RequireMenu(MENU_TXN, 'D')
  @HttpCode(HttpStatus.OK)
  bulkDeleteTransactions(@Body() body: { ids: string[] }) {
    return this.accSvc.bulkDeleteTransactions(body?.ids ?? [], this.scopedUser);
  }

  // ════════════════════════════════════════════════════════════════════════
  // 资金转账
  // ════════════════════════════════════════════════════════════════════════

  /** GET /api/v2/finance/cash/transfers */
  @Get('transfers')
  @RequireMenu(MENU_TRANSFER, 'V')
  listTransfers(@Query() dto: QueryFundTransferDto) {
    return this.tfrSvc.list(dto, this.scopedUser);
  }

  /** GET /api/v2/finance/cash/transfers/:id */
  @Get('transfers/:id')
  @RequireMenu(MENU_TRANSFER, 'V')
  getTransfer(@Param('id') id: string) {
    return this.tfrSvc.findById(id, this.scopedUser);
  }

  /** POST /api/v2/finance/cash/transfers */
  @Post('transfers')
  @RequireMenu(MENU_TRANSFER, 'C')
  createTransfer(@Body() dto: CreateFundTransferDto) {
    return this.tfrSvc.create(dto, this.scopedUser);
  }

  /** POST /api/v2/finance/cash/transfers/:id/submit */
  @Post('transfers/:id/submit')
  @RequireMenu(MENU_TRANSFER, 'E')
  @HttpCode(HttpStatus.OK)
  submitTransfer(@Param('id') id: string) {
    return this.tfrSvc.submit(id, this.scopedUser);
  }

  /** POST /api/v2/finance/cash/transfers/:id/approve */
  @Post('transfers/:id/approve')
  @RequireMenu(MENU_TRANSFER, 'A')
  @HttpCode(HttpStatus.OK)
  approveTransfer(@Param('id') id: string, @Body() dto: ApproveFundTransferDto) {
    return this.tfrSvc.approve(id, dto, this.scopedUser);
  }

  /** POST /api/v2/finance/cash/transfers/:id/execute */
  @Post('transfers/:id/execute')
  @RequireMenu(MENU_TRANSFER, 'E')
  @HttpCode(HttpStatus.OK)
  executeTransfer(@Param('id') id: string) {
    return this.tfrSvc.execute(id, this.scopedUser);
  }

  /** POST /api/v2/finance/cash/transfers/:id/cancel */
  @Post('transfers/:id/cancel')
  @RequireMenu(MENU_TRANSFER, 'E')
  @HttpCode(HttpStatus.OK)
  cancelTransfer(@Param('id') id: string, @Body() dto: CancelFundTransferDto) {
    return this.tfrSvc.cancel(id, dto, this.scopedUser);
  }
}
