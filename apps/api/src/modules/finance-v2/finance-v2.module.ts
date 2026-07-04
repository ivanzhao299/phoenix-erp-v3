import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChanjetModule } from '../chanjet/chanjet.module';
import { FinanceV2Controller }  from './controllers/finance-v2.controller';
import { FinApController }      from './controllers/fin-ap.controller';
import { FinArController }      from './controllers/fin-ar.controller';
import { FinCashController }    from './controllers/fin-cash.controller';
import { FinShareholderController } from './controllers/fin-shareholder.controller';
import { FinExpenseController }         from './controllers/fin-expense.controller';
import { FinancialReportsController }   from './controllers/financial-reports.controller';
import { FinanceOrderBridgeController } from './controllers/finance-order-bridge.controller';
import { FinArLedgerController }        from './controllers/fin-ar-ledger.controller';
import { FinArReconciliationController } from './controllers/fin-ar-reconciliation.controller';
import { ApAdapterService }     from './services/ap-adapter.service';
import { ApInvoicesService }    from './services/ap-invoices.service';
import { ArInvoicesService }    from './services/ar-invoices.service';
import { ArReceiptsService }    from './services/ar-receipts.service';
import { CashAccountsService }  from './services/cash-accounts.service';
import { CashTransactionsService } from './services/cash-transactions.service';
import { FundTransfersService } from './services/fund-transfers.service';
import { ShareholderContributionsService } from './services/shareholder-contributions.service';
import { ShareholderSettlementsService }   from './services/shareholder-settlements.service';
import { ExpenseRequestsService }          from './services/expense-requests.service';
import { ReimbursementsService }           from './services/reimbursements.service';
import { FinancialReportsService }         from './services/financial-reports.service';
import { ArLedgerService }                 from './services/ar-ledger.service';
import { ArReconciliationService }         from './services/ar-reconciliation.service';
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
  FinExpenseRequestEntity,
  FinReimbursementEntity,
  FinArLedgerEntity,
} from './entities';

/**
 * Finance V2 Module — Phase 6 Financial Reports Runtime
 *
 * Phase 路线图：
 *   Phase 0 — 基线建立：Entity 骨架、API 健康接口、前端页面占位、旧模块废弃       ✅
 *   Phase 1 — AP Runtime：fin_ap_invoices 正式启用                               ✅
 *   Phase 2 — AR Runtime：fin_ar_invoices + fin_ar_receipts + 核销分摊           ✅
 *   Phase 3 — Cash Runtime：fin_cash_accounts + fin_cash_transactions + 转账     ✅
 *   Phase 4 — Shareholder Runtime：fin_shareholder_contributions + settlements   ✅
 *   Phase 5 — Expense Runtime：fin_expense_requests + fin_reimbursements         ✅
 *   Phase 6 — Financial Reports Runtime：经营报表聚合层（12 只读 API）           ✅
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
    ChanjetModule,
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
      FinExpenseRequestEntity,   // Phase 5 Expense Runtime
      FinReimbursementEntity,    // Phase 5 Expense Runtime
      FinArLedgerEntity,         // G41 应收总账
    ]),
  ],
  controllers: [
    FinanceV2Controller,
    FinApController,
    FinArController,
    FinCashController,
    FinShareholderController,
    FinExpenseController,
    FinancialReportsController,
    FinanceOrderBridgeController,
    FinArLedgerController,
    FinArReconciliationController,
  ],
  providers: [
    ApAdapterService, ApInvoicesService,
    ArInvoicesService, ArReceiptsService,
    CashAccountsService, CashTransactionsService, FundTransfersService,
    ShareholderContributionsService, ShareholderSettlementsService,
    ExpenseRequestsService, ReimbursementsService,
    FinancialReportsService,
    ArLedgerService,
    ArReconciliationService,
  ],
  exports: [
    ApAdapterService, ApInvoicesService,
    ArInvoicesService, ArReceiptsService,
    CashAccountsService, CashTransactionsService, FundTransfersService,
    ShareholderContributionsService, ShareholderSettlementsService,
    ExpenseRequestsService, ReimbursementsService,
    FinancialReportsService,
  ],
})
export class FinanceV2Module {}
