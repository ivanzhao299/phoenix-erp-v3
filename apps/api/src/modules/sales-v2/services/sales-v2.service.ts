import { Injectable } from '@nestjs/common';

/**
 * Sales V2 Service — Phase 0 Clean Baseline
 *
 * Phase 0 仅提供 health 端点。
 * Phase 1+ 将逐步添加 Customer、Price、Order、Delivery 等 Runtime 服务。
 */
@Injectable()
export class SalesV2Service {
  health() {
    return {
      status:  'ok',
      module:  'sales-v2',
      phase:   'phase-0-clean-baseline',
      tables: {
        new_runtime: [
          'sal_channels',
          'sal_customers',
          'sal_price_books',
          'sal_price_items',
          'sal_sales_orders',
          'sal_order_items',
        ],
        legacy_frozen: [
          'ord_customers',    // [LEGACY][READ_ONLY] → sal_customers (Phase 1)
          'b2b_customers',    // [LEGACY][READ_ONLY] → sal_customers (Phase 1)
          'ord_prices',       // [LEGACY][READ_ONLY] → sal_price_books/items (Phase 2)
          'log_dispatch',     // [LEGACY][READ_ONLY] → sal_delivery_orders (Phase 4)
          'log_receipts',     // [LEGACY][READ_ONLY] → sal_receipts (Phase 4)
          'log_routes',       // [LEGACY][READ_ONLY] → sal_routes (Phase 4)
        ],
      },
      dataScope: {
        field:       'company_code',
        legacy:      'store_code (frozen — do not extend)',
        notes:       'All Sales V2 tables use company_code aligned with Finance V2 DataScope',
      },
      financeV2Integration: {
        arRuntime:        'fin_ar_invoices (Finance V2 Phase 2)',
        arReceiptRuntime: 'fin_ar_receipts (Finance V2 Phase 2)',
        deprecated:       'fin_transactions — do NOT write AR here (legacy)',
        activationPhase:  'Sales V2 Phase 3 (Sales Order Runtime)',
      },
      workflowIntegration: {
        platform:         'Workflow 2.0 Phase A-I (Ready)',
        priceApproval:    'SALES_PRICE_APPROVAL — Phase 2',
        creditApproval:   'SALES_CREDIT_APPROVAL — Phase 3',
        returnApproval:   'SALES_RETURN_APPROVAL — Phase 6',
      },
      roadmap: [
        'Phase 0 ✅ Clean Baseline + Legacy Freeze',
        'Phase 1    Customer + Channel Runtime',
        'Phase 2    Price Runtime',
        'Phase 3    Sales Order Runtime',
        'Phase 4    Delivery Runtime',
        'Phase 5    AR Integration + Credit Control',
        'Phase 6    Sales Return Runtime',
        'Phase 7    Egg Inventory Enhancement',
        'Phase 8    Sales Reports',
        'Phase 9    Mobile Sales + Delivery App',
      ],
      timestamp: new Date().toISOString(),
    };
  }
}
