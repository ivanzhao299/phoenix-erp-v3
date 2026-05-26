import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinanceV2Controller } from './controllers/finance-v2.controller';
import { FinApController }     from './controllers/fin-ap.controller';
import { ApAdapterService }    from './services/ap-adapter.service';
import { ApInvoicesService }   from './services/ap-invoices.service';
import {
  FinApInvoiceEntity,
  FinArInvoiceEntity,
  FinCashAccountEntity,
  FinCashTransactionEntity,
  FinShareholderContributionEntity,
  FinExchangeRateEntity,
} from './entities';

/**
 * Finance V2 Module — Phase 1 AP Runtime
 *
 * Phase 路线图：
 *   Phase 0 — 基线建立：Entity 骨架、API 健康接口、前端页面占位、旧模块废弃  ✅
 *   Phase 1 — AP Runtime：fin_ap_invoices 正式启用，替代 prc2_ap_ledger 适配层  ✅
 *   Phase 2 — AR Runtime：fin_ar_invoices + fin_ar_receipts
 *   Phase 3 — Cash Runtime：fin_cash_accounts + fin_cash_transactions
 *   Phase 4 — Shareholder Runtime：fin_shareholder_contributions + fin_shareholder_settlements
 *   Phase 5 — Reports：资产负债表 / 利润表 / 现金流量表
 *
 * 设计原则：
 *   - 不引用 fin_transactions / fin_payments / biz_cash_flow（旧表废弃）
 *   - 不修改 Procurement V2 运行逻辑（prc2_* 只读参考）
 *   - OrgModule 为 @Global()，DataScopeHelper 自动注入
 *   - ApprovalEngineModule 为 @Global()，Phase 1+ 直接接入
 *
 * AP Runtime（Phase 1）：
 *   FinApController    — /api/v2/finance/ap/* 路由
 *   ApInvoicesService  — fin_ap_invoices CRUD + 状态机 + Aging + Summary + 导入
 *   ApAdapterService   — prc2_ap_ledger 只读适配（legacy-source 接口保留）
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      FinApInvoiceEntity,
      FinArInvoiceEntity,
      FinCashAccountEntity,
      FinCashTransactionEntity,
      FinShareholderContributionEntity,
      FinExchangeRateEntity,
    ]),
  ],
  controllers: [FinanceV2Controller, FinApController],
  providers:   [ApAdapterService, ApInvoicesService],
  exports:     [ApAdapterService, ApInvoicesService],
})
export class FinanceV2Module {}
