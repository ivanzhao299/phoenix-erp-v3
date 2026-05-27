import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesV2Controller }           from './controllers/sales-v2.controller';
import { SalesCustomersController }    from './controllers/sales-customers.controller';
import { SalesChannelsController }     from './controllers/sales-channels.controller';
import { SalesPriceBooksController }   from './controllers/sales-price-books.controller';
import { SalesPriceRuntimeController } from './controllers/sales-price-runtime.controller';
import { SalesOrdersController }       from './controllers/sales-orders.controller';
import { SalesV2Service }        from './services/sales-v2.service';
import { CustomersService }      from './services/customers.service';
import { ChannelsService }       from './services/channels.service';
import { PriceBooksService }     from './services/price-books.service';
import { PriceItemsService }     from './services/price-items.service';
import { PriceRuntimeService }   from './services/price-runtime.service';
import { SalesOrdersService }    from './services/sales-orders.service';
import { FinanceArAdapter }      from './adapters/finance-ar.adapter';
import {
  SalCustomerEntity,
  SalChannelEntity,
  SalPriceBookEntity,
  SalPriceItemEntity,
  SalSalesOrderEntity,
  SalOrderItemEntity,
} from './entities';

/**
 * Sales V2 Module
 *
 * Phase 路线图：
 *   Phase 0 ✅ Clean Baseline + Legacy Freeze
 *   Phase 1 ✅ Customer + Channel Runtime
 *   Phase 2 ✅ Price Runtime（统一定价引擎 + Workflow 审批 + 移动端动态价格）
 *   Phase 3 ✅ Sales Order Runtime（状态机 + Price/Credit/Workflow/AR 联动）
 *   Phase 4    Delivery Runtime：sal_delivery_orders + 时间戳 + 签收
 *   Phase 5    AR Integration + Credit Control
 *   Phase 6    Sales Return Runtime
 *   Phase 7    Egg Inventory Enhancement
 *   Phase 8    Sales Reports Runtime
 *   Phase 9    Mobile Sales + Delivery App
 *
 * 设计原则：
 *   · DataScope 字段：company_code（所有 sal_* 表统一）
 *   · 严禁写 fin_transactions（Finance V2 AR 用 fin_ar_invoices）
 *   · 严禁引用 ord_customers / b2b_customers（旧表冻结）
 *   · ApprovalEngineModule @Global() → ApprovalEngineService 自动注入
 *   · FinanceArAdapter 内置 DataSource 直写 fin_ar_invoices（避免循环依赖）
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
    ]),
  ],
  controllers: [
    SalesV2Controller,
    SalesCustomersController,
    SalesChannelsController,
    SalesPriceBooksController,
    SalesPriceRuntimeController,
    SalesOrdersController,
  ],
  providers: [
    SalesV2Service,
    CustomersService,
    ChannelsService,
    PriceBooksService,
    PriceItemsService,
    PriceRuntimeService,
    SalesOrdersService,
    FinanceArAdapter,
  ],
  exports: [
    SalesV2Service,
    CustomersService,
    ChannelsService,
    PriceBooksService,
    PriceItemsService,
    PriceRuntimeService,
    SalesOrdersService,
    FinanceArAdapter,
  ],
})
export class SalesV2Module {}
