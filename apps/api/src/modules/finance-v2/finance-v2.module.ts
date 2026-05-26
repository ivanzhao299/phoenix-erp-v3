import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinanceV2Controller }  from './controllers/finance-v2.controller';
import { FinApController }      from './controllers/fin-ap.controller';
import { FinArController }      from './controllers/fin-ar.controller';
import { FinCashController }    from './controllers/fin-cash.controller';
import { FinShareholderController } from './controllers/fin-shareholder.controller';
import { ApAdapterService }     from './services/ap-adapter.service';
import { ApInvoicesService }    from './services/ap-invoices.service';
import { ArInvoicesService }    from './services/ar-invoices.service';
import { ArReceiptsService }    from './services/ar-receipts.service';
import { CashAccountsService }  from './services/cash-accounts.service';
import { CashTransactionsService } from './services/cash-transactions.service';
import { FundTransfersService } from './services/fund-transfers.service';
import { ShareholderContributionsService } from './services/shareholder-contributions.service';
import { ShareholderSettlementsService }   from './services/shareholder-settlements.service';
import {
  FinApInvoiceEntity,
  FinArInvoiceEntity,
  FinArReceiptEntity,
  FinArReceiptAllocationEntity,
  FinCashAccountEntity,
  FinCashTransactionEntity,
  FinFundTransferEntity,
  FinShareholderContributionEntity,
  FinShareholderSettlementEntity,
  FinExchangeRateEntity,
} from './entities';

/**
 * Finance V2 Module — Phase 4 Shareholder Runtime
 *
 * Phase 路线图：
 *   Phase 0 — 基线建立：Entity 骨架、API 健康接口、前端页面占位、旧模块废弃       ✅
 *   Phase 1 — AP Runtime：fin_ap_invoices 正式启用                               ✅
 *   Phase 2 — AR Runtime：fin_ar_invoices + fin_ar_receipts + 核销分摊           ✅
 *   Phase 3 — Cash Runtime：fin_cash_accounts + fin_cash_transactions + 转账     ✅
 *   Phase 4 — Shareholder Runtime：fin_shareholder_contributions + settlements   ✅
 *   Phase 5 — Reports：资产负债表 / 利润表 / 现金流量表
 *
 * 设计原则：
 *   - 不引用 fin_transactions / fin_payments / biz_cash_flow（旧表废弃）
 *   - 不修改 Procurement V2 运行逻辑（prc2_* 只读参考）
 *   - OrgModule 为 @Global()，DataScopeHelper 自动注入
 *   - ApprovalEngineModule 为 @Global()，ApprovalEngineService 自动注入
 *
 * AP Runtime（Phase 1）：
 *   FinApController    — /api/v2/finance/ap/* 路由
 *   ApInvoicesService  — fin_ap_invoices CRUD + 状态机 + Aging + Summary + 导入
 *
 * AR Runtime（Phase 2）：
 *   FinArController    — /api/v2/finance/ar/* 路由
 *   ArInvoicesService  — fin_ar_invoices CRUD + 状态机 + Aging + Summary
 *   ArReceiptsService  — fin_ar_receipts 创建/确认/取消 + 核销分摊（事务）
 *
 * Cash Runtime（Phase 3）：
 *   FinCashController      — /api/v2/finance/cash/* 路由
 *   CashAccountsService    — 资金账户台账 CRUD + 状态机 + 余额操作
 *   CashTransactionsService — Append-only 流水账本
 *   FundTransfersService   — 账户间转账（5 状态 + SERIALIZABLE 事务）
 *
 * Shareholder Runtime（Phase 4）：
 *   FinShareholderController         — /api/v2/finance/shareholders/* 路由
 *   ShareholderContributionsService  — 出资台账 CRUD + 状态机 + 审批 + prc2 导入
 *   ShareholderSettlementsService    — 还款/核销（SERIALIZABLE 事务 + 现金账户联动）
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      FinApInvoiceEntity,
      FinArInvoiceEntity,
      FinArReceiptEntity,
      FinArReceiptAllocationEntity,
      FinCashAccountEntity,
      FinCashTransactionEntity,
      FinFundTransferEntity,
      FinShareholderContributionEntity,
      FinShareholderSettlementEntity,
      FinExchangeRateEntity,
    ]),
  ],
  controllers: [
    FinanceV2Controller,
    FinApController,
    FinArController,
    FinCashController,
    FinShareholderController,
  ],
  providers: [
    ApAdapterService, ApInvoicesService,
    ArInvoicesService, ArReceiptsService,
    CashAccountsService, CashTransactionsService, FundTransfersService,
    ShareholderContributionsService, ShareholderSettlementsService,
  ],
  exports: [
    ApAdapterService, ApInvoicesService,
    ArInvoicesService, ArReceiptsService,
    CashAccountsService, CashTransactionsService, FundTransfersService,
    ShareholderContributionsService, ShareholderSettlementsService,
  ],
})
export class FinanceV2Module {}
