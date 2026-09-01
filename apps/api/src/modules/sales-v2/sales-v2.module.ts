import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesV2Controller }           from './controllers/sales-v2.controller';
import { SalesCustomersController }    from './controllers/sales-customers.controller';
import { SalesChannelsController }     from './controllers/sales-channels.controller';
import { SalesPriceBooksController }   from './controllers/sales-price-books.controller';
import { SalesPriceRuntimeController } from './controllers/sales-price-runtime.controller';
import { SalesOrdersController }       from './controllers/sales-orders.controller';
import { DeliveryOrdersController }    from './controllers/delivery-orders.controller';
import { CustomerCreditController }    from './controllers/customer-credit.controller';  // Phase 5
import { SalesReturnsController }      from './controllers/sales-returns.controller';    // Phase 6
import { EggInventoryController }      from './controllers/egg-inventory.controller';    // Phase 7
import { InventorySourceController }   from './controllers/inventory-source.controller'; // 库存来源模式 P1A
import { SalesAnalyticsController }   from './controllers/sales-analytics.controller';  // Phase 8
import { MobileDeliveryController }   from './controllers/mobile-delivery.controller';   // Mobile
import { SalesV2Service }                    from './services/sales-v2.service';
import { CustomersService }                  from './services/customers.service';
import { ChannelsService }                   from './services/channels.service';
import { PriceBooksService }                 from './services/price-books.service';
import { PriceItemsService }                 from './services/price-items.service';
import { PriceRuntimeService }               from './services/price-runtime.service';
import { SalesOrdersService }                from './services/sales-orders.service';
import { SalesOrderLifecycleService }        from './services/sales-order-lifecycle.service';
import { DeliveryOrdersService }             from './services/delivery-orders.service';
import { ReceiptsService }                   from './services/receipts.service';
import { CustomerCreditService }             from './services/customer-credit.service';            // Phase 5
import { CustomerCreditSchedulerService }    from './services/customer-credit-scheduler.service'; // Phase 5
import { ReturnOrdersService }               from './services/return-orders.service';             // Phase 6
import { EggInventoryService }               from './services/egg-inventory.service';              // Phase 7
import { EggInventorySchedulerService }      from './services/egg-inventory-scheduler.service';   // Phase 7
import { PackagingInventoryIntegrationService } from './services/packaging-inventory-integration.service'; // 生产链路收口 Phase 1
import { InventorySourceModeService }        from './services/inventory-source-mode.service';        // 库存来源模式 P1A
import { ProductionInboundService }          from './services/production-inbound.service';           // 库存来源模式 P1A
import { SalesAnalyticsService }             from './services/sales-analytics.service';            // Phase 8
import { FinanceArAdapter }                  from './adapters/finance-ar.adapter';
import { FinanceCreditNoteAdapter }          from './adapters/finance-credit-note.adapter';       // Phase 6
import {
  SalCustomerEntity,
  SalChannelEntity,
  SalPriceBookEntity,
  SalPriceItemEntity,
  SalSalesOrderEntity,
  SalOrderItemEntity,
  // Phase 4 — Delivery Runtime
  SalDriverEntity,
  SalVehicleEntity,
  SalDeliveryOrderEntity,
  SalDeliveryOrderItemEntity,
  SalReceiptEntity,
  // Phase 6 — Return Runtime
  SalReturnOrderEntity,
  SalReturnItemEntity,
} from './entities';

/**
 * Sales V2 Module
 *
 * Phase 路线图：
 *   Phase 0 ✅ Clean Baseline + Legacy Freeze
 *   Phase 1 ✅ Customer + Channel Runtime
 *   Phase 2 ✅ Price Runtime（统一定价引擎 + Workflow 审批 + 移动端动态价格）
 *   Phase 3 ✅ Sales Order Runtime（状态机 + Price/Credit/Workflow/AR 联动）
 *   Phase 4 ✅ Delivery Runtime：sal_delivery_orders + 时间戳 + 签收
 *   Phase 5 ✅ Credit Control：CustomerCreditService + Scheduler + 信用联动
 *   Phase 6 ✅ Sales Return Runtime：退货状态机 + 质检 + 回库 + AR Credit Note
 *   Phase 7 ✅ Egg Inventory Enhancement（FIFO + Scheduler + 批次 Dashboard）
 *   Phase 8 ✅ Analytics Runtime（销量/渠道/价格异常/配送/退货/库存/信用 11维分析）
 *   Phase 8    Sales Reports Runtime
 *   Phase 9    Mobile Sales + Delivery App
 *
 * 设计原则：
 *   · DataScope 字段：company_code（所有 sal_* 表统一）
 *   · 严禁写 fin_transactions（Finance V2 AR 用 fin_ar_invoices）
 *   · 严禁引用 ord_customers / b2b_customers（旧表冻结）
 *   · ApprovalEngineModule @Global() → ApprovalEngineService 自动注入
 *   · FinanceArAdapter 内置 DataSource 直写 fin_ar_invoices（避免循环依赖）
 *   · FinanceCreditNoteAdapter 同上（Credit Note 负数 AR）
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      SalCustomerEntity,
      SalChannelEntity,
      SalPriceBookEntity,
      SalPriceItemEntity,
      SalSalesOrderEntity,
      SalOrderItemEntity,
      // Phase 4 — Delivery Runtime
      SalDriverEntity,
      SalVehicleEntity,
      SalDeliveryOrderEntity,
      SalDeliveryOrderItemEntity,
      SalReceiptEntity,
      // Phase 6 — Return Runtime
      SalReturnOrderEntity,
      SalReturnItemEntity,
    ]),
  ],
  controllers: [
    SalesV2Controller,
    SalesCustomersController,
    SalesChannelsController,
    SalesPriceBooksController,
    SalesPriceRuntimeController,
    SalesOrdersController,
    DeliveryOrdersController,    // Phase 4
    CustomerCreditController,    // Phase 5
    SalesReturnsController,      // Phase 6
    EggInventoryController,      // Phase 7
    InventorySourceController,   // 库存来源模式 P1A
    SalesAnalyticsController,    // Phase 8
    MobileDeliveryController,    // Mobile
  ],
  providers: [
    SalesV2Service,
    CustomersService,
    ChannelsService,
    PriceBooksService,
    PriceItemsService,
    PriceRuntimeService,
    SalesOrdersService,
    SalesOrderLifecycleService,
    DeliveryOrdersService,                // Phase 4
    ReceiptsService,                      // Phase 4
    CustomerCreditService,                // Phase 5
    CustomerCreditSchedulerService,       // Phase 5
    ReturnOrdersService,                  // Phase 6
    EggInventoryService,                  // Phase 7
    EggInventorySchedulerService,         // Phase 7
    PackagingInventoryIntegrationService, // 生产链路收口 Phase 1
    InventorySourceModeService,           // 库存来源模式 P1A
    ProductionInboundService,             // 库存来源模式 P1A
    SalesAnalyticsService,                // Phase 8
    FinanceArAdapter,
    FinanceCreditNoteAdapter,             // Phase 6
  ],
  exports: [
    SalesV2Service,
    CustomersService,
    ChannelsService,
    PriceBooksService,
    PriceItemsService,
    PriceRuntimeService,
    SalesOrdersService,
    SalesOrderLifecycleService,
    DeliveryOrdersService,                // Phase 4
    ReceiptsService,                      // Phase 4
    CustomerCreditService,                // Phase 5
    CustomerCreditSchedulerService,       // Phase 5
    ReturnOrdersService,                  // Phase 6
    EggInventoryService,                  // Phase 7
    EggInventorySchedulerService,         // Phase 7
    PackagingInventoryIntegrationService, // 生产链路收口 Phase 1
    InventorySourceModeService,           // 库存来源模式 P1A
    ProductionInboundService,             // 库存来源模式 P1A
    SalesAnalyticsService,                // Phase 8
    FinanceArAdapter,
    FinanceCreditNoteAdapter,             // Phase 6
  ],
})
export class SalesV2Module {}
