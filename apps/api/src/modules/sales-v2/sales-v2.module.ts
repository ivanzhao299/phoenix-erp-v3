import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesV2Controller } from './controllers/sales-v2.controller';
import { SalesV2Service }    from './services/sales-v2.service';
import {
  SalCustomerEntity,
  SalChannelEntity,
  SalPriceBookEntity,
  SalPriceItemEntity,
  SalSalesOrderEntity,
  SalOrderItemEntity,
} from './entities';

/**
 * Sales V2 Module — Phase 0 Clean Baseline
 *
 * Phase 路线图：
 *   Phase 0 — 基线建立：Entity 骨架、Health API、前端占位、Legacy Freeze         ✅
 *   Phase 1 — Customer + Channel Runtime：统一客户主档，DataScope 对齐
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
 *   · 不引用 fin_transactions / ord_customers / b2b_customers（旧表冻结）
 *   · 不修改 Procurement V2 / Finance V2 / Workflow 2.0 现有逻辑
 *   · OrgModule 为 @Global()，DataScopeHelper 自动注入（Phase 1 起启用）
 *   · ApprovalEngineModule 为 @Global()，ApprovalEngineService 自动注入（Phase 2 起启用）
 *
 * Legacy Freeze 清单（Phase 0 建立，不删除，只读）：
 *   ord_customers  → sal_customers  (Phase 1)
 *   b2b_customers  → sal_customers  (Phase 1)
 *   ord_prices     → sal_price_books / sal_price_items (Phase 2)
 *   log_dispatch   → sal_delivery_orders (Phase 4)
 *   log_receipts   → sal_receipts (Phase 4)
 *   log_routes     → sal_routes (Phase 4)
 *
 * fin_transactions AR 写入路径（order.service.ts:245）：
 *   已标注 TODO — Phase 3 切换至 fin_ar_invoices（Finance V2 AR Runtime）
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
  controllers: [SalesV2Controller],
  providers:   [SalesV2Service],
  exports:     [SalesV2Service],
})
export class SalesV2Module {}
