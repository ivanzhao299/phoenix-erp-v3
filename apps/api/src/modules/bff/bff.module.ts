import { Module } from '@nestjs/common';
import {
  DashboardBffController,
  UsersBffController,
  AnalyticsBffController,
  AuditBffController,
  PricingBffController,
  WholesaleBffController,
  PackagingTerminalBffController,
} from './bff.controller';
import { SalesV2Module } from '../sales-v2/sales-v2.module'; // P1C：包装收口 → 真实车间流接入库存生成

/**
 * BFF Module — Backend For Frontend
 * 统一聚合前端所需的跨模块路由，所有控制器直接使用 EntityManager，无需额外 Service 层
 */
@Module({
  imports: [SalesV2Module], // P1C：注入 PackagingInventoryIntegrationService（单向依赖，无循环）
  controllers: [
    DashboardBffController,
    UsersBffController,
    AnalyticsBffController,
    AuditBffController,
    PricingBffController,
    WholesaleBffController,
    PackagingTerminalBffController,
  ],
})
export class BffModule {}
