import { Module } from '@nestjs/common';
import { FinanceV2Controller } from './controllers/finance-v2.controller';
import { ApAdapterService }    from './services/ap-adapter.service';

/**
 * Finance V2 Module — Phase 0 Baseline
 *
 * Phase 0 职责：
 *   - 暴露过渡层 AP 只读接口（读取 prc2_ap_ledger）
 *   - 提供 Dashboard 汇总
 *   - 所有接口走 MenuGuard（MENU_FIN2_* 权限体系）
 *
 * 后续 Phase：
 *   Phase 1 — AP Runtime（fin_ap_invoices, fin_ap_payments）
 *   Phase 2 — AR Runtime（fin_ar_invoices, fin_ar_receipts）
 *   Phase 3 — Cash Account Center（fin_cash_accounts）
 *   Phase 4 — Expense + Reimbursement（fin_expense_requests）
 *   Phase 5 — Budget Runtime（fin_budgets）
 *
 * 依赖说明：
 *   - OrgModule 为 @Global()，DataScopeHelper 自动注入，无需 import
 *   - ApprovalEngineModule 为 @Global()，Phase 1+ 接入 ApprovalEngine 无需额外 import
 *   - ClsService 由 CLS 全局提供
 */
@Module({
  imports:     [],
  controllers: [FinanceV2Controller],
  providers:   [ApAdapterService],
  exports:     [ApAdapterService],
})
export class FinanceV2Module {}
