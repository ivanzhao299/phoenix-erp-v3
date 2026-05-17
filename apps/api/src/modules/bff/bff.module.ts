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

/**
 * BFF Module — Backend For Frontend
 * 统一聚合前端所需的跨模块路由，所有控制器直接使用 EntityManager，无需额外 Service 层
 */
@Module({
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
