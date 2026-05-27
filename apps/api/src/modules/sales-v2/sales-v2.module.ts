import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesV2Controller }          from './controllers/sales-v2.controller';
import { SalesCustomersController }   from './controllers/sales-customers.controller';
import { SalesChannelsController }    from './controllers/sales-channels.controller';
import { SalesPriceBooksController }  from './controllers/sales-price-books.controller';
import { SalesPriceRuntimeController } from './controllers/sales-price-runtime.controller';
import { SalesV2Service }       from './services/sales-v2.service';
import { CustomersService }     from './services/customers.service';
import { ChannelsService }      from './services/channels.service';
import { PriceBooksService }    from './services/price-books.service';
import { PriceItemsService }    from './services/price-items.service';
import { PriceRuntimeService }  from './services/price-runtime.service';
import {
  SalCustomerEntity,
  SalChannelEntity,
  SalPriceBookEntity,
  SalPriceItemEntity,
  SalSalesOrderEntity,
  SalOrderItemEntity,
} from './entities';

/**
 * Sales V2 Module — Phase 1 Customer + Channel Runtime
 *
 * Phase 路线图：
 *   Phase 0 — 基线建立：Entity 骨架、Health API、前端占位、Legacy Freeze         ✅
 *   Phase 1 — Customer + Channel Runtime：统一客户主档，DataScope 对齐           ✅
 *   Phase 2 — Price Runtime：统一定价引擎，Workflow 价格审批，移动端动态价格       ✅
 *   Phase 2 — Price Runtime：统一定价引擎，接入 Workflow 2.0 价格审批
 *   Phase 3 — Sales Order Runtime：状态机、AR 联动（fin_ar_invoices）、Workflow 审批
 *   Phase 4 — Delivery Runtime：sal_delivery_orders + 时间戳 + 订单 FK
 *   Phase 5 — AR Integration + Credit Control：欠款账龄、账期逾期冻结下单
 *   Phase 6 — Sales Return Runtime：退货 + Credit Note + 库存回退
 *   Phase 7 — Egg Inventory Enhancement：inv_batches 补 grade/packaging/production_date
 *   Phase 8 — Sales Reports Runtime：日报/欠款账龄/渠道销量/价格异常
 *   Phase 9 — Mobile Sales + Delivery App：动态定价、移动端签收重构
 *
 * 设计原则：
 *   · DataScope 字段：company_code（所有 sal_* 表统一）
 *   · 不引用 fin_transactions / ord_customers / b2b_customers（旧表冻结）
 *   · 不修改 Procurement V2 / Finance V2 / Workflow 2.0 现有逻辑
 *   · OrgModule 为 @Global()，DataScopeHelper 自动注入
 *   · ApprovalEngineModule 为 @Global()，ApprovalEngineService Phase 2 起启用
 *
 * Phase 1 API：
 *   SalesCustomersController — /api/v2/sales/customers/*
 *     GET    /                    列表（DataScope 过滤）
 *     GET    /:id                 详情
 *     POST   /                    新建
 *     PATCH  /:id                 更新
 *     POST   /:id/freeze          冻结
 *     POST   /:id/activate        解冻
 *     POST   /:id/blacklist       黑名单（需 A 权限）
 *     PATCH  /:id/credit-limit    调整信用额度
 *     GET    /:id/credit-snapshot 信用快照（含 fin_ar_invoices 欠款）
 *
 *   SalesChannelsController — /api/v2/sales/channels/*
 *     GET    /                    列表
 *     GET    /:id                 详情
 *     POST   /                    新建
 *     PATCH  /:id                 更新
 *     POST   /:id/activate        启用
 *     POST   /:id/deactivate      停用
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
  ],
  providers: [
    SalesV2Service,
    CustomersService,
    ChannelsService,
    PriceBooksService,
    PriceItemsService,
    PriceRuntimeService,
  ],
  exports: [
    SalesV2Service,
    CustomersService,
    ChannelsService,
    PriceBooksService,
    PriceItemsService,
    PriceRuntimeService,
  ],
})
export class SalesV2Module {}
